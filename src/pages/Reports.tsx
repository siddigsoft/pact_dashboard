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

const Reports: React.FC = () => {
  const [activeTab, setActiveTab] = useState("financial");
  const { toast } = useToast();
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [siteVisits, setSiteVisits] = useState<any[]>([]);
  const [mmpFiles, setMmpFiles] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);

  const handleBackToDashboard = () => {
    navigate("/dashboard");
  };

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        let svQuery = supabase.from("site_visits").select("*");
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

        // Sensible ordering for display/export
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

  const exportXLSX = (rows: any[], baseName: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const fileName = `${baseName}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    saveAs(blob, fileName);
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
    return projs.map((p) => ({
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
    return mmps.map((m) => ({
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

  const handleDownloadReport = (report) => {
    try {
      switch (report.id) {
        case "financial_site_visits_fees":
          exportXLSX(buildSiteVisitsRows(siteVisits), "site_visits_fees_summary");
          break;
        case "financial_project_budget":
          exportXLSX(buildProjectBudgetRows(projects), "project_budget_summary");
          break;
        case "operational_site_visits":
          exportXLSX(buildSiteVisitsRows(siteVisits), "site_visits_performance");
          break;
        case "operational_mmp_progress":
          exportXLSX(buildMMPProgressRows(mmpFiles), "mmp_implementation_progress");
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
    }
  };

  const handleGenerateReport = (reportType) => {
    try {
      if (reportType === "Financial Summary") {
        exportXLSX(buildSiteVisitsRows(siteVisits), "financial_summary");
      } else if (reportType === "Site Visit Report") {
        exportXLSX(buildSiteVisitsRows(siteVisits), "site_visit_report");
      } else if (reportType === "Team Performance Report") {
        exportXLSX(buildTeamPerformanceRows(siteVisits, profiles), "team_performance_report");
      } else if (reportType === "MMP Implementation Report") {
        exportXLSX(buildMMPProgressRows(mmpFiles), "mmp_implementation_report");
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

  const handleUseTemplate = (template) => {
    toast({
      title: "Template Selected",
      description: `${template.name} template is ready to use`
    });
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
        <TabsList className="grid w-full grid-cols-1 md:grid-cols-3 gap-2 p-1 h-auto">
          <TabsTrigger value="financial" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <BarChart4 className="h-4 w-4" />
              <span>Financial Reports</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="operational" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Operational Reports</span>
            </span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="py-2 data-[state=active]:bg-blue-50">
            <span className="flex items-center gap-2">
              <FileBarChart className="h-4 w-4" />
              <span>Report Templates</span>
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="financial" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Financial Reports</CardTitle>
                <CardDescription>View and download financial reports and analyses</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button className="flex items-center gap-2" onClick={() => handleGenerateReport("Financial Summary")}>
                  <FileText className="h-4 w-4" />
                  Generate Report
                </Button>
                <div className="w-[250px]">
                  <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="text-sm text-red-600 mb-3">{error}</div>
              )}
              {loading && (
                <div className="text-sm text-muted-foreground mb-3">Loading data...</div>
              )}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentReports
                      .filter((report) => report.type === "Financial")
                      .map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-medium">{report.name}</TableCell>
                          <TableCell>{new Date(report.date).toLocaleDateString()}</TableCell>
                          <TableCell>{report.format}</TableCell>
                          <TableCell>{report.size}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDownloadReport(report)}>
                              <Download className="h-4 w-4 mr-1" /> Download
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                  <TableCaption>A list of your recent financial reports.</TableCaption>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="operational" className="mt-4">
          <Card>
            <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle>Operational Reports</CardTitle>
                <CardDescription>View and manage operational metrics and performance</CardDescription>
              </div>
              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="flex items-center gap-2">
                      Generate Report
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleGenerateReport("Site Visit Report")}>Site Visit Report</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateReport("Team Performance Report")}>Team Performance Report</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleGenerateReport("MMP Implementation Report")}>MMP Implementation Report</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="w-[250px]">
                  <DatePickerWithRange dateRange={dateRange} onDateRangeChange={setDateRange} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="text-sm text-red-600 mb-3">{error}</div>
              )}
              {loading && (
                <div className="text-sm text-muted-foreground mb-3">Loading data...</div>
              )}
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report Name</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Format</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentReports
                      .filter((report) => report.type !== "Financial")
                      .map((report) => (
                        <TableRow key={report.id}>
                          <TableCell className="font-medium">{report.name}</TableCell>
                          <TableCell>{new Date(report.date).toLocaleDateString()}</TableCell>
                          <TableCell>{report.format}</TableCell>
                          <TableCell>{report.size}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => handleDownloadReport(report)}>
                              <Download className="h-4 w-4 mr-1" /> Download
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                  <TableCaption>A list of your recent operational reports.</TableCaption>
                </Table>
              </div>
            </CardContent>
          </Card>
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
