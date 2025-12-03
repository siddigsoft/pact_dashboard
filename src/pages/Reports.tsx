import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  Download,
  ChevronDown,
  BarChart4,
  FileSpreadsheet,
  FileBarChart,
  FileDown,
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Shield,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { endOfDay, format, startOfDay } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { DatePickerWithRange } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import {
  generateSiteVisitsPDF,
  generateProjectBudgetPDF,
  generateMMPProgressPDF,
  generateTeamPerformancePDF,
} from "@/utils/pdfReportGenerator";
import ReportChart, {
  generateSiteVisitsChartData,
  generateProjectBudgetChartData,
  generateMMPProgressChartData,
  generateTeamPerformanceChartData,
} from "@/components/reports/ReportChart";
import { useAuthorization } from "@/hooks/use-authorization";
import { useUserProjects } from "@/hooks/useUserProjects";
import { ExecutiveDashboard } from "@/components/reports/ExecutiveDashboard";
import { FinancialReports } from "@/components/reports/FinancialReports";
import { AnalyticsReports } from "@/components/reports/AnalyticsReports";
import { ProjectCostReports } from "@/components/reports/ProjectCostReports";
import { AuditingReports } from "@/components/reports/AuditingReports";

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState("executive");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const { userProjectIds, isAdminOrSuperUser } = useUserProjects();
  const canAccess = checkPermission('reports', 'read') || hasAnyRole(['admin']);
  if (!canAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Access Denied</CardTitle>
            <CardDescription>
              You don't have permission to access this page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => navigate('/dashboard')}
              className="w-full"
            >
              Return to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteVisits, setSiteVisits] = useState<any[]>([]);
  const [mmpFiles, setMmpFiles] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [chartCanvas, setChartCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Project-filtered data: filter by user's project membership (admin bypass)
  const filteredProjects = useMemo(() => {
    if (isAdminOrSuperUser) return projects;
    return projects.filter(project => userProjectIds.includes(project.id));
  }, [projects, userProjectIds, isAdminOrSuperUser]);

  const filteredMmpFiles = useMemo(() => {
    if (isAdminOrSuperUser) return mmpFiles;
    return mmpFiles.filter(mmp => mmp.project_id && userProjectIds.includes(mmp.project_id));
  }, [mmpFiles, userProjectIds, isAdminOrSuperUser]);

  const filteredSiteVisits = useMemo(() => {
    if (isAdminOrSuperUser) return siteVisits;
    // Build set of MMP IDs that belong to user's projects
    const userProjectMmpIds = new Set(
      filteredMmpFiles.map(mmp => mmp.id)
    );
    // Filter site visits by MMP project membership
    return siteVisits.filter(visit => {
      if (!visit.mmp_file_id) return false;
      return userProjectMmpIds.has(visit.mmp_file_id);
    });
  }, [siteVisits, filteredMmpFiles, isAdminOrSuperUser]);

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        let svQuery = supabase.from("mmp_site_entries").select("*");
        let mmpQuery = supabase.from("mmp_files").select("*");
        let projQuery = supabase.from("projects").select("*");
        let profQuery = supabase.from("profiles").select("id, full_name, role, email");

        if (dateRange?.from) {
          const from = startOfDay(dateRange.from).toISOString();
          svQuery = svQuery.gte("visit_date", from);
          mmpQuery = mmpQuery.gte("created_at", from);
          projQuery = projQuery.gte("created_at", from);
        }
        if (dateRange?.to) {
          const to = endOfDay(dateRange.to).toISOString();
          svQuery = svQuery.lte("visit_date", to);
          mmpQuery = mmpQuery.lte("created_at", to);
          projQuery = projQuery.lte("created_at", to);
        }

        // Sensible ordering for display/export
        svQuery = svQuery.order("visit_date", { ascending: false });
        mmpQuery = mmpQuery.order("created_at", { ascending: false });
        projQuery = projQuery.order("created_at", { ascending: false });

        const [svRes, mmpRes, projRes, profRes] = await Promise.all([
          svQuery,
          mmpQuery,
          projQuery,
          profQuery,
        ]);

        if (svRes.error) throw svRes.error;
        if (mmpRes.error) throw mmpRes.error;
        if (projRes.error) throw projRes.error;
        if (profRes.error) throw profRes.error;

        setSiteVisits(svRes.data || []);
        setMmpFiles(mmpRes.data || []);
        setProjects(projRes.data || []);
        setProfiles(profRes.data || []);
      } catch (e: any) {
        setError(e?.message || "Failed to load reports data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateRange]);

  const fetchLatestForReports = async () => {
    try {
      setLoading(true);
      setError(null);

      let svQuery = supabase.from("mmp_site_entries").select("*");
      let mmpQuery = supabase.from("mmp_files").select("*");
      let projQuery = supabase.from("projects").select("*");
      let profQuery = supabase.from("profiles").select("id, full_name, role, email");

      if (dateRange?.from) {
        const from = startOfDay(dateRange.from).toISOString();
        svQuery = svQuery.gte("due_date", from);
        mmpQuery = mmpQuery.gte("created_at", from);
        projQuery = projQuery.gte("created_at", from);
      }
      if (dateRange?.to) {
        const to = endOfDay(dateRange.to).toISOString();
        svQuery = svQuery.lte("due_date", to);
        mmpQuery = mmpQuery.lte("created_at", to);
        projQuery = projQuery.lte("created_at", to);
      }

      svQuery = svQuery.order("due_date", { ascending: false });
      mmpQuery = mmpQuery.order("created_at", { ascending: false });
      projQuery = projQuery.order("created_at", { ascending: false });

      const [svRes, mmpRes, projRes, profRes] = await Promise.all([
        svQuery,
        mmpQuery,
        projQuery,
        profQuery,
      ]);

      if (svRes.error) throw svRes.error;
      if (mmpRes.error) throw mmpRes.error;
      if (projRes.error) throw projRes.error;
      if (profRes.error) throw profRes.error;

      return {
        siteVisits: svRes.data || [],
        mmpFiles: mmpRes.data || [],
        projects: projRes.data || [],
        profiles: profRes.data || [],
      };
    } catch (e: any) {
      setError(e?.message || "Failed to load reports data");
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const recentReports = useMemo(() => {
    const now = new Date().toISOString();
    return [
      {
        id: "financial_site_visits_fees",
        name: "Site Visits Fees Summary",
        date: now,
        type: "Financial",
        format: "Excel",
        size: "-",
      },
      {
        id: "financial_project_budget",
        name: "Project Budget Summary",
        date: now,
        type: "Financial",
        format: "Excel",
        size: "-",
      },
      {
        id: "operational_site_visits",
        name: "Site Visits Performance",
        date: now,
        type: "Operational",
        format: "Excel",
        size: "-",
      },
      {
        id: "operational_mmp_progress",
        name: "MMP Implementation Progress",
        date: now,
        type: "Operational",
        format: "Excel",
        size: "-",
      },
    ];
  }, [filteredProjects, filteredSiteVisits, filteredMmpFiles]);

  const reportTemplates = [
    {
      id: "t1",
      name: "Financial Summary",
      description: "Overview of financial transactions and budget status",
      category: "Financial",
    },
    {
      id: "t2",
      name: "Site Visit Status",
      description: "Summary of all site visits and their completion status",
      category: "Operations",
    },
    {
      id: "t3",
      name: "Team Performance",
      description: "Analysis of field team performance metrics",
      category: "Management",
    },
    {
      id: "t4",
      name: "MMP Implementation",
      description: "Progress report on MMP implementation stages",
      category: "Operations",
    },
  ];

  const inRange = (isoDate?: string | null) => {
    if (!isoDate) return true;
    if (!dateRange?.from && !dateRange?.to) return true;
    const d = new Date(isoDate);
    const from = dateRange?.from ? startOfDay(dateRange.from) : undefined;
    const to = dateRange?.to ? endOfDay(dateRange.to) : undefined;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const exportXLSX = (rows: any[], baseName: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const fileName = `${baseName}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    saveAs(blob, fileName);
  };

  const exportPDF = async (rows: any[], reportType: string, baseName: string) => {
    const dateRangeObj = dateRange ? { from: dateRange.from, to: dateRange.to } : undefined;
    
    switch (reportType) {
      case "site_visits":
        await generateSiteVisitsPDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      case "project_budget":
        await generateProjectBudgetPDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      case "mmp_progress":
        await generateMMPProgressPDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      case "team_performance":
        await generateTeamPerformancePDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      default:
        console.warn("Unknown report type for PDF export:", reportType);
    }
  };

  const buildSiteVisitsRows = (visits: any[]) => {
    return visits.filter(v => inRange(v.due_date || v.created_at)).map((v) => ({
      "Site Name": v.site_name || "",
      "Site Code": v.site_code || "",
      "State": v.state || "",
      "Locality": v.locality || "",
      "Activity": v.activity || "",
      "Main Activity": v.main_activity || "",
      "Visit Type": v.visit_data?.visitType || "",
      "Due Date": v.due_date ? format(new Date(v.due_date), 'yyyy-MM-dd') : "",
      "Status": v.status || "",
      "Total Fee": v.fees?.total ?? "",
      "Currency": v.fees?.currency || "",
    }));
  };

  const buildProjectBudgetRows = (projs: any[]) => {
    return projs
      .filter((p) => inRange(p.updated_at || p.created_at))
      .map((p) => ({
      "Project Name": p.name || "",
      "Project Code": p.project_code || "",
      "Status": p.status || "",
      "Budget Total": p.budget?.total ?? "",
      "Budget Allocated": p.budget?.allocated ?? "",
      "Budget Remaining": p.budget?.remaining ?? "",
      "Currency": p.budget?.currency || "",
      "Updated At": p.updated_at ? format(new Date(p.updated_at), 'yyyy-MM-dd') : (p.created_at ? format(new Date(p.created_at), 'yyyy-MM-dd') : ""),
    }));
  };

  const buildMMPProgressRows = (mmps: any[]) => {
    return mmps
      .filter((m) => inRange(m.uploaded_at || m.created_at))
      .map((m) => ({
      "Name": m.name || "",
      "Status": m.status || "",
      "Entries": m.entries ?? "",
      "Processed Entries": m.processed_entries ?? "",
      "MMP ID": m.mmp_id || "",
      "Uploaded At": m.uploaded_at ? format(new Date(m.uploaded_at), 'yyyy-MM-dd') : (m.created_at ? format(new Date(m.created_at), 'yyyy-MM-dd') : ""),
    }));
  };

  const buildTeamPerformanceRows = (visits: any[], profs: any[]) => {
    const byUser: Record<string, { user: string; role: string; assigned: number; completed: number; pending: number }> = {};
    const nameById: Record<string, { name: string; role: string }> = {};
    profs.forEach((p) => {
      nameById[p.id] = { name: p.full_name || p.email || p.id, role: p.role || "" };
    });
    visits.forEach((v) => {
      const uid = v.assigned_to;
      if (!uid) return;
      if (!byUser[uid]) {
        const meta = nameById[uid] || { name: uid, role: "" };
        byUser[uid] = { user: meta.name, role: meta.role, assigned: 0, completed: 0, pending: 0 };
      }
      byUser[uid].assigned += 1;
      if (v.status === "completed") byUser[uid].completed += 1; else byUser[uid].pending += 1;
    });
    return Object.values(byUser).map((r) => ({
      "User": r.user,
      "Role": r.role,
      "Assigned Visits": r.assigned,
      "Completed Visits": r.completed,
      "Pending/Active": r.pending,
    }));
  };

  const handleDownloadReport = async (report) => {
    try {
      setExporting(true);

      const latest = await fetchLatestForReports();
      const sv = latest.siteVisits;
      const mmps = latest.mmpFiles;
      const projs = latest.projects;
      const profs = latest.profiles;

      setSiteVisits(sv);
      setMmpFiles(mmps);
      setProjects(projs);
      setProfiles(profs);

      switch (report.id) {
        case "financial_site_visits_fees":
          exportXLSX(buildSiteVisitsRows(sv), "site_visits_fees_summary");
          break;
        case "financial_project_budget":
          exportXLSX(buildProjectBudgetRows(projs), "project_budget_summary");
          break;
        case "operational_site_visits":
          exportXLSX(buildSiteVisitsRows(sv), "site_visits_performance");
          break;
        case "operational_mmp_progress":
          exportXLSX(buildMMPProgressRows(mmps), "mmp_implementation_progress");
          break;
        default:
          exportXLSX([], "report");
      }
      const fileName = `${report.name.toLowerCase().replace(/\s+/g, '_')}_${format(new Date(report.date), 'yyyy-MM-dd')}.xlsx`;
      toast({
        title: "Report Downloaded",
        description: `${report.name} has been downloaded as ${fileName}`,
      });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Unable to generate the report",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadPDFReport = async (report) => {
    try {
      setExporting(true);

      const latest = await fetchLatestForReports();
      const sv = latest.siteVisits;
      const mmps = latest.mmpFiles;
      const projs = latest.projects;
      const profs = latest.profiles;

      setSiteVisits(sv);
      setMmpFiles(mmps);
      setProjects(projs);
      setProfiles(profs);

      switch (report.id) {
        case "financial_site_visits_fees":
          await exportPDF(buildSiteVisitsRows(sv), "site_visits", "site_visits_fees_summary");
          break;
        case "financial_project_budget":
          await exportPDF(buildProjectBudgetRows(projs), "project_budget", "project_budget_summary");
          break;
        case "operational_site_visits":
          await exportPDF(buildSiteVisitsRows(sv), "site_visits", "site_visits_performance");
          break;
        case "operational_mmp_progress":
          await exportPDF(buildMMPProgressRows(mmps), "mmp_progress", "mmp_implementation_progress");
          break;
        default:
          await exportPDF([], "site_visits", "report");
      }
      
      toast({
        title: "PDF Report Generated",
        description: `${report.name} has been downloaded as PDF`,
      });
    } catch (e: any) {
      toast({
        title: "PDF Export failed",
        description: e?.message || "Unable to generate the PDF report",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleGenerateReport = async (reportType) => {
    try {
      setExporting(true);

      const latest = await fetchLatestForReports();
      const sv = latest.siteVisits;
      const mmps = latest.mmpFiles;
      const projs = latest.projects;
      const profs = latest.profiles;

      setSiteVisits(sv);
      setMmpFiles(mmps);
      setProjects(projs);
      setProfiles(profs);

      if (reportType === "Financial Summary") {
        exportXLSX(buildSiteVisitsRows(sv), "financial_summary");
      } else if (reportType === "Site Visit Report") {
        exportXLSX(buildSiteVisitsRows(sv), "site_visit_report");
      } else if (reportType === "Team Performance Report") {
        exportXLSX(buildTeamPerformanceRows(sv, profs), "team_performance_report");
      } else if (reportType === "MMP Implementation Report") {
        exportXLSX(buildMMPProgressRows(mmps), "mmp_implementation_report");
      } else {
        exportXLSX([], reportType.toLowerCase().replace(/\s+/g, '_'));
      }
      const timestamp = format(new Date(), 'yyyy-MM-dd');
      const fileName = `${reportType.toLowerCase().replace(/\s+/g, '_')}_${timestamp}.xlsx`;
      toast({
        title: "Report Generated",
        description: `${reportType} report has been generated as ${fileName}`,
      });
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message || "Unable to generate the report",
        variant: "destructive",
      });
    }
  };

  const handleGeneratePDFReport = async (reportType) => {
    try {
      setExporting(true);

      const latest = await fetchLatestForReports();
      const sv = latest.siteVisits;
      const mmps = latest.mmpFiles;
      const projs = latest.projects;
      const profs = latest.profiles;

      setSiteVisits(sv);
      setMmpFiles(mmps);
      setProjects(projs);
      setProfiles(profs);

      if (reportType === "Financial Summary") {
        await exportPDF(buildSiteVisitsRows(sv), "site_visits", "financial_summary");
      } else if (reportType === "Site Visit Report") {
        await exportPDF(buildSiteVisitsRows(sv), "site_visits", "site_visit_report");
      } else if (reportType === "Team Performance Report") {
        await exportPDF(buildTeamPerformanceRows(sv, profs), "team_performance", "team_performance_report");
      } else if (reportType === "MMP Implementation Report") {
        await exportPDF(buildMMPProgressRows(mmps), "mmp_progress", "mmp_implementation_report");
      }
      
      toast({
        title: "PDF Report Generated",
        description: `${reportType} report has been generated as PDF`,
      });
    } catch (e: any) {
      toast({
        title: "PDF Export failed",
        description: e?.message || "Unable to generate the PDF report",
        variant: "destructive",
      });
    }
  };

  const handleUseTemplate = (template) => {
    toast({
      title: "Template Selected",
      description: `${template.name} template is ready to use`
    });
  };

  const getChartData = (reportType: string) => {
    switch (reportType) {
      case "site_visits":
        return generateSiteVisitsChartData(buildSiteVisitsRows(filteredSiteVisits));
      case "project_budget":
        return generateProjectBudgetChartData(buildProjectBudgetRows(filteredProjects));
      case "mmp_progress":
        return generateMMPProgressChartData(buildMMPProgressRows(filteredMmpFiles));
      case "team_performance":
        return generateTeamPerformanceChartData(buildTeamPerformanceRows(filteredSiteVisits, profiles));
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center mb-6">
        <Button
          variant="outline"
          size="sm"
          className="mr-4"
          onClick={handleBackToDashboard}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>

      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg shadow-sm border animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          Reports
        </h1>
        <p className="text-muted-foreground mt-2">
          Generate, view, and manage reports across all system operations
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-1 p-1 h-auto">
          <TabsTrigger value="executive" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <LayoutDashboard className="h-3 w-3" />
              <span className="hidden sm:inline">Executive</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="financial_new" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <Wallet className="h-3 w-3" />
              <span className="hidden sm:inline">Financial</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span className="hidden sm:inline">Analytics</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="project_costs" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <BarChart4 className="h-3 w-3" />
              <span className="hidden sm:inline">Costs</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="auditing" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3" />
              <span className="hidden sm:inline">Audit</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              <span className="hidden sm:inline">Templates</span>
            </span>
          </TabsTrigger>
        </TabsList>

        {/* New Comprehensive Reporting Modules */}
        <TabsContent value="executive" className="mt-4">
          <ExecutiveDashboard />
        </TabsContent>

        <TabsContent value="financial_new" className="mt-4">
          <FinancialReports />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsReports />
        </TabsContent>

        <TabsContent value="project_costs" className="mt-4">
          <ProjectCostReports />
        </TabsContent>

        <TabsContent value="auditing" className="mt-4">
          <AuditingReports />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Report Templates</CardTitle>
              <CardDescription>
                Standard report templates for generating consistent reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportTemplates.map((template) => (
                  <Card key={template.id} className="overflow-hidden hover:border-primary transition-colors">
                    <CardHeader className="bg-slate-50 pb-2">
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {template.category}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground mb-4">{template.description}</p>
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={() => handleUseTemplate(template)}>
                          Use Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
