import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Shield, ChartBar, Download, Bell, Calendar, Loader2 } from "lucide-react";
import AuditLogViewer from "@/components/AuditLogViewer";
import ComplianceTracker from "@/components/ComplianceTracker";
import { useToast } from "@/components/ui/use-toast";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { exportAuditLogsToCSV } from "@/utils/exportUtils";
import { useAudit } from "@/context/audit/AuditContext";

const AuditCompliancePage = () => {
  const [activeSection, setActiveSection] = useState<string>("audit-logs");
  const [timeFrame, setTimeFrame] = useState<string>("all");
  const [actionType, setActionType] = useState<string>("all");
  const { toast } = useToast();
  const { logs, loading, getAuditStats, getAuditLogs } = useAudit();

  const stats = useMemo(() => getAuditStats(), [logs]);

  const todayCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return logs.filter(l => new Date(l.timestamp) >= today).length;
  }, [logs]);

  const weekCount = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return logs.filter(l => new Date(l.timestamp) >= weekAgo).length;
  }, [logs]);

  const monthCount = useMemo(() => {
    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    return logs.filter(l => new Date(l.timestamp) >= monthAgo).length;
  }, [logs]);

  const criticalCount = useMemo(() => {
    return (stats.bySeverity?.critical || 0) + (stats.bySeverity?.error || 0);
  }, [stats]);

  const recentAlerts = useMemo(() => {
    return logs
      .filter(l => l.severity === 'warning' || l.severity === 'critical' || l.severity === 'error')
      .slice(0, 5);
  }, [logs]);

  const complianceScore = useMemo(() => {
    if (logs.length === 0) return 0;
    const successCount = logs.filter(l => l.success !== false).length;
    return Math.round((successCount / logs.length) * 100);
  }, [logs]);

  const warningCount = useMemo(() => stats.bySeverity?.warning || 0, [stats]);

  const handleGenerateReport = async () => {
    toast({
      title: "Report Generation Started",
      description: "Your comprehensive audit and compliance report is being prepared."
    });

    try {
      const allLogs = getAuditLogs();
      const exportData = allLogs.map(log => ({
        timestamp: log.timestamp,
        action: log.action,
        category: log.module,
        description: log.description,
        user: log.actorName,
        userRole: log.actorRole,
        details: log.details || '',
        status: log.success !== false ? 'success' : 'failed',
        severity: log.severity,
        entityType: log.entityType,
        entityName: log.entityName || '',
      }));

      exportAuditLogsToCSV(exportData, `comprehensive-audit-report-${new Date().toISOString().split('T')[0]}.csv`);

      toast({
        title: "Report Ready",
        description: `Report generated with ${exportData.length} audit entries.`
      });
    } catch (error) {
      toast({
        title: "Report Generation Failed",
        description: "There was an error generating the report. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleExportData = () => {
    try {
      const allLogs = getAuditLogs();
      const exportData = allLogs.map(log => ({
        timestamp: log.timestamp,
        action: log.action,
        category: log.module,
        description: log.description,
        user: log.actorName,
        userRole: log.actorRole,
        details: log.details || '',
        status: log.success !== false ? 'success' : 'failed',
        severity: log.severity,
        entityType: log.entityType,
        entityName: log.entityName || '',
      }));

      exportAuditLogsToCSV(exportData, `audit-data-export-${new Date().toISOString().split('T')[0]}.csv`);

      toast({
        title: "Data Exported",
        description: `${exportData.length} audit log entries exported successfully.`
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "There was an error exporting the data.",
        variant: "destructive"
      });
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-500';
      case 'error': return 'text-red-500';
      case 'warning': return 'text-amber-500';
      default: return 'text-blue-500';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit & Compliance</h1>
          <p className="text-muted-foreground">
            Comprehensive audit logs and compliance tracking
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleGenerateReport} disabled={loading} data-testid="button-generate-report">
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ChartBar className="h-4 w-4 mr-2" />}
            Generate Report
          </Button>
          <Button onClick={handleExportData} disabled={loading} data-testid="button-export-data">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Audit Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Today</span>
                  <span className="font-medium" data-testid="text-today-count">{todayCount} events</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">This Week</span>
                  <span className="font-medium" data-testid="text-week-count">{weekCount} events</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">This Month</span>
                  <span className="font-medium" data-testid="text-month-count">{monthCount} events</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-muted-foreground">Critical Events</span>
                  <Badge className={criticalCount > 0 ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"} data-testid="text-critical-count">
                    {criticalCount}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              Compliance Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Overall Score</span>
                  <span className="font-medium" data-testid="text-compliance-score">{complianceScore}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Critical Issues</span>
                  <span className="font-medium text-red-600" data-testid="text-critical-issues">{stats.bySeverity?.critical || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Warnings</span>
                  <span className="font-medium text-amber-600" data-testid="text-warnings">{warningCount}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-muted-foreground">Status</span>
                  {criticalCount > 0 ? (
                    <Badge className="bg-red-100 text-red-800">Critical</Badge>
                  ) : warningCount > 0 ? (
                    <Badge className="bg-amber-100 text-amber-800">Needs Attention</Badge>
                  ) : (
                    <Badge className="bg-green-100 text-green-800">Good</Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Bell className="h-5 w-5 text-amber-600" />
              Recent Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : recentAlerts.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No alerts at this time
              </div>
            ) : (
              <div className="space-y-2">
                {recentAlerts.slice(0, 3).map((alert, idx) => (
                  <div key={alert.id || idx} className="flex items-start gap-2">
                    <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${getSeverityColor(alert.severity)}`} />
                    <span className="text-sm line-clamp-2">
                      {alert.description}
                    </span>
                  </div>
                ))}
                {recentAlerts.length > 3 && (
                  <div className="pt-2 border-t text-right">
                    <span className="text-xs text-muted-foreground">
                      +{recentAlerts.length - 3} more alerts
                    </span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={activeSection} onValueChange={setActiveSection} className="w-full">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="audit-logs">
            <FileText className="h-4 w-4 mr-2" />
            Audit Logs
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <Shield className="h-4 w-4 mr-2" />
            Compliance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="audit-logs" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <CardTitle>Audit Log History</CardTitle>
                  <CardDescription>
                    Track all user interactions and system events
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>Time Range</span>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2" align="end">
                      <div className="grid gap-2">
                        <Select value={timeFrame} onValueChange={setTimeFrame}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select time range" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="week">This Week</SelectItem>
                            <SelectItem value="month">This Month</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </PopoverContent>
                  </Popover>

                  <Select value={actionType} onValueChange={setActionType}>
                    <SelectTrigger className="h-8 w-[130px]">
                      <SelectValue placeholder="Filter by action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      <SelectItem value="view">View</SelectItem>
                      <SelectItem value="edit">Edit</SelectItem>
                      <SelectItem value="approve">Approve</SelectItem>
                      <SelectItem value="reject">Reject</SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                      <SelectItem value="upload">Upload</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="ghost" size="sm" className="h-8" onClick={handleExportData} data-testid="button-export-logs">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <AuditLogViewer standalone={true} actionFilter={actionType} timeFilter={timeFrame} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle>Compliance Tracking</CardTitle>
              <CardDescription>
                Monitor compliance status and policy adherence
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComplianceTracker standalone={true} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditCompliancePage;
