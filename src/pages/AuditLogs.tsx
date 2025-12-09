import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useAudit } from '@/context/audit/AuditContext';
import { 
  AuditModule, 
  AuditAction, 
  AuditSeverity,
  AuditLogEntry,
  AUDIT_MODULE_LABELS, 
  AUDIT_ACTION_LABELS,
  AUDIT_SEVERITY_LABELS 
} from '@/types/audit-trail';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  Filter, 
  Download, 
  RefreshCw, 
  Calendar,
  User,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  Shield
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';

const AuditLogs = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useSuperAdmin();
  const { logs, loading, getAuditStats, refreshLogs, exportLogs } = useAudit();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<AuditModule | 'all'>('all');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AuditSeverity | 'all'>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('timeline');

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">Only Super Admins can access the Audit Log Explorer.</p>
        <Button onClick={() => navigate('/dashboard')} data-testid="button-go-to-dashboard">
          Go to Dashboard
        </Button>
      </div>
    );
  }

  const stats = useMemo(() => getAuditStats(), [logs]);

  const filteredLogs = useMemo(() => {
    let result = [...logs];

    if (moduleFilter !== 'all') {
      result = result.filter(log => log.module === moduleFilter);
    }

    if (actionFilter !== 'all') {
      result = result.filter(log => log.action === actionFilter);
    }

    if (severityFilter !== 'all') {
      result = result.filter(log => log.severity === severityFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(log =>
        log.description.toLowerCase().includes(query) ||
        log.actorName.toLowerCase().includes(query) ||
        log.entityName?.toLowerCase().includes(query) ||
        log.entityId.toLowerCase().includes(query)
      );
    }

    return result;
  }, [logs, moduleFilter, actionFilter, severityFilter, searchQuery]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, AuditLogEntry[]> = {};
    
    for (const log of filteredLogs) {
      const date = parseISO(log.timestamp);
      let key: string;
      
      if (isToday(date)) {
        key = 'Today';
      } else if (isYesterday(date)) {
        key = 'Yesterday';
      } else {
        key = format(date, 'MMMM d, yyyy');
      }
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(log);
    }
    
    return groups;
  }, [filteredLogs]);

  const getSeverityColor = (severity: AuditSeverity) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'error': return 'destructive';
      case 'warning': return 'secondary';
      default: return 'outline';
    }
  };

  const getSeverityIcon = (severity: AuditSeverity) => {
    switch (severity) {
      case 'critical': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'error': return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
  };

  const handleExport = () => {
    const data = exportLogs({
      module: moduleFilter !== 'all' ? moduleFilter : undefined,
      action: actionFilter !== 'all' ? actionFilter : undefined,
      severity: severityFilter !== 'all' ? severityFilter : undefined,
      searchQuery: searchQuery || undefined,
    });
    
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  const moduleOptions = Object.entries(AUDIT_MODULE_LABELS) as [AuditModule, string][];
  const actionOptions = Object.entries(AUDIT_ACTION_LABELS) as [AuditAction, string][];
  const severityOptions = Object.entries(AUDIT_SEVERITY_LABELS) as [AuditSeverity, string][];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Audit Log Explorer</h1>
          <p className="text-muted-foreground">Complete audit trail of all system activities</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refreshLogs()}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExport}
            data-testid="button-export-logs"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-logs">{stats.totalLogs}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-warning-count">{stats.bySeverity.warning || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-error-count">{stats.bySeverity.error || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <Shield className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-critical-count">{stats.bySeverity.critical || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-logs"
              />
            </div>
            <Select value={moduleFilter} onValueChange={(v) => setModuleFilter(v as AuditModule | 'all')}>
              <SelectTrigger data-testid="select-module-filter">
                <SelectValue placeholder="All Modules" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {moduleOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={(v) => setActionFilter(v as AuditAction | 'all')}>
              <SelectTrigger data-testid="select-action-filter">
                <SelectValue placeholder="All Actions" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actionOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as AuditSeverity | 'all')}>
              <SelectTrigger data-testid="select-severity-filter">
                <SelectValue placeholder="All Severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Severities</SelectItem>
                {severityOptions.map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="table" data-testid="tab-table">
            <FileText className="h-4 w-4 mr-2" />
            Table View
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">
            <Activity className="h-4 w-4 mr-2" />
            Statistics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : Object.keys(groupedByDate).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mb-4" />
                    <p>No audit logs found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {Object.entries(groupedByDate).map(([date, dayLogs]) => (
                      <div key={date}>
                        <div className="sticky top-0 bg-muted/50 backdrop-blur px-4 py-2 text-sm font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4" />
                          {date}
                          <Badge variant="outline" className="ml-2">{dayLogs.length}</Badge>
                        </div>
                        <div className="divide-y">
                          {dayLogs.map((log) => (
                            <div 
                              key={log.id} 
                              className="px-4 py-3 hover-elevate cursor-pointer"
                              onClick={() => toggleLogExpanded(log.id)}
                              data-testid={`audit-log-${log.id}`}
                            >
                              <div className="flex items-start gap-3">
                                <div className="mt-0.5">
                                  {getSeverityIcon(log.severity)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium truncate">{log.description}</span>
                                    <Badge variant={getSeverityColor(log.severity)} className="text-xs">
                                      {AUDIT_SEVERITY_LABELS[log.severity]}
                                    </Badge>
                                    <Badge variant="outline" className="text-xs">
                                      {AUDIT_MODULE_LABELS[log.module]}
                                    </Badge>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {log.actorName}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {format(parseISO(log.timestamp), 'HH:mm:ss')}
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <Activity className="h-3 w-3" />
                                      {AUDIT_ACTION_LABELS[log.action]}
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  {expandedLogId === log.id ? (
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                              </div>
                              {expandedLogId === log.id && (
                                <div className="mt-3 ml-7 p-3 bg-muted rounded-md text-sm space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-muted-foreground">Entity Type:</span>
                                      <span className="ml-2 font-medium">{log.entityType}</span>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Entity ID:</span>
                                      <span className="ml-2 font-mono text-xs">{log.entityId}</span>
                                    </div>
                                    {log.entityName && (
                                      <div>
                                        <span className="text-muted-foreground">Entity Name:</span>
                                        <span className="ml-2 font-medium">{log.entityName}</span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-muted-foreground">Actor Role:</span>
                                      <span className="ml-2 font-medium">{log.actorRole}</span>
                                    </div>
                                    {log.workflowStep && (
                                      <div>
                                        <span className="text-muted-foreground">Workflow Step:</span>
                                        <Badge variant="outline" className="ml-2">{log.workflowStep}</Badge>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-muted-foreground">Success:</span>
                                      <span className="ml-2">
                                        {log.success ? (
                                          <CheckCircle className="h-4 w-4 inline text-green-500" />
                                        ) : (
                                          <XCircle className="h-4 w-4 inline text-destructive" />
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  {log.details && (
                                    <div className="pt-2 border-t">
                                      <span className="text-muted-foreground">Details:</span>
                                      <p className="mt-1">{log.details}</p>
                                    </div>
                                  )}
                                  {log.changes && Object.keys(log.changes).length > 0 && (
                                    <div className="pt-2 border-t">
                                      <span className="text-muted-foreground">Changes:</span>
                                      <div className="mt-1 space-y-1">
                                        {Object.entries(log.changes).map(([field, change]) => (
                                          <div key={field} className="flex items-center gap-2 text-xs">
                                            <span className="font-medium">{field}:</span>
                                            <span className="text-destructive line-through">{String(change.from)}</span>
                                            <span className="text-muted-foreground">→</span>
                                            <span className="text-green-600">{String(change.to)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {log.errorMessage && (
                                    <div className="pt-2 border-t text-destructive">
                                      <span className="font-medium">Error:</span>
                                      <p className="mt-1">{log.errorMessage}</p>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr className="text-left text-sm text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                      <th className="px-4 py-3 font-medium">Module</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Actor</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredLogs.map((log) => (
                      <tr 
                        key={log.id} 
                        className="hover-elevate cursor-pointer"
                        onClick={() => toggleLogExpanded(log.id)}
                        data-testid={`table-row-${log.id}`}
                      >
                        <td className="px-4 py-3 text-sm font-mono">
                          {format(parseISO(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{AUDIT_MODULE_LABELS[log.module]}</Badge>
                        </td>
                        <td className="px-4 py-3 text-sm">{AUDIT_ACTION_LABELS[log.action]}</td>
                        <td className="px-4 py-3 text-sm">{log.actorName}</td>
                        <td className="px-4 py-3 text-sm max-w-md truncate">{log.description}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getSeverityColor(log.severity)}>
                            {AUDIT_SEVERITY_LABELS[log.severity]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stats" className="mt-4">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Activity by Module</CardTitle>
                <CardDescription>Distribution of audit events across system modules</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(stats.byModule)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10)
                    .map(([module, count]) => (
                      <div key={module} className="flex items-center justify-between">
                        <span className="text-sm">{AUDIT_MODULE_LABELS[module as AuditModule]}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${(count / stats.totalLogs) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top Actions</CardTitle>
                <CardDescription>Most frequent action types</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(stats.byAction)
                    .sort(([,a], [,b]) => b - a)
                    .slice(0, 10)
                    .map(([action, count]) => (
                      <div key={action} className="flex items-center justify-between">
                        <span className="text-sm">{AUDIT_ACTION_LABELS[action as AuditAction]}</span>
                        <div className="flex items-center gap-2">
                          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${(count / stats.totalLogs) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium w-12 text-right">{count}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-lg">Most Active Users</CardTitle>
                <CardDescription>Users with the most recorded activities</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                  {stats.topActors.map((actor, index) => (
                    <div key={actor.actorId} className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                      <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-bold">
                        {index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{actor.actorName}</p>
                        <p className="text-xs text-muted-foreground">{actor.count} activities</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditLogs;
