import React, { useEffect, useMemo, useState, useCallback } from "react";
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
  PenTool,
  Users,
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
// Dynamic imports for heavy export libraries (loaded on-demand to improve initial page load)
// XLSX, file-saver, and PDF generators are dynamically imported when needed
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
import { DocumentsReport } from "@/components/reports/DocumentsReport";
import { ReceiptsReport } from "@/components/reports/ReceiptsReport";
import { SignaturesReport } from "@/components/reports/SignaturesReport";
import { useMMP } from "@/context/mmp/MMPContext";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { useProjectContext } from "@/context/project/ProjectContext";
import { useUser } from "@/context/user/UserContext";

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState("executive");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { checkPermission, hasAnyRole } = useAuthorization();
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
  const [error, setError] = useState<string | null>(null);
  const [chartCanvas, setChartCanvas] = useState<HTMLCanvasElement | null>(null);
  const [showChart, setShowChart] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Use context hooks for real-time data
  const { mmpFiles: contextMmpFiles, loading: mmpLoading } = useMMP();
  const { siteVisits: contextSiteVisits, loading: siteVisitsLoading } = useSiteVisitContext();
  const { projects: contextProjects, loading: projectsLoading } = useProjectContext();
  const { users } = useUser();

  const loading = mmpLoading || siteVisitsLoading || projectsLoading;

  // Filter data by date range
  const siteVisits = useMemo(() => {
    if (!dateRange) return contextSiteVisits || [];
    const from = dateRange.from ? startOfDay(dateRange.from).toISOString() : null;
    const to = dateRange.to ? endOfDay(dateRange.to).toISOString() : null;
    
    return (contextSiteVisits || []).filter((visit: any) => {
      const visitDate = visit.visitDate || visit.visit_date;
      if (!visitDate) return false;
      if (from && visitDate < from) return false;
      if (to && visitDate > to) return false;
      return true;
    });
  }, [contextSiteVisits, dateRange]);

  const mmpFiles = useMemo(() => {
    if (!dateRange) return contextMmpFiles || [];
    const from = dateRange.from ? startOfDay(dateRange.from).toISOString() : null;
    const to = dateRange.to ? endOfDay(dateRange.to).toISOString() : null;
    
    return (contextMmpFiles || []).filter((mmp: any) => {
      const createdAt = mmp.uploadedAt || mmp.uploaded_at || mmp.createdAt || mmp.created_at;
      if (!createdAt) return false;
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });
  }, [contextMmpFiles, dateRange]);

  const projects = useMemo(() => {
    if (!dateRange) return contextProjects || [];
    const from = dateRange.from ? startOfDay(dateRange.from).toISOString() : null;
    const to = dateRange.to ? endOfDay(dateRange.to).toISOString() : null;
    
    return (contextProjects || []).filter((project: any) => {
      const createdAt = project.createdAt || project.created_at;
      if (!createdAt) return false;
      if (from && createdAt < from) return false;
      if (to && createdAt > to) return false;
      return true;
    });
  }, [contextProjects, dateRange]);

  const profiles = useMemo(() => {
    return (users || []).map((user: any) => ({
      id: user.id,
      full_name: user.name || user.fullName,
      role: user.role,
      email: user.email,
    }));
  }, [users]);

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  // Use context refresh methods
  const { refreshMMPFiles } = useMMP();
  const { refreshSiteVisits } = useSiteVisitContext();
  const { fetchProjects } = useProjectContext();

  const fetchLatestForReports = async () => {
    try {
      setError(null);
      // Refresh all context data - real-time subscriptions will handle updates
      await Promise.all([
        refreshMMPFiles(),
        refreshSiteVisits(),
        fetchProjects(),
      ]);

      // Data will be automatically updated via context real-time subscriptions
      // Return current filtered data
      return {
        siteVisits,
        mmpFiles,
        projects,
        profiles,
      };
    } catch (e: any) {
      setError(e?.message || "Failed to refresh reports data");
      throw e;
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
  }, [projects, siteVisits, mmpFiles]);

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

  const exportXLSX = async (rows: any[], baseName: string) => {
    // Dynamic import for XLSX and file-saver (reduces initial bundle size)
    const [XLSX, { saveAs }] = await Promise.all([
      import("xlsx"),
      import("file-saver")
    ]);
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
    
    // Dynamic import for PDF generators (reduces initial bundle size)
    const pdfGenerators = await import("@/utils/pdfReportGenerator");
    
    switch (reportType) {
      case "site_visits":
        await pdfGenerators.generateSiteVisitsPDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      case "project_budget":
        await pdfGenerators.generateProjectBudgetPDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      case "mmp_progress":
        await pdfGenerators.generateMMPProgressPDF(rows, dateRangeObj, chartCanvas || undefined);
        break;
      case "team_performance":
        await pdfGenerators.generateTeamPerformancePDF(rows, dateRangeObj, chartCanvas || undefined);
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

      switch (report.id) {
        case "financial_site_visits_fees":
          await exportXLSX(buildSiteVisitsRows(sv), "site_visits_fees_summary");
          break;
        case "financial_project_budget":
          await exportXLSX(buildProjectBudgetRows(projs), "project_budget_summary");
          break;
        case "operational_site_visits":
          await exportXLSX(buildSiteVisitsRows(sv), "site_visits_performance");
          break;
        case "operational_mmp_progress":
          await exportXLSX(buildMMPProgressRows(mmps), "mmp_implementation_progress");
          break;
        default:
          await exportXLSX([], "report");
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

      if (reportType === "Financial Summary") {
        await exportXLSX(buildSiteVisitsRows(sv), "financial_summary");
      } else if (reportType === "Site Visit Report") {
        await exportXLSX(buildSiteVisitsRows(sv), "site_visit_report");
      } else if (reportType === "Team Performance Report") {
        await exportXLSX(buildTeamPerformanceRows(sv, profs), "team_performance_report");
      } else if (reportType === "MMP Implementation Report") {
        await exportXLSX(buildMMPProgressRows(mmps), "mmp_implementation_report");
      } else {
        await exportXLSX([], reportType.toLowerCase().replace(/\s+/g, '_'));
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
        return generateSiteVisitsChartData(buildSiteVisitsRows(siteVisits));
      case "project_budget":
        return generateProjectBudgetChartData(buildProjectBudgetRows(projects));
      case "mmp_progress":
        return generateMMPProgressChartData(buildMMPProgressRows(mmpFiles));
      case "team_performance":
        return generateTeamPerformanceChartData(buildTeamPerformanceRows(siteVisits, profiles));
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
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-1 p-1 h-auto">
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
          <TabsTrigger value="documents" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <FileSpreadsheet className="h-3 w-3" />
              <span className="hidden sm:inline">Documents</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="receipts" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <FileDown className="h-3 w-3" />
              <span className="hidden sm:inline">Receipts</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="signatures" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <PenTool className="h-3 w-3" />
              <span className="hidden sm:inline">Signatures</span>
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
          <TabsTrigger value="hr_summary" className="py-2 text-xs data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              <span className="hidden sm:inline">HR Summary</span>
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

        <TabsContent value="documents" className="mt-4">
          <DocumentsReport />
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <ReceiptsReport />
        </TabsContent>

        <TabsContent value="signatures" className="mt-4">
          <SignaturesReport />
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
        <TabsContent value="hr_summary" className="mt-4">
          <HRSummaryReport />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ── HR Summary Report Component ───────────────────────────────────────────────

interface LeaveBalance { userId: string; name: string; email: string; annual: number; sick: number; emergency: number; maternity: number; other: number; }
interface CertRow { userId: string; name: string; email: string; title: string; certType: string; issued: string | null; expiry: string | null; status: string; }

function HRSummaryReport() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(false);
  const [leaveBalances, setLeaveBalances] = React.useState<LeaveBalance[]>([]);
  const [certRows, setCertRows] = React.useState<CertRow[]>([]);
  const [dataLoaded, setDataLoaded] = React.useState(false);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: leaves }, { data: certs }, { data: profiles }] = await Promise.all([
        supabase.from('leave_requests')
          .select('user_id, leave_type, start_date, end_date, days_count')
          .eq('status', 'approved'),
        supabase.from('staff_certifications')
          .select('user_id, title, cert_type, issue_date, expiry_date, status'),
        supabase.from('profiles').select('id, full_name, email'),
      ]);

      const profileMap: Record<string, { name: string; email: string }> = {};
      (profiles ?? []).forEach((p: any) => {
        profileMap[p.id] = { name: p.full_name ?? '—', email: p.email ?? '—' };
      });

      // Aggregate leave days per person per type
      const balanceMap: Record<string, LeaveBalance> = {};
      (leaves ?? []).forEach((l: any) => {
        const uid = l.user_id ?? 'unknown';
        if (!balanceMap[uid]) {
          const prof = profileMap[uid] ?? { name: '—', email: '—' };
          balanceMap[uid] = { userId: uid, name: prof.name, email: prof.email, annual: 0, sick: 0, emergency: 0, maternity: 0, other: 0 };
        }
        // Use days_count if available, otherwise calculate from dates
        let days = Number(l.days_count ?? 0);
        if (!days) {
          const start = l.start_date ? new Date(l.start_date) : null;
          const end   = l.end_date   ? new Date(l.end_date)   : start;
          days = start && end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1) : 1;
        }
        const type = (l.leave_type || '').toLowerCase();
        if (type.includes('annual'))         balanceMap[uid].annual    += days;
        else if (type.includes('sick'))      balanceMap[uid].sick      += days;
        else if (type.includes('emergency')) balanceMap[uid].emergency += days;
        else if (type.includes('maternity')) balanceMap[uid].maternity += days;
        else                                  balanceMap[uid].other     += days;
      });
      setLeaveBalances(Object.values(balanceMap).sort((a, b) => a.name.localeCompare(b.name)));

      setCertRows((certs ?? []).map((c: any) => {
        const prof = profileMap[c.user_id ?? ''] ?? { name: '—', email: '—' };
        return {
          userId: c.user_id ?? '—',
          name: prof.name,
          email: prof.email,
          title: c.title || '—',
          certType: c.cert_type || '—',
          issued: c.issue_date ?? null,
          expiry: c.expiry_date ?? null,
          status: c.status || '—',
        };
      }).sort((a, b) => a.name.localeCompare(b.name)));
      setDataLoaded(true);
    } catch (err) {
      toast({ title: 'Failed to load HR data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const exportToExcel = async () => {
    setLoading(true);
    try {
      const xlsxModule = await import('xlsx');
      const XLSXLib = xlsxModule.default ?? xlsxModule;
      const wb = XLSXLib.utils.book_new();

      // Sheet 1: Leave Taken (approved leave days per category)
      const leaveData = [
        ['Name', 'Email', 'Annual (days taken)', 'Sick (days taken)', 'Emergency (days taken)', 'Maternity (days taken)', 'Other (days taken)', 'Total Days Taken'],
        ...leaveBalances.map(r => {
          const total = r.annual + r.sick + r.emergency + r.maternity + r.other;
          return [r.name, r.email, r.annual, r.sick, r.emergency, r.maternity, r.other, total];
        }),
      ];
      XLSXLib.utils.book_append_sheet(wb, XLSXLib.utils.aoa_to_sheet(leaveData), 'Leave Taken');

      // Sheet 2: Certifications
      const certData = [
        ['Name', 'Email', 'Certificate Title', 'Cert Type', 'Issue Date', 'Expiry Date', 'Status'],
        ...certRows.map(r => [r.name, r.email, r.title, r.certType, r.issued ?? '—', r.expiry ?? '—', r.status]),
      ];
      XLSXLib.utils.book_append_sheet(wb, XLSXLib.utils.aoa_to_sheet(certData), 'Certifications');

      XLSXLib.writeFile(wb, `HR_Summary_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast({ title: 'HR Summary exported successfully' });
    } catch (err) {
      toast({ title: 'Export failed', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-600" />
                HR Summary Report
              </CardTitle>
              <CardDescription>Leave balances and staff certifications — approved records only</CardDescription>
            </div>
            <Button onClick={exportToExcel} disabled={loading || !dataLoaded} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="btn-hr-summary-export">
              <Download className="h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground py-4 text-center">Loading HR data…</p>}
          {!loading && dataLoaded && (
            <div className="space-y-6">
              {/* Leave Balances */}
              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">Leave Taken — Approved Days by Category</h3>
                {leaveBalances.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No approved leave records found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead className="text-center">Annual</TableHead>
                          <TableHead className="text-center">Sick</TableHead>
                          <TableHead className="text-center">Emergency</TableHead>
                          <TableHead className="text-center">Maternity</TableHead>
                          <TableHead className="text-center">Other</TableHead>
                          <TableHead className="text-center font-bold">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {leaveBalances.map((r, i) => {
                          const total = r.annual + r.sick + r.emergency + r.maternity + r.other;
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-sm">{r.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.email}</TableCell>
                              <TableCell className="text-center">{r.annual || '—'}</TableCell>
                              <TableCell className="text-center">{r.sick || '—'}</TableCell>
                              <TableCell className="text-center">{r.emergency || '—'}</TableCell>
                              <TableCell className="text-center">{r.maternity || '—'}</TableCell>
                              <TableCell className="text-center">{r.other || '—'}</TableCell>
                              <TableCell className="text-center font-bold text-blue-700">{total}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              {/* Certifications */}
              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">Staff Certifications</h3>
                {certRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No certification records found.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Certificate</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Issue Date</TableHead>
                          <TableHead>Expiry Date</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {certRows.map((r, i) => {
                          const expired = r.expiry && new Date(r.expiry) < new Date();
                          return (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-sm">{r.name}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.email}</TableCell>
                              <TableCell className="text-sm">{r.title}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">{r.certType}</TableCell>
                              <TableCell className="text-sm">{r.issued ? format(new Date(r.issued), 'dd MMM yyyy') : '—'}</TableCell>
                              <TableCell className={`text-sm ${expired ? 'text-red-600 font-semibold' : ''}`}>
                                {r.expiry ? format(new Date(r.expiry), 'dd MMM yyyy') : '—'}
                                {expired && <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1 rounded">Expired</span>}
                              </TableCell>
                              <TableCell>
                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                  r.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                                  r.status === 'expired' ? 'bg-red-100 text-red-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>{r.status}</span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default Reports;
