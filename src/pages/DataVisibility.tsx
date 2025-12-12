
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, 
  Search, 
  Filter, 
  Clock, 
  AlertTriangle, 
  FileSpreadsheet, 
  FileText, 
  File, 
  CheckCircle, 
  XCircle, 
  MapPin, 
  Layers, 
  FileQuestion, 
  Lock, 
  ShieldCheck, 
  AlertOctagon,
  TrendingUp,
  Users,
  Calendar,
  Eye,
  MoreHorizontal,
  Download,
  RefreshCw,
  Building2,
  Activity,
  BarChart3,
  ChevronDown,
  ExternalLink
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthorization } from "@/hooks/use-authorization";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
  ScatterChart, 
  Scatter,
  Cell,
  PieChart, 
  Pie,
  Sector
} from "recharts";
import { useUser } from "@/context/user/UserContext";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { MMPFile, SiteVisit } from "@/types";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { downloadMMPTemplate } from "@/utils/templateDownload";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DynamicFieldTeamMap } from '@/components/map/DynamicFieldTeamMap';
import { useMMP } from "@/context/mmp/MMPContext";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const ITEMS_PER_PAGE = 10;

const DataVisibility: React.FC = () => {
  const { currentUser, users, refreshUsers } = useUser();
  const { siteVisits } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState("integrated-view");
  const { toast } = useToast();
  const [activeCompliancePieIndex, setActiveCompliancePieIndex] = useState(0);

  const [siteVisitsList, setSiteVisitsList] = useState<SiteVisit[]>(siteVisits || []);
  const [loadingCollectors, setLoadingCollectors] = useState<boolean>(false);
  const [collectorsError, setCollectorsError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { mmpFiles } = useMMP();

  const [projectFilter, setProjectFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [hubFilter, setHubFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showMap, setShowMap] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

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
              onClick={() => window.history.back()}
              className="w-full"
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  useEffect(() => {
    if (siteVisits && siteVisits.length > 0) {
      setSiteVisitsList(siteVisits);
    }
  }, [siteVisits]);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setLoadingCollectors(true);
        setCollectorsError(null);
        await refreshUsers();
      } catch (e: any) {
        if (!isMounted) return;
        setCollectorsError(e?.message || 'Failed to load users');
      } finally {
        if (!isMounted) return;
        setLoadingCollectors(false);
      }
    })();
    return () => { isMounted = false; };
  }, [refreshUsers]);

  const hasValidCoords = (coords?: { latitude?: number; longitude?: number }) => {
    const lat = coords?.latitude; const lon = coords?.longitude;
    return (
      typeof lat === 'number' && typeof lon === 'number' &&
      Number.isFinite(lat) && Number.isFinite(lon) &&
      !(lat === 0 && lon === 0)
    );
  };

  const eligibleCollectors = useMemo(() => {
    const isCollector = (u: any) => {
      const roleVal = (u?.role || '').toString();
      const direct = roleVal === 'dataCollector' || roleVal.toLowerCase() === 'datacollector';
      const inArray = Array.isArray(u?.roles) && u.roles.some((r: any) => r === 'dataCollector' || (typeof r === 'string' && r.toLowerCase() === 'datacollector'));
      return direct || inArray;
    };
    return (users || []).filter(u => isCollector(u) && hasValidCoords(u.location));
  }, [users]);

  const resolveUserName = React.useCallback((id?: string) => {
    if (!id) return '—';
    const u = (users || []).find(u => u.id === id);
    return u?.name || (u as any)?.fullName || (u as any)?.username || id;
  }, [users]);

  const uniqueHubs = useMemo(() => {
    const hubs = new Set<string>();
    siteVisitsList.forEach(v => v.hub && hubs.add(v.hub));
    return Array.from(hubs).sort();
  }, [siteVisitsList]);

  const uniqueStates = useMemo(() => {
    const states = new Set<string>();
    siteVisitsList.forEach(v => v.state && states.add(v.state));
    return Array.from(states).sort();
  }, [siteVisitsList]);

  const filteredSiteVisits = useMemo(() => {
    return siteVisitsList.filter(visit => {
      const matchesSearch = visit.siteName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           visit.location?.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           visit.hub?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           visit.state?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || visit.status === statusFilter;
      const matchesHub = hubFilter === "all" || visit.hub === hubFilter;
      const matchesRegion = regionFilter === "all" || visit.state === regionFilter;
      return matchesSearch && matchesStatus && matchesHub && matchesRegion;
    });
  }, [siteVisitsList, searchTerm, statusFilter, hubFilter, regionFilter]);

  const paginatedVisits = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSiteVisits.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredSiteVisits, currentPage]);

  const totalPages = Math.ceil(filteredSiteVisits.length / ITEMS_PER_PAGE);

  const stats = useMemo(() => {
    const total = siteVisitsList.length;
    const completed = siteVisitsList.filter(v => v.status === 'completed').length;
    const inProgress = siteVisitsList.filter(v => v.status === 'inProgress').length;
    const pendingStatuses = ['pending', 'assigned', 'dispatched'];
    const pending = siteVisitsList.filter(v => pendingStatuses.includes(v.status as string)).length;
    const overdue = siteVisitsList.filter(v => {
      if (v.status === 'completed') return false;
      const due = v.dueDate ? new Date(v.dueDate) : null;
      return due && due < new Date();
    }).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, pending, overdue, completionRate };
  }, [siteVisitsList]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshUsers();
      toast({ title: "Data refreshed", description: "Latest data has been loaded." });
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className: string }> = {
      completed: { label: "Completed", variant: "default", className: "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/30" },
      inProgress: { label: "In Progress", variant: "secondary", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" },
      pending: { label: "Pending", variant: "outline", className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30" },
      assigned: { label: "Assigned", variant: "outline", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30" },
      dispatched: { label: "Dispatched", variant: "outline", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30" },
      accepted: { label: "Accepted", variant: "secondary", className: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/30" },
    };
    const config = statusConfig[status] || { label: status, variant: "outline" as const, className: "" };
    return (
      <Badge variant={config.variant} className={cn("text-xs font-medium", config.className)}>
        {config.label}
      </Badge>
    );
  };

  const getVisitTypeBadge = (type: string) => {
    if (!type || type === '-') return <span className="text-muted-foreground">—</span>;
    const typeColors: Record<string, string> = {
      regular: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      spot: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
      followup: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    };
    const colorClass = typeColors[type.toLowerCase()] || typeColors.regular;
    return (
      <Badge variant="outline" className={cn("text-xs font-normal capitalize", colorClass)}>
        {type}
      </Badge>
    );
  };

  const generateCSV = (data: any[], headers: string[] = []): string => {
    if (headers.length === 0 && data.length > 0) {
      headers = Object.keys(data[0]);
    }
    let csvContent = headers.join(',') + '\n';
    data.forEach(item => {
      const row = headers.map(header => {
        const value = item[header] || '';
        return typeof value === 'string' && (value.includes(',') || value.includes('"')) ? 
          `"${value.replace(/"/g, '""')}"` : value;
      }).join(',');
      csvContent += row + '\n';
    });
    return csvContent;
  };

  const downloadFile = (content: string, fileName: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  };

  const prepareVisitData = () => {
    return filteredSiteVisits.map(visit => ({
      siteName: visit.siteName,
      hub: visit.hub || '-',
      state: visit.state || '-',
      locality: visit.locality || '-',
      cpName: visit.cpName || '-',
      mainActivity: visit.mainActivity || '-',
      activity: visit.activity || '-',
      visitType: visit.visitTypeRaw || visit.visitType || '-',
      visitDate: visit.dueDate ? format(new Date(visit.dueDate), 'yyyy-MM-dd') : '-',
      linkedMMP: (mmpFiles || []).find(m => m.id === visit.mmpDetails?.mmpId)?.projectName || '-',
      status: visit.status,
      assignedTo: resolveUserName(visit.assignedTo),
    }));
  };

  const handleExportCSV = () => {
    const fileName = `site_visits_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const data = prepareVisitData();
    const content = generateCSV(data);
    downloadFile(content, fileName, 'text/csv');
    toast({ title: "Export Successful", description: `Data exported to ${fileName}` });
  };

  const handleExportExcel = () => {
    const fileName = `site_visits_export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    const data = prepareVisitData();
    const content = generateCSV(data);
    downloadFile(content, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    toast({ title: "Export Successful", description: `Data exported to ${fileName}` });
  };

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setHubFilter("all");
    setRegionFilter("all");
    setCurrentPage(1);
  };

  const hasActiveFilters = searchTerm || statusFilter !== "all" || hubFilter !== "all" || regionFilter !== "all";

  const reportChartData = useMemo(() => {
    const byProject: Record<string, { name: string; complete: number; pending: number; overdue: number }> = {};
    const now = new Date();
    (siteVisitsList || []).forEach((v) => {
      const mmpId = v?.mmpDetails?.mmpId as string | undefined;
      const mmp = (mmpFiles || []).find(m => m.id === mmpId);
      const key = mmp?.projectName || mmp?.name || 'Unassigned';
      if (!byProject[key]) byProject[key] = { name: key, complete: 0, pending: 0, overdue: 0 };
      if (v.status === 'completed') byProject[key].complete += 1;
      else {
        const due = v.dueDate ? new Date(v.dueDate) : undefined;
        const isOverdue = !!(due && due.getTime() < now.getTime());
        if (isOverdue) byProject[key].overdue += 1; else byProject[key].pending += 1;
      }
    });
    return Object.values(byProject)
      .sort((a,b) => (b.complete + b.pending + b.overdue) - (a.complete + a.pending + a.overdue))
      .slice(0, 8);
  }, [siteVisitsList, mmpFiles]);

  const coverageChartData = useMemo(() => {
    const groups = new Map<string, { name: string; visits: number; completed: number }>();
    (siteVisitsList || []).forEach((v) => {
      const key = v.state || 'Unknown';
      const g = groups.get(key) || { name: key, visits: 0, completed: 0 };
      g.visits += 1;
      if (v.status === 'completed') g.completed += 1;
      groups.set(key, g);
    });
    const palette = ['#10b981','#a3e635','#fbbf24','#f87171','#60a5fa','#f472b6','#34d399','#f59e0b','#ef4444','#6366f1'];
    return Array.from(groups.values()).map((g, i) => {
      const value = g.visits ? Math.round((g.completed / g.visits) * 100) : 0;
      return { name: g.name, value, visits: g.visits, completed: g.completed, x: g.visits, y: g.completed, color: palette[i % palette.length] };
    });
  }, [siteVisitsList]);

  const kpi = useMemo(() => {
    const total = siteVisitsList.length || 0;
    const completedVisits = siteVisitsList.filter(v => v.status === 'completed');
    const completed = completedVisits.length;
    const onTimeCompleted = completedVisits.filter(v => v.dueDate && v.completedAt && new Date(v.completedAt) <= new Date(v.dueDate)).length;
    const onTimeRate = completed > 0 ? Math.round((onTimeCompleted / completed) * 100) : 0;
    const siteCoverage = total > 0 ? Math.round((completed / total) * 100) : 0;
    const goodDataCount = siteVisitsList.filter(v => {
      const hasNotes = !!(v.notes && v.notes.trim().length > 0);
      const hasAtt = Array.isArray(v.attachments) && v.attachments.length > 0;
      const hasCoords = hasValidCoords(v.coordinates);
      return hasNotes || hasAtt || hasCoords;
    }).length;
    const dataQuality = total > 0 ? Math.round((goodDataCount / total) * 100) : 0;
    const alignedCount = siteVisitsList.filter(v => {
      const mId = v?.mmpDetails?.mmpId;
      if (!mId) return false;
      return (mmpFiles || []).some(m => m.id === mId);
    }).length;
    const projectAlignment = total > 0 ? Math.round((alignedCount / total) * 100) : 0;
    return { onTimeRate, siteCoverage, dataQuality, projectAlignment };
  }, [siteVisitsList, mmpFiles]);

  const renderActiveShape = (props: any) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';
    return (
      <g>
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} className="text-sm">{payload.name}</text>
        <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius} startAngle={startAngle} endAngle={endAngle} fill={fill} />
        <Sector cx={cx} cy={cy} startAngle={startAngle} endAngle={endAngle} innerRadius={outerRadius + 6} outerRadius={outerRadius + 10} fill={fill} />
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none"/>
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none"/>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333" className="text-xs">{`${value}%`}</text>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999" className="text-xs">{`(${(percent * 100).toFixed(2)}%)`}</text>
      </g>
    );
  };

  const handleDownloadTemplate = (templateName: string) => {
    let fileName = `${templateName.toLowerCase().replace(/\s+/g, '_')}_template.xlsx`;
    if (templateName === "Compliance Summary") {
      const headers = ['Project', 'Status', 'Documentation', 'Process Adherence', 'Data Protection', 'Overall Score'];
      const sampleData = [['WASH Program', 'Compliant', '95%', '87%', '98%', '92%'], ['Example Project', 'Needs Review', '80%', '75%', '90%', '82%']];
      let csvContent = headers.join(',') + '\n';
      sampleData.forEach(row => { csvContent += row.join(',') + '\n'; });
      downloadFile(csvContent, fileName, 'text/csv');
    } else if (templateName === "Project Status Report") {
      const headers = ['Project Name', 'Status', 'Progress', 'Site Count', 'Region', 'Start Date', 'Due Date', 'Manager'];
      const sampleData = [['WASH Program', 'In Progress', '65%', '12', 'South Darfur', '2025-01-15', '2025-06-30', 'John Doe'], ['Example Project', 'Planning', '10%', '5', 'Khartoum', '2025-05-01', '2025-08-15', 'Jane Smith']];
      let csvContent = headers.join(',') + '\n';
      sampleData.forEach(row => { csvContent += row.join(',') + '\n'; });
      downloadFile(csvContent, fileName, 'text/csv');
    } else {
      downloadMMPTemplate();
      fileName = 'mmp_template.xlsx';
    }
    toast({ title: "Template Downloaded", description: `${templateName} template has been downloaded` });
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-full overflow-x-hidden min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => navigate('/dashboard')} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data Visibility</h1>
            <p className="text-sm text-muted-foreground">Monitor site visits, MMPs, and field operations</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing} data-testid="button-refresh">
          <RefreshCw className={cn("h-4 w-4 mr-2", isRefreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full overflow-x-hidden min-w-0">
        <TabsList className="grid grid-cols-1 md:grid-cols-3 mb-6">
          <TabsTrigger value="integrated-view" className="gap-2">
            <Layers className="h-4 w-4" />
            Integrated View
          </TabsTrigger>
          <TabsTrigger value="reporting" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Reporting & Trends
          </TabsTrigger>
          <TabsTrigger value="compliance" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Audit & Compliance
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="integrated-view" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200/50 dark:border-blue-800/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Total Visits</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300 mt-1">{stats.total}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200/50 dark:border-green-800/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Completed</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-300 mt-1">{stats.completed}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                </div>
                <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-2">{stats.completionRate}% completion rate</p>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200/50 dark:border-amber-800/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">In Progress</p>
                    <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 mt-1">{stats.inProgress}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-950/30 dark:to-slate-900/20 border-slate-200/50 dark:border-slate-800/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">Pending</p>
                    <p className="text-2xl font-bold text-slate-700 dark:text-slate-300 mt-1">{stats.pending}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-slate-500/10 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-950/30 dark:to-red-900/20 border-red-200/50 dark:border-red-800/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Overdue</p>
                    <p className="text-2xl font-bold text-red-700 dark:text-red-300 mt-1">{stats.overdue}</p>
                  </div>
                  <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                    <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden min-w-0">
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-primary" />
                    Site Visits & Data Collectors
                  </CardTitle>
                  <CardDescription>Interactive map showing site visits and active data collectors</CardDescription>
                </div>
                <Badge variant="outline" className="self-start sm:self-auto">
                  {eligibleCollectors.length} collectors online
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
              <DynamicFieldTeamMap siteVisits={siteVisits} eligibleCollectors={eligibleCollectors} height="450px" />
              {(loadingCollectors || collectorsError) && (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  {loadingCollectors ? 'Loading team locations...' : collectorsError}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader className="pb-4">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Layers className="h-5 w-5 text-primary" />
                    Site Visits & MMP Integration
                  </CardTitle>
                  <CardDescription>View relationship between site visits and MMP projects in real-time</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-export">
                        <Download className="h-4 w-4 mr-2" />
                        Export
                        <ChevronDown className="h-4 w-4 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={handleExportCSV}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleExportExcel}>
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as Excel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search sites, hubs, states..." 
                    className="pl-9"
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    data-testid="input-search"
                  />
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Select value={hubFilter} onValueChange={(v) => { setHubFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-hub">
                      <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Hub" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Hubs</SelectItem>
                      {uniqueHubs.map(hub => (
                        <SelectItem key={hub} value={hub}>{hub}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={regionFilter} onValueChange={(v) => { setRegionFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-region">
                      <MapPin className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueStates.map(state => (
                        <SelectItem key={state} value={state}>{state}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                    <SelectTrigger className="w-[140px]" data-testid="select-status">
                      <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="inProgress">In Progress</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="assigned">Assigned</SelectItem>
                      <SelectItem value="dispatched">Dispatched</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9" data-testid="button-clear-filters">
                      <XCircle className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </div>

              {hasActiveFilters && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Showing {filteredSiteVisits.length} of {siteVisitsList.length} visits</span>
                </div>
              )}

              <div className="rounded-lg border overflow-hidden">
                <ScrollArea className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50 hover:bg-muted/50">
                        <TableHead className="font-semibold min-w-[180px]">Site Visit</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Hub</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">State</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Locality</TableHead>
                        <TableHead className="font-semibold min-w-[140px]">CP Name</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Activity</TableHead>
                        <TableHead className="font-semibold min-w-[90px]">Type</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Visit Date</TableHead>
                        <TableHead className="font-semibold min-w-[140px]">Linked MMP</TableHead>
                        <TableHead className="font-semibold min-w-[100px]">Status</TableHead>
                        <TableHead className="font-semibold min-w-[120px]">Assigned To</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedVisits.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={12} className="h-32 text-center">
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <FileQuestion className="h-8 w-8 mb-2 opacity-50" />
                              <p>No site visits found</p>
                              {hasActiveFilters && (
                                <Button variant="link" size="sm" onClick={clearFilters} className="mt-1">
                                  Clear filters
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedVisits.map((visit, index) => (
                          <TableRow 
                            key={visit.id} 
                            className={cn(
                              "hover-elevate transition-colors",
                              index % 2 === 0 ? "bg-background" : "bg-muted/20"
                            )}
                            data-testid={`row-visit-${visit.id}`}
                          >
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{visit.siteName}</span>
                                {visit.siteCode && (
                                  <span className="text-xs text-muted-foreground">{visit.siteCode}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{visit.hub || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{visit.state || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{visit.locality || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">{visit.cpName || '—'}</span>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm truncate max-w-[100px] block cursor-default">
                                    {visit.activity || visit.mainActivity || '—'}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{visit.mainActivity && `Main: ${visit.mainActivity}`}</p>
                                  <p>{visit.activity && `Activity: ${visit.activity}`}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell>
                              {getVisitTypeBadge(visit.visitTypeRaw || visit.visitType || '-')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm">
                                  {visit.dueDate ? format(new Date(visit.dueDate), 'MMM d, yyyy') : '—'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm">
                                {(mmpFiles || []).find(m => m.id === visit.mmpDetails?.mmpId)?.projectName || '—'}
                              </span>
                            </TableCell>
                            <TableCell>
                              {getStatusBadge(visit.status)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-sm truncate max-w-[100px]">
                                  {resolveUserName(visit.assignedTo)}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-actions-${visit.id}`}>
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => navigate(`/site-visits/${visit.id}`)}>
                                    <Eye className="h-4 w-4 mr-2" />
                                    View Details
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate(`/site-visits/${visit.id}/edit`)}>
                                    <FileText className="h-4 w-4 mr-2" />
                                    Edit Visit
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages} ({filteredSiteVisits.length} total)
                  </p>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          className={cn(currentPage === 1 && "pointer-events-none opacity-50")}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => setCurrentPage(pageNum)}
                              isActive={currentPage === pageNum}
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      {totalPages > 5 && currentPage < totalPages - 2 && (
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                      )}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          className={cn(currentPage === totalPages && "pointer-events-none opacity-50")}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Linked Modules</CardTitle>
                <CardDescription>Connected data across modules</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Site Visits</span>
                    </div>
                    <Badge variant="secondary">{siteVisitsList.length}</Badge>
                  </div>
                  <Progress value={100} className="h-1.5" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">MMPs</span>
                    </div>
                    <Badge variant="secondary">{(mmpFiles || []).length}</Badge>
                  </div>
                  <Progress value={75} className="h-1.5" />
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">Data Collectors</span>
                    </div>
                    <Badge variant="secondary">{eligibleCollectors.length}</Badge>
                  </div>
                  <Progress value={50} className="h-1.5" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Activity Timeline</CardTitle>
                <CardDescription>Recent data updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {siteVisitsList.slice(0, 3).map((visit, i) => (
                    <div key={visit.id} className="flex items-start gap-3">
                      <div className={cn(
                        "h-2 w-2 mt-2 rounded-full",
                        visit.status === 'completed' ? "bg-green-500" : 
                        visit.status === 'inProgress' ? "bg-blue-500" : "bg-amber-500"
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{visit.siteName}</p>
                        <p className="text-xs text-muted-foreground">
                          {visit.createdAt ? formatDistanceToNow(new Date(visit.createdAt), { addSuffix: true }) : 'Recently'}
                        </p>
                      </div>
                      {getStatusBadge(visit.status)}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Stats</CardTitle>
                <CardDescription>Key performance indicators</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">On-time Rate</span>
                  <div className="flex items-center gap-2">
                    <Progress value={kpi.onTimeRate} className="w-16 h-1.5" />
                    <span className="text-sm font-medium w-10 text-right">{kpi.onTimeRate}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Site Coverage</span>
                  <div className="flex items-center gap-2">
                    <Progress value={kpi.siteCoverage} className="w-16 h-1.5" />
                    <span className="text-sm font-medium w-10 text-right">{kpi.siteCoverage}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Data Quality</span>
                  <div className="flex items-center gap-2">
                    <Progress value={kpi.dataQuality} className="w-16 h-1.5" />
                    <span className="text-sm font-medium w-10 text-right">{kpi.dataQuality}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Project Alignment</span>
                  <div className="flex items-center gap-2">
                    <Progress value={kpi.projectAlignment} className="w-16 h-1.5" />
                    <span className="text-sm font-medium w-10 text-right">{kpi.projectAlignment}%</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="reporting" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Site Visits by Project
                </CardTitle>
                <CardDescription>Completion status across projects</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={reportChartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar dataKey="complete" name="Completed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="overdue" name="Overdue" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Regional Coverage
                </CardTitle>
                <CardDescription>Site visit completion by state</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" dataKey="visits" name="Total Visits" tick={{ fontSize: 11 }} />
                      <YAxis type="number" dataKey="completed" name="Completed" tick={{ fontSize: 11 }} />
                      <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Scatter name="Regions" data={coverageChartData} fill="#8884d8">
                        {coverageChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Export Reports</CardTitle>
              <CardDescription>Download data in various formats</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={handleExportCSV}>
                  <FileText className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
                <Button variant="outline" onClick={handleExportExcel}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Export Excel
                </Button>
                <Button variant="outline" onClick={() => handleDownloadTemplate("Project Status Report")}>
                  <Download className="h-4 w-4 mr-2" />
                  Project Status Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Documentation</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">85%</Badge>
                </div>
                <Progress value={85} className="h-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Field Procedures</span>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">72%</Badge>
                </div>
                <Progress value={72} className="h-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Data Protection</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">93%</Badge>
                </div>
                <Progress value={93} className="h-2" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Access Control</span>
                  <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400">81%</Badge>
                </div>
                <Progress value={81} className="h-2" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Compliance Templates
              </CardTitle>
              <CardDescription>Download compliance documentation templates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => handleDownloadTemplate("Compliance Summary")}>
                  <Download className="h-4 w-4 mr-2" />
                  Compliance Summary
                </Button>
                <Button variant="outline" onClick={() => handleDownloadTemplate("MMP Template")}>
                  <Download className="h-4 w-4 mr-2" />
                  MMP Template
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DataVisibility;
