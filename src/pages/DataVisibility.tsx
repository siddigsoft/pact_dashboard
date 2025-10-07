
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ScatterChart, 
  Scatter,
  Cell,
  PieChart, 
  Pie,
  Sector
} from "recharts";
import {
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
  AlertOctagon
} from "lucide-react";
import { useUser } from "@/context/user/UserContext";
import { useSiteVisitContext } from "@/context/siteVisit/SiteVisitContext";
import { MMPFile, SiteVisit } from "@/types";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { downloadMMPTemplate } from "@/utils/templateDownload";
import ErrorBoundary from "@/components/ErrorBoundary";
import { DynamicFieldTeamMap } from '@/components/map/DynamicFieldTeamMap';

const reportData = [
  {
    name: "WASH Program",
    complete: 65,
    pending: 20,
    overdue: 15,
  },
  {
    name: "Health Initiative",
    complete: 50,
    pending: 35,
    overdue: 15,
  },
  {
    name: "Education Project",
    complete: 75,
    pending: 20,
    overdue: 5,
  },
  {
    name: "Food Security",
    complete: 40,
    pending: 45,
    overdue: 15,
  },
  {
    name: "Infrastructure",
    complete: 60,
    pending: 30,
    overdue: 10,
  },
];

const coverageData = [
  { name: "North Darfur", value: 80, visits: 42, completed: 32, x: 200, y: 100, color: "#10b981" },
  { name: "South Darfur", value: 65, visits: 38, completed: 25, x: 200, y: 200, color: "#a3e635" },
  { name: "West Darfur", value: 45, visits: 25, completed: 11, x: 100, y: 150, color: "#fbbf24" },
  { name: "Central Darfur", value: 30, visits: 18, completed: 5, x: 150, y: 150, color: "#f87171" },
  { name: "East Darfur", value: 55, visits: 24, completed: 13, x: 250, y: 150, color: "#d9f99d" },
  { name: "Khartoum", value: 85, visits: 56, completed: 48, x: 350, y: 250, color: "#10b981" },
  { name: "North Kordofan", value: 60, visits: 32, completed: 19, x: 300, y: 150, color: "#a3e635" },
  { name: "South Kordofan", value: 40, visits: 22, completed: 9, x: 300, y: 250, color: "#fbbf24" },
];

const complianceData = [
  { name: "Documentation", value: 85 },
  { name: "Field Procedures", value: 72 },
  { name: "Data Protection", value: 93 },
  { name: "Access Control", value: 81 },
  { name: "Reporting", value: 78 },
];

const riskMetricsData = [
  { name: "High", value: 15, color: "#ef4444" },
  { name: "Medium", value: 35, color: "#f97316" },
  { name: "Low", value: 50, color: "#22c55e" }
];

