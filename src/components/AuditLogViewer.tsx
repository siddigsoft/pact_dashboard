import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { 
  Download, Search, FileText, Shield, Bell, CalendarCheck, 
  AlertTriangle, FileX, FileCheck, Clock, User, Users, Settings,
  Edit, Eye, ArrowRight, ArrowUpRight, Lock, Unlock, RefreshCw,
  Trash2, Archive, Undo, Check, X, Upload, FileUp, Info
} from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { exportAuditLogsToCSV, exportAuditLogsToJSON } from "@/utils/exportUtils";
import { useMMP } from "@/context/mmp/MMPContext";
import { MMPFile } from "@/types";

interface AuditLogViewerProps {
  mmpId?: string;
  standalone?: boolean;
  actionFilter?: string;
  timeFilter?: string;
}

const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ 
  mmpId, 
  standalone = false,
  actionFilter = "all",
  timeFilter = "all" 
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [localActionFilter, setLocalActionFilter] = useState<string>(actionFilter);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>(timeFilter);
  const [currentView, setCurrentView] = useState<'timeline' | 'table'>('timeline');
  const { toast } = useToast();
  const { mmpFiles, getMmpById } = useMMP();
  const currentMMP: MMPFile | undefined = mmpId ? getMmpById(mmpId) : undefined;

  const getActionIcon = (action: string) => {
    switch(action.toLowerCase()) {
      case 'upload': return <FileUp className="h-4 w-4 text-blue-500" />;
      case 'validation': return <Shield className="h-4 w-4 text-amber-500" />;
      case 'edit': return <Edit className="h-4 w-4 text-purple-500" />;
      case 'view': return <Eye className="h-4 w-4 text-gray-500" />;
      case 'approval request': return <ArrowUpRight className="h-4 w-4 text-blue-500" />;
      case 'approve': return <Check className="h-4 w-4 text-green-500" />;
      case 'reject': return <X className="h-4 w-4 text-red-500" />;
      case 'lock': return <Lock className="h-4 w-4 text-orange-500" />;
      case 'unlock': return <Unlock className="h-4 w-4 text-green-500" />;
      case 'reset': return <RefreshCw className="h-4 w-4 text-blue-500" />;
      case 'delete': return <Trash2 className="h-4 w-4 text-red-500" />;
      case 'archive': return <Archive className="h-4 w-4 text-gray-500" />;
      case 'restore': return <Undo className="h-4 w-4 text-purple-500" />;
      case 'compliance check': return <Shield className="h-4 w-4 text-green-500" />;
      case 'security alert': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <Info className="h-4 w-4 text-gray-500" />;
    }
  };

  const buildLogsFromMMP = (file: MMPFile) => {
    const logs: any[] = [];
    if (file.uploadedAt) {
      logs.push({
        id: `upload-${file.id}`,
        timestamp: file.uploadedAt,
        action: 'Upload',
        category: 'Document',
        description: `File ${file.originalFilename || file.name} uploaded`,
        user: file.uploadedBy || 'Unknown',
        userRole: 'User',
        details: `Entries: ${file.entries ?? 0}`,
        status: 'success',
        ipAddress: 'N/A',
        deviceInfo: 'N/A',
      });
    }
    if (file.modificationHistory && Array.isArray(file.modificationHistory)) {
      file.modificationHistory.forEach((m, idx) => {
        logs.push({
          id: `edit-${file.id}-${idx}`,
          timestamp: m.timestamp,
          action: 'Edit',
          category: 'Data',
          description: 'MMP data modified',
          user: m.modifiedBy || 'Unknown',
          userRole: 'User',
          details: m.changes,
          metadata: { previousVersion: m.previousVersion, newVersion: m.newVersion },
          status: 'success',
          ipAddress: 'N/A',
          deviceInfo: 'N/A',
        });
      });
    }
    if (file.approvedAt) {
      logs.push({
        id: `approve-${file.id}`,
        timestamp: file.approvedAt,
        action: 'Approve',
        category: 'Workflow',
        description: 'MMP approved',
        user: file.approvedBy || 'Unknown',
        userRole: 'Approver',
        details: 'Approval completed',
        status: 'success',
        ipAddress: 'N/A',
        deviceInfo: 'N/A',
      });
    }
    if (file.status === 'rejected' || file.rejectionReason) {
      logs.push({
        id: `reject-${file.id}`,
        timestamp: file.modifiedAt || file.uploadedAt || new Date().toISOString(),
        action: 'Reject',
        category: 'Workflow',
        description: 'MMP rejected',
        user: 'Reviewer',
        userRole: 'Reviewer',
        details: file.rejectionReason || 'Rejected',
        status: 'error',
        ipAddress: 'N/A',
        deviceInfo: 'N/A',
      });
    }
    if (file.archivedAt) {
      logs.push({
        id: `archive-${file.id}`,
        timestamp: file.archivedAt,
        action: 'Archive',
        category: 'Workflow',
        description: 'MMP archived',
        user: file.archivedBy || 'Unknown',
        userRole: 'User',
        details: 'Archived',
        status: 'success',
        ipAddress: 'N/A',
        deviceInfo: 'N/A',
      });
    }
    if (file.deletedAt) {
      logs.push({
        id: `delete-${file.id}`,
        timestamp: file.deletedAt,
        action: 'Delete',
        category: 'Workflow',
        description: 'MMP deleted',
        user: file.deletedBy || 'Unknown',
        userRole: 'User',
        details: 'Deleted',
        status: 'error',
        ipAddress: 'N/A',
        deviceInfo: 'N/A',
      });
    }
    // Sort by timestamp desc
    return logs
      .filter(l => !!l.timestamp)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const logs = useMemo(() => {
    if (currentMMP) return buildLogsFromMMP(currentMMP);
    if (standalone) return (mmpFiles || []).flatMap(buildLogsFromMMP);
    return [] as any[];
  }, [currentMMP, mmpFiles, standalone]);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800">Success</Badge>;
      case 'warning':
        return <Badge className="bg-amber-100 text-amber-800">Warning</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800">Error</Badge>;
      case 'info':
        return <Badge className="bg-blue-100 text-blue-800">Info</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const filteredLogs = logs
    .filter(log => {
      if (searchQuery === "") return true;
      return (
        log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.details.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.action.toLowerCase().includes(searchQuery.toLowerCase())
      );
    })
    .filter(log => {
      if (localActionFilter === 'all') return true;
      const a = log.action.toLowerCase();
      if (localActionFilter === 'approval') return a.includes('approve') || a.includes('reject') || a.includes('approval');
      if (localActionFilter === 'security') return a.includes('security');
      return a === localActionFilter.toLowerCase();
    })
    .filter(log => categoryFilter === "all" || log.category.toLowerCase() === categoryFilter.toLowerCase())
    .filter(log => {
      if (dateRange === "all") return true;
      const logDate = new Date(log.timestamp);
      const now = new Date();
      switch(dateRange) {
        case "today":
          return logDate.toDateString() === now.toDateString();
        case "week":
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return logDate >= weekAgo;
        case "month":
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return logDate >= monthAgo;
        default:
          return true;
      }
    });

  const handleExport = (format: 'csv' | 'json') => {
    try {
      if (format === 'csv') {
        exportAuditLogsToCSV(filteredLogs);
      } else {
        exportAuditLogsToJSON(filteredLogs);
      }
      
      toast({
        title: "Export Successful",
        description: `Audit report successfully exported in ${format.toUpperCase()} format.`,
      });
    } catch (error) {
      console.error("Export error:", error);
      toast({
        title: "Export Failed",
        description: "There was an error exporting the audit report.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card className={standalone ? "" : "mt-6"}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          {standalone ? "Audit Logs" : "MMP Audit Trail"}
        </CardTitle>
        <CardDescription>
          Comprehensive audit trail showing all actions and changes
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-grow">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search audit logs..."
                className="pl-8 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <Select value={localActionFilter} onValueChange={setLocalActionFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                  <SelectItem value="validation">Validation</SelectItem>
                  <SelectItem value="edit">Edit</SelectItem>
                  <SelectItem value="view">View</SelectItem>
                  <SelectItem value="approval">Approval</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="compliance">Compliance</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Time Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button
              variant={currentView === 'timeline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('timeline')}
            >
              Timeline View
            </Button>
            <Button
              variant={currentView === 'table' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCurrentView('table')}
            >
              Table View
            </Button>
          </div>

          <div className="border rounded-md">
            <ScrollArea className="h-[400px]">
              {currentView === 'timeline' && (
                <div className="relative p-4">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-6 pl-10">
                    {filteredLogs.map((log) => (
                      <div key={log.id} className="relative">
                        <div className="absolute -left-[34px] p-2 rounded-full bg-background border">
                          {getActionIcon(log.action)}
                        </div>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{log.action}</span>
                                  {getStatusBadge(log.status)}
                                </div>
                                <HoverCard>
                                  <HoverCardTrigger>
                                    <div className="flex items-center text-sm text-muted-foreground">
                                      <Clock className="h-3 w-3 mr-1" />
                                      {format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}
                                    </div>
                                  </HoverCardTrigger>
                                  <HoverCardContent className="w-80">
                                    <div className="space-y-2">
                                      <p className="text-sm font-medium">Event Details</p>
                                      <div className="text-sm">
                                        <p><span className="font-medium">IP Address:</span> {log.ipAddress}</p>
                                        <p><span className="font-medium">Device:</span> {log.deviceInfo}</p>
                                        {log.relatedRecords && (
                                          <p><span className="font-medium">Related Records:</span> {log.relatedRecords.join(', ')}</p>
                                        )}
                                      </div>
                                    </div>
                                  </HoverCardContent>
                                </HoverCard>
                              </div>
                              <p className="text-sm">{log.description}</p>
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span>{log.user}</span>
                                <Badge variant="outline" className="text-xs">
                                  {log.userRole}
                                </Badge>
                              </div>
                              {log.metadata && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" size="sm" className="mt-2">
                                      View Details
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                      <h4 className="font-medium">Detailed Information</h4>
                                      <div className="text-sm space-y-1">
                                        {Object.entries(log.metadata).map(([key, value]) => (
                                          <div key={key}>
                                            <span className="font-medium capitalize">
                                              {key.replace(/([A-Z])/g, ' $1').trim()}:
                                            </span>
                                            <span className="ml-1">
                                              {Array.isArray(value) 
                                                ? value.join(', ')
                                                : typeof value === 'object'
                                                  ? JSON.stringify(value, null, 2)
                                                  : String(value)
                                              }
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentView === 'table' && (
                <div className="w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Action</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getActionIcon(log.action)}
                              <span>{log.action}</span>
                            </div>
                          </TableCell>
                          <TableCell>{log.description}</TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span>{log.user}</span>
                              <span className="text-xs text-muted-foreground">{log.userRole}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <HoverCard>
                              <HoverCardTrigger>
                                <div className="flex items-center gap-1">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  {format(new Date(log.timestamp), 'MMM d, yyyy h:mm a')}
                                </div>
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80">
                                <div className="space-y-2">
                                  <p className="text-sm font-medium">Event Details</p>
                                  <div className="text-sm">
                                    <p><span className="font-medium">IP Address:</span> {log.ipAddress}</p>
                                    <p><span className="font-medium">Device:</span> {log.deviceInfo}</p>
                                    {log.relatedRecords && (
                                      <p><span className="font-medium">Related Records:</span> {log.relatedRecords.join(', ')}</p>
                                    )}
                                  </div>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          </TableCell>
                          <TableCell>{getStatusBadge(log.status)}</TableCell>
                          <TableCell>
                            <div className="max-w-[300px]">
                              <p className="truncate">{log.details}</p>
                              {log.metadata && (
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="link" size="sm" className="h-auto p-0">
                                      View Details
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-80">
                                    <div className="space-y-2">
                                      <h4 className="font-medium">Detailed Information</h4>
                                      <div className="text-sm space-y-1">
                                        {Object.entries(log.metadata).map(([key, value]) => (
                                          <div key={key}>
                                            <span className="font-medium capitalize">
                                              {key.replace(/([A-Z])/g, ' $1').trim()}:
                                            </span>
                                            <span className="ml-1">
                                              {Array.isArray(value) 
                                                ? value.join(', ')
                                                : typeof value === 'object'
                                                  ? JSON.stringify(value, null, 2)
                                                  : String(value)
                                              }
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Showing {filteredLogs.length} of {logs.length} logs
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Audit Report
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('json')}>
                  Export as JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuditLogViewer;