const DataVisibility: React.FC = () => {
  const { currentUser, users, refreshUsers } = useUser();
  const { siteVisits } = useSiteVisitContext();
  const [activeTab, setActiveTab] = useState("integrated-view");
  const { toast } = useToast();
  const [activeCompliancePieIndex, setActiveCompliancePieIndex] = useState(0);

  const [siteVisitsList, setSiteVisitsList] = useState<SiteVisit[]>(siteVisits || []);
  const [loadingCollectors, setLoadingCollectors] = useState<boolean>(false);
  const [collectorsError, setCollectorsError] = useState<string | null>(null);

  const [mmps, setMmps] = useState<MMPFile[]>([
    {
      id: "mmp-001",
      name: "WASH_Program_2025.xlsx",
      uploadedBy: "admin",
      uploadedAt: new Date().toISOString(),
      status: "approved",
      entries: 15,
      projectName: "WASH Program 2025",
      region: "South Darfur",
      siteEntries: [
        { id: "site1", siteCode: "WAS-001", siteName: "Water Site 1", inMoDa: true, visitedBy: "user-1", mainActivity: "Water Testing", visitDate: new Date().toISOString(), status: "completed" }
      ]
    },
    {
      id: "mmp-002",
      name: "Education_Initiative_Q2.xlsx",
      uploadedBy: "admin",
      uploadedAt: new Date().toISOString(),
      status: "pending",
      entries: 8,
      projectName: "Education Initiative Q2",
      region: "Khartoum",
      siteEntries: [
        { id: "site2", siteCode: "SCP-002", siteName: "School Site 1", inMoDa: true, visitedBy: "user-2", mainActivity: "Building Inspection", visitDate: new Date().toISOString(), status: "inProgress" }
      ]
    },
    {
      id: "mmp-003",
      name: "Food_Security_North.xlsx",
      uploadedBy: "admin",
      uploadedAt: new Date().toISOString(),
      status: "pending",
      entries: 12,
      projectName: "Food Security North",
      region: "North Kordofan",
      siteEntries: [
        { id: "site3", siteCode: "FDM-003", siteName: "Food Distribution Site 1", inMoDa: true, visitedBy: "user-3", mainActivity: "Distribution", visitDate: new Date().toISOString(), status: "pending" }
      ]
    }
  ]);

  const [projectFilter, setProjectFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [showMap, setShowMap] = useState(true);

  const navigate = useNavigate();

  useEffect(() => {
    if (siteVisits && siteVisits.length > 0) {
      setSiteVisitsList(siteVisits);
    }
  }, [siteVisits]);

  // Ensure we have fresh users from DB on mount (production readiness)
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

  // Only data collectors with valid coordinates
  const eligibleCollectors = React.useMemo(() => {
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

  const filteredSiteVisits = siteVisitsList.filter(visit => {
    const matchesSearch = visit.siteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         visit.location.address.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || visit.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const renderActiveShape = (props: any) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle,
      fill, payload, percent, value } = props;
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
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill} className="text-sm">
          {payload.name}
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={fill}
        />
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none"/>
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none"/>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333" className="text-xs">{`${value}%`}</text>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999" className="text-xs">
          {`(${(percent * 100).toFixed(2)}%)`}
        </text>
      </g>
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

  const createExcelContent = (data: any[]) => {
    return generateCSV(data);
  };

  const createPDFContent = (data: any[]) => {
    let content = "PDF EXPORT\n\n";
    
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      content += headers.join('\t') + '\n';
      
      data.forEach(item => {
        content += headers.map(h => item[h] || '').join('\t') + '\n';
      });
    }
    
    return content;
  };

  const prepareVisitData = () => {
    return filteredSiteVisits.map(visit => ({
      siteName: visit.siteName,
      linkedMMP: mmps.find(m => m.id === visit.mmpDetails.mmpId)?.projectName || 'N/A',
      location: visit.location.address,
      status: visit.status,
      assignedTo: resolveUserName(visit.assignedTo),
      scheduledDate: format(new Date(visit.scheduledDate), 'yyyy-MM-dd'),
      dueDate: format(new Date(visit.dueDate), 'yyyy-MM-dd')
    }));
  };

  const handleExportExcel = () => {
    const fileName = `integrated_module_data_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    const data = prepareVisitData();
    const content = createExcelContent(data);
    
    downloadFile(content, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    toast({
      title: "Export Successful",
      description: `Data has been exported to ${fileName}`
    });
  };

  const handleExportPDF = () => {
    const fileName = `integrated_module_data_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    const data = prepareVisitData();
    const content = createPDFContent(data);
    
    downloadFile(content, fileName, 'application/pdf');
    
    toast({
      title: "Export Successful",
      description: `Data has been exported to ${fileName}`
    });
  };

  const handleExportCSV = () => {
    const fileName = `integrated_module_data_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    const data = prepareVisitData();
    const content = generateCSV(data);
    
    downloadFile(content, fileName, 'text/csv');
    
    toast({
      title: "Export Successful",
      description: `Data has been exported to ${fileName}`
    });
  };

  const handleExportRawData = () => {
    const fileName = `raw_data_export_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    
    const rawData = [
      ...filteredSiteVisits.map(visit => ({
        type: 'site_visit',
        id: visit.id,
        name: visit.siteName,
        status: visit.status,
        location: visit.location.address,
        date: format(new Date(visit.scheduledDate), 'yyyy-MM-dd')
      })),
      ...mmps.map(mmp => ({
        type: 'mmp',
        id: mmp.id,
        name: mmp.projectName,
        status: mmp.status,
        location: mmp.region,
        date: format(new Date(mmp.uploadedAt), 'yyyy-MM-dd')
      }))
    ];
    
    const content = generateCSV(rawData);
    downloadFile(content, fileName, 'text/csv');
    
    toast({
      title: "Export Successful",
      description: `Raw data has been exported to ${fileName}`
    });
  };

  const handleGenerateExecutiveSummary = () => {
    const fileName = `executive_summary_${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    
    const summaryData = [
      { metric: 'Total Site Visits', value: siteVisitsList.length },
      { metric: 'Completed Visits', value: siteVisitsList.filter(v => v.status === 'completed').length },
      { metric: 'In Progress Visits', value: siteVisitsList.filter(v => v.status === 'inProgress').length },
      { metric: 'Pending Visits', value: siteVisitsList.filter(v => v.status === 'pending').length },
      { metric: 'Total MMPs', value: mmps.length },
      { metric: 'On-time Completion Rate', value: '85%' },
      { metric: 'Data Quality Score', value: '78%' },
      { metric: 'Site Coverage', value: '92%' }
    ];
    
    const content = "EXECUTIVE SUMMARY\n\n" + 
      summaryData.map(item => `${item.metric}: ${item.value}`).join('\n');
    
    downloadFile(content, fileName, 'application/pdf');
    
    toast({
      title: "Report Generated",
      description: `Executive summary has been generated as ${fileName}`
    });
  };

  const handleDownloadTemplate = (templateName: string) => {
    let fileName = `${templateName.toLowerCase().replace(/\s+/g, '_')}_template.xlsx`;
    
    if (templateName === "Compliance Summary") {
      const headers = ['Project', 'Status', 'Documentation', 'Process Adherence', 'Data Protection', 'Overall Score'];
      const sampleData = [
        ['WASH Program', 'Compliant', '95%', '87%', '98%', '92%'],
        ['Example Project', 'Needs Review', '80%', '75%', '90%', '82%']
      ];
      
      let csvContent = headers.join(',') + '\n';
      sampleData.forEach(row => {
        csvContent += row.join(',') + '\n';
      });
      
      downloadFile(csvContent, fileName, 'text/csv');
    } else if (templateName === "Project Status Report") {
      const headers = ['Project Name', 'Status', 'Progress', 'Site Count', 'Region', 'Start Date', 'Due Date', 'Manager'];
      const sampleData = [
        ['WASH Program', 'In Progress', '65%', '12', 'South Darfur', '2025-01-15', '2025-06-30', 'John Doe'],
        ['Example Project', 'Planning', '10%', '5', 'Khartoum', '2025-05-01', '2025-08-15', 'Jane Smith']
      ];
      
      let csvContent = headers.join(',') + '\n';
      sampleData.forEach(row => {
        csvContent += row.join(',') + '\n';
      });
      
      downloadFile(csvContent, fileName, 'text/csv');
    } else {
      downloadMMPTemplate();
      fileName = 'mmp_template.xlsx';
    }
    
    toast({
      title: "Template Downloaded",
      description: `${templateName} template has been downloaded`
    });
  };

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center mb-6">
        <Button
          variant="outline"
          size="sm"
          className="mr-4"
          onClick={() => navigate('/dashboard')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full overflow-x-hidden">
        <TabsList className="grid grid-cols-1 md:grid-cols-3">
          <TabsTrigger value="integrated-view">Integrated Module View</TabsTrigger>
          <TabsTrigger value="reporting">Reporting & Trends</TabsTrigger>
          <TabsTrigger value="compliance">Audit & Compliance</TabsTrigger>
        </TabsList>
        
        <TabsContent value="integrated-view" className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Site Visits & Data Collectors Map</CardTitle>
              <CardDescription>
                Interactive map showing site visits and active data collectors
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden">
              <DynamicFieldTeamMap 
                siteVisits={siteVisits}
                eligibleCollectors={eligibleCollectors}
                height="500px"
              />
              {(loadingCollectors || collectorsError) && (
                <div className="px-4 py-2 text-xs text-muted-foreground">
                  {loadingCollectors ? 'Loading team locations…' : collectorsError}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Site Visits & MMP Integration</CardTitle>
              <CardDescription>
                View relationship between site visits and MMPs projects in real-time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-col md:flex-row gap-4">
                <div className="grid flex-1 items-center gap-1.5">
                  <label htmlFor="search" className="text-sm text-muted-foreground">Search</label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input 
                      id="search" 
                      placeholder="Search sites, projects..." 
                      className="pl-8"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="grid flex-1 items-center gap-1.5">
                  <label htmlFor="region" className="text-sm text-muted-foreground">Region</label>
                  <Select value={regionFilter} onValueChange={setRegionFilter}>
                    <SelectTrigger id="region">
                      <SelectValue placeholder="All regions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All regions</SelectItem>
                      <SelectItem value="south-darfur">South Darfur</SelectItem>
                      <SelectItem value="north-kordofan">North Kordofan</SelectItem>
                      <SelectItem value="khartoum">Khartoum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="grid flex-1 items-center gap-1.5">
                  <label htmlFor="status" className="text-sm text-muted-foreground">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger id="status">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="inProgress">In progress</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site Visit Title</TableHead>
                      <TableHead>Hub</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Locality</TableHead>
                      <TableHead>CP Name</TableHead>
                      <TableHead>Main Activity</TableHead>
                      <TableHead>Activity</TableHead>
                      <TableHead>Visit Type</TableHead>
                      <TableHead>Visit Date</TableHead>
                      <TableHead>Linked MMP</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Comments</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSiteVisits.map((visit) => (
                      <TableRow key={visit.id}>
                        <TableCell className="font-medium">{visit.siteName}</TableCell>
                        <TableCell>{visit.hub || 'N/A'}</TableCell>
                        <TableCell>{visit.state || 'N/A'}</TableCell>
                        <TableCell>{visit.locality || 'N/A'}</TableCell>
                        <TableCell>{visit.cpName || 'N/A'}</TableCell>
                        <TableCell>{visit.mainActivity || 'N/A'}</TableCell>
                        <TableCell>{visit.activity || 'N/A'}</TableCell>
                        <TableCell>{visit.visitTypeRaw || visit.visitType || 'N/A'}</TableCell>
                        <TableCell>{visit.dueDate ? format(new Date(visit.dueDate), 'yyyy-MM-dd') : 'N/A'}</TableCell>
                        <TableCell>
                          {mmps.find(m => m.id === visit.mmpDetails.mmpId)?.projectName || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            visit.status === "completed" ? "default" : 
                            visit.status === "inProgress" ? "secondary" : 
                            "outline"
                          }>
                            {visit.status === "inProgress" ? "In Progress" : 
                             visit.status === "completed" ? "Completed" : "Pending"}
                          </Badge>
                        </TableCell>
                        <TableCell>{resolveUserName(visit.assignedTo)}</TableCell>
                        <TableCell className="max-w-[260px] truncate" title={visit.notes || ''}>
                          {visit.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#" isActive>1</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#">2</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationLink href="#">3</PaginationLink>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>

              <div className="flex items-center justify-end gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-1"
                  onClick={handleExportExcel}
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Export Excel</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-1"
                  onClick={handleExportPDF}
                >
                  <File className="h-4 w-4" />
                  <span>Export PDF</span>
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex items-center gap-1"
                  onClick={handleExportCSV}
                >
                  <FileText className="h-4 w-4" />
                  <span>Export CSV</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Linked Modules</CardTitle>
                <CardDescription>Connected data across modules</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Site Visits</div>
                    <Badge variant="outline">{siteVisitsList.length}</Badge>
                  </div>
                  <Progress value={100} className="h-2" />
                  
                  <div className="flex items-center justify-between">
                    <div className="font-medium">MMPs</div>
                    <Badge variant="outline">{mmps.length}</Badge>
                  </div>
                  <Progress value={75} className="h-2" />
                  
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Financial Tracking</div>
                    <Badge variant="outline">8</Badge>
                  </div>
                  <Progress value={50} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
                <CardDescription>Recent data updates</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">Site visit completed</p>
                      <p className="text-xs text-muted-foreground">2 hours ago</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">New MMP uploaded</p>
                      <p className="text-xs text-muted-foreground">Yesterday</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">Overdue site visit flagged</p>
                      <p className="text-xs text-muted-foreground">2 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Data Health</CardTitle>
                <CardDescription>Quality metrics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Completeness</span>
                      <span>94%</span>
                    </div>
                    <Progress value={94} className="h-2" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Consistency</span>
                      <span>88%</span>
                    </div>
                    <Progress value={88} className="h-2" />
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Timeliness</span>
                      <span>76%</span>
                    </div>
                    <Progress value={76} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="reporting" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Execution Overview</CardTitle>
              <CardDescription>
                Comparative analysis of project execution status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={reportData}
                    margin={{
                      top: 20,
                      right: 30,
                      left: 20,
                      bottom: 5,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="complete" stackId="a" fill="#10b981" name="Complete" />
                    <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" />
                    <Bar dataKey="overdue" stackId="a" fill="#ef4444" name="Overdue" />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">Key Performance Indicators</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="border rounded p-3">
                    <div className="text-sm text-muted-foreground">On-time Completion</div>
                    <div className="text-2xl font-bold">85%</div>
                    <div className="text-xs text-green-600">↑ 5% from last month</div>
                  </div>
                  <div className="border rounded p-3">
                    <div className="text-sm text-muted-foreground">Site Coverage</div>
                    <div className="text-2xl font-bold">92%</div>
                    <div className="text-xs text-green-600">↑ 3% from last month</div>
                  </div>
                  <div className="border rounded p-3">
                    <div className="text-sm text-muted-foreground">Data Quality</div>
                    <div className="text-2xl font-bold">78%</div>
                    <div className="text-xs text-red-600">↓ 2% from last month</div>
                  </div>
                  <div className="border rounded p-3">
                    <div className="text-sm text-muted-foreground">Project Alignment</div>
                    <div className="text-2xl font-bold">89%</div>
                    <div className="text-xs text-green-600">↑ 7% from last month</div>
                  </div>
                </div>
              </div>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm font-medium">Site Coverage Analysis</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="h-[400px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart
                        margin={{
                          top: 20,
                          right: 20,
                          bottom: 20,
                          left: 20,
                        }}
                      >
                        <CartesianGrid />
                        <XAxis type="number" dataKey="x" name="x" />
                        <YAxis type="number" dataKey="y" name="y" />
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload;
                              return (
                                <div className="bg-white p-2 border rounded shadow-sm">
                                  <p className="font-medium">{data.name}</p>
                                  <p className="text-xs">Coverage: {data.value}%</p>
                                  <p className="text-xs">Site Visits: {data.visits}</p>
                                  <p className="text-xs">Completed: {data.completed}</p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Scatter name="Sites" data={coverageData} fill="#8884d8">
                          {coverageData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Scatter>
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>

          {/* Add the rest of the reporting tab content here */}
        </TabsContent>

        <TabsContent value="compliance" className="space-y-4">
          {/* Add compliance tab content here */}
          <Card>
            <CardHeader>
              <CardTitle>Compliance & Audit Overview</CardTitle>
              <CardDescription>
                Monitor compliance metrics and audit trail
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center p-8 text-muted-foreground">
                <ShieldCheck className="h-12 w-12 mx-auto mb-2" />
                <p>Compliance monitoring dashboard is available here</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DataVisibility;
