import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useAudit } from '@/context/audit/AuditContext';
import { 
  AuditModule, 
  AuditAction, 
  AuditSeverity,
  AuditLogEntry,
  WorkflowStep,
  AUDIT_MODULE_LABELS, 
  AUDIT_ACTION_LABELS,
  AUDIT_SEVERITY_LABELS,
  WORKFLOW_STEP_LABELS
} from '@/types/audit-trail';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
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
  Shield,
  GitBranch,
  ArrowRight,
  Circle,
  PlayCircle,
  PauseCircle,
  StopCircle,
  Users,
  Zap,
  FileSpreadsheet,
  X,
  Info,
  RotateCcw,
  Eye,
  TrendingUp,
  History,
  ChevronLeft,
  MousePointer
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO, subDays, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import activityTracker, { ActivityEntry, ActivityType, ActivityCategory } from '@/services/activity-tracking.service';

interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  hubId?: string;
}

const AuditLogs = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useSuperAdmin();
  const { logs, loading, getAuditStats, refreshLogs, exportLogs } = useAudit();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState<AuditModule | 'all'>('all');
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AuditSeverity | 'all'>('all');
  const [successFilter, setSuccessFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('timeline');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [quickDateFilter, setQuickDateFilter] = useState<string>('all');
  const [newLogCount, setNewLogCount] = useState(0);
  const [lastLogCount, setLastLogCount] = useState(0);
  const [isLiveMode, setIsLiveMode] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const logsPerPage = 100;
  
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [liveActivities, setLiveActivities] = useState<ActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityType | 'all'>('all');
  const [activityCategoryFilter, setActivityCategoryFilter] = useState<ActivityCategory | 'all'>('all');

  // Fetch all user profiles
  useEffect(() => {
    const fetchProfiles = async () => {
      setProfilesLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, status, created_at, updated_at, hub_id')
          .order('updated_at', { ascending: false });
        
        if (!error && data) {
          setAllProfiles(data.map(p => ({
            id: p.id,
            fullName: p.full_name || 'Unknown User',
            email: p.email || '',
            role: p.role || 'user',
            status: p.status || 'unknown',
            createdAt: p.created_at,
            updatedAt: p.updated_at,
            hubId: p.hub_id
          })));
        }
      } catch (err) {
        console.error('[AuditLogs] Error fetching profiles:', err);
      } finally {
        setProfilesLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  // Refresh live activities periodically
  useEffect(() => {
    const refreshActivities = () => {
      const activities = activityTracker.getActivities({ limit: 500 });
      setLiveActivities(activities);
    };
    
    refreshActivities();
    const interval = setInterval(refreshActivities, 5000);
    return () => clearInterval(interval);
  }, []);

  // Filtered live activities
  const filteredActivities = useMemo(() => {
    let result = [...liveActivities];
    
    if (activityFilter !== 'all') {
      result = result.filter(a => a.activityType === activityFilter);
    }
    if (activityCategoryFilter !== 'all') {
      result = result.filter(a => a.category === activityCategoryFilter);
    }
    
    return result;
  }, [liveActivities, activityFilter, activityCategoryFilter]);

  const activityStats = useMemo(() => activityTracker.getActivityStats(), [liveActivities]);

  // Auto-refresh in live mode
  useEffect(() => {
    if (isLiveMode) {
      const interval = setInterval(() => {
        refreshLogs();
      }, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval);
    }
  }, [isLiveMode, refreshLogs]);

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

  // Get unique actors for the filter dropdown
  const uniqueActors = useMemo(() => {
    const actors = new Map<string, { id: string; name: string; email?: string; count: number }>();
    for (const log of logs) {
      if (!actors.has(log.actorId)) {
        actors.set(log.actorId, {
          id: log.actorId,
          name: log.actorName,
          email: log.actorEmail,
          count: 1,
        });
      } else {
        const actor = actors.get(log.actorId)!;
        actor.count++;
      }
    }
    return Array.from(actors.values()).sort((a, b) => b.count - a.count);
  }, [logs]);

  // Apply quick date filter
  const getDateRangeFromQuickFilter = (filter: string) => {
    const now = new Date();
    switch (filter) {
      case 'today':
        return { from: startOfDay(now), to: endOfDay(now) };
      case 'yesterday':
        return { from: startOfDay(subDays(now, 1)), to: endOfDay(subDays(now, 1)) };
      case 'last7days':
        return { from: startOfDay(subDays(now, 7)), to: endOfDay(now) };
      case 'last30days':
        return { from: startOfDay(subDays(now, 30)), to: endOfDay(now) };
      case 'last90days':
        return { from: startOfDay(subDays(now, 90)), to: endOfDay(now) };
      default:
        return { from: undefined, to: undefined };
    }
  };

  const effectiveDateRange = useMemo(() => {
    if (quickDateFilter !== 'all' && quickDateFilter !== 'custom') {
      return getDateRangeFromQuickFilter(quickDateFilter);
    }
    return dateRange;
  }, [quickDateFilter, dateRange]);

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

    if (successFilter !== 'all') {
      result = result.filter(log => successFilter === 'success' ? log.success : !log.success);
    }

    if (actorFilter !== 'all') {
      result = result.filter(log => log.actorId === actorFilter);
    }

    // Date range filter
    if (effectiveDateRange.from || effectiveDateRange.to) {
      result = result.filter(log => {
        const logDate = parseISO(log.timestamp);
        if (effectiveDateRange.from && effectiveDateRange.to) {
          return isWithinInterval(logDate, { start: effectiveDateRange.from, end: effectiveDateRange.to });
        }
        if (effectiveDateRange.from) {
          return logDate >= effectiveDateRange.from;
        }
        if (effectiveDateRange.to) {
          return logDate <= effectiveDateRange.to;
        }
        return true;
      });
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(log =>
        log.description.toLowerCase().includes(query) ||
        log.actorName.toLowerCase().includes(query) ||
        log.entityName?.toLowerCase().includes(query) ||
        log.entityId.toLowerCase().includes(query) ||
        log.actorEmail?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [logs, moduleFilter, actionFilter, severityFilter, successFilter, actorFilter, effectiveDateRange, searchQuery]);

  // Pagination
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * logsPerPage;
    return filteredLogs.slice(startIndex, startIndex + logsPerPage);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / logsPerPage);

  // Track new logs based on filtered count - only increment on actual new logs
  const [prevFilterKey, setPrevFilterKey] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);
  const filterKey = `${moduleFilter}-${actionFilter}-${severityFilter}-${successFilter}-${actorFilter}-${quickDateFilter}-${dateRange.from?.getTime()}-${dateRange.to?.getTime()}-${searchQuery}-${currentPage}`;
  
  useEffect(() => {
    // If filters or page changed, reset the counter and mark as initialized
    if (filterKey !== prevFilterKey) {
      setNewLogCount(0);
      setLastLogCount(filteredLogs.length);
      setPrevFilterKey(filterKey);
      setIsInitialized(true);
      return;
    }
    // Only increment if we're initialized and new logs arrived (not just filter changes)
    if (isInitialized && filteredLogs.length > lastLogCount) {
      setNewLogCount(filteredLogs.length - lastLogCount);
    }
    setLastLogCount(filteredLogs.length);
  }, [filteredLogs.length, filterKey, prevFilterKey, lastLogCount, isInitialized]);

  const groupedByDate = useMemo(() => {
    const groups: Record<string, AuditLogEntry[]> = {};
    
    for (const log of paginatedLogs) {
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
  }, [paginatedLogs]);

  interface EntityWorkflow {
    entityId: string;
    entityType: string;
    entityName?: string;
    module: AuditModule;
    logs: AuditLogEntry[];
    currentStep: WorkflowStep | null;
    lastActivity: string;
    isCompleted: boolean;
    hasFailed: boolean;
    totalActions: number;
  }

  const groupedByEntity = useMemo(() => {
    const entities: Record<string, EntityWorkflow> = {};
    
    for (const log of filteredLogs) {
      const key = `${log.entityType}:${log.entityId}`;
      
      if (!entities[key]) {
        entities[key] = {
          entityId: log.entityId,
          entityType: log.entityType,
          entityName: log.entityName,
          module: log.module,
          logs: [],
          currentStep: null,
          lastActivity: log.timestamp,
          isCompleted: false,
          hasFailed: false,
          totalActions: 0,
        };
      }
      
      entities[key].logs.push(log);
      entities[key].totalActions++;
      
      if (log.entityName && !entities[key].entityName) {
        entities[key].entityName = log.entityName;
      }
    }
    
    for (const entity of Object.values(entities)) {
      const sortedLogs = [...entity.logs].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      entity.lastActivity = sortedLogs[0]?.timestamp || entity.lastActivity;
      
      for (const log of sortedLogs) {
        if (log.workflowStep) {
          entity.currentStep = log.workflowStep;
          entity.isCompleted = log.workflowStep === 'completed';
          entity.hasFailed = log.workflowStep === 'failed' || log.workflowStep === 'cancelled';
          break;
        }
      }
    }
    
    return Object.values(entities).sort(
      (a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );
  }, [filteredLogs]);

  // Group by user for User Activity tab - Enhanced to include ALL users from profiles
  interface UserActivity {
    userId: string;
    userName: string;
    userEmail?: string;
    userRole: string;
    userStatus: string;
    registeredAt: string;
    lastProfileUpdate: string;
    logs: AuditLogEntry[];
    lastActivity: string;
    totalActions: number;
    moduleBreakdown: Record<string, number>;
    severityBreakdown: Record<string, number>;
    successRate: number;
    isFromProfile: boolean;
    firstActivityAt?: string;
  }

  const groupedByUser = useMemo(() => {
    const users: Record<string, UserActivity> = {};
    
    // First, add ALL users from profiles (so everyone appears even without activity)
    for (const profile of allProfiles) {
      users[profile.id] = {
        userId: profile.id,
        userName: profile.fullName,
        userEmail: profile.email,
        userRole: profile.role,
        userStatus: profile.status,
        registeredAt: profile.createdAt,
        lastProfileUpdate: profile.updatedAt,
        logs: [],
        lastActivity: profile.updatedAt,
        totalActions: 0,
        moduleBreakdown: {},
        severityBreakdown: {},
        successRate: 100,
        isFromProfile: true,
      };
    }
    
    // Then add/merge with audit log activity data
    for (const log of filteredLogs) {
      if (!users[log.actorId]) {
        users[log.actorId] = {
          userId: log.actorId,
          userName: log.actorName,
          userEmail: log.actorEmail,
          userRole: log.actorRole,
          userStatus: 'unknown',
          registeredAt: '',
          lastProfileUpdate: '',
          logs: [],
          lastActivity: log.timestamp,
          totalActions: 0,
          moduleBreakdown: {},
          severityBreakdown: {},
          successRate: 0,
          isFromProfile: false,
        };
      }
      
      const user = users[log.actorId];
      user.logs.push(log);
      user.totalActions++;
      user.moduleBreakdown[log.module] = (user.moduleBreakdown[log.module] || 0) + 1;
      user.severityBreakdown[log.severity] = (user.severityBreakdown[log.severity] || 0) + 1;
      
      // Track first activity
      if (!user.firstActivityAt || new Date(log.timestamp) < new Date(user.firstActivityAt)) {
        user.firstActivityAt = log.timestamp;
      }
      
      // Track last activity
      if (new Date(log.timestamp) > new Date(user.lastActivity)) {
        user.lastActivity = log.timestamp;
      }
    }
    
    // Calculate success rates
    for (const user of Object.values(users)) {
      if (user.totalActions > 0) {
        const successCount = user.logs.filter(l => l.success).length;
        user.successRate = (successCount / user.totalActions) * 100;
      }
    }
    
    // Sort by last activity (most recent first), then by total actions
    return Object.values(users).sort((a, b) => {
      // Users with activity come first
      if (a.totalActions > 0 && b.totalActions === 0) return -1;
      if (b.totalActions > 0 && a.totalActions === 0) return 1;
      // Then by last activity
      return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
    });
  }, [filteredLogs, allProfiles]);

  const getWorkflowStepIcon = (step: WorkflowStep | null, isCompleted: boolean, hasFailed: boolean) => {
    if (hasFailed) {
      return <StopCircle className="h-5 w-5 text-destructive" />;
    }
    if (isCompleted) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (!step) {
      return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
    switch (step) {
      case 'initiated':
        return <PlayCircle className="h-5 w-5 text-blue-500" />;
      case 'pending_approval':
        return <PauseCircle className="h-5 w-5 text-yellow-500" />;
      case 'approved':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'in_progress':
        return <PlayCircle className="h-5 w-5 text-blue-500" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'cancelled':
        return <StopCircle className="h-5 w-5 text-muted-foreground" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Circle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getWorkflowStatusBadge = (step: WorkflowStep | null, isCompleted: boolean, hasFailed: boolean) => {
    if (hasFailed) {
      return <Badge variant="destructive">Failed</Badge>;
    }
    if (isCompleted) {
      return <Badge className="bg-green-500 dark:bg-green-600 text-white">Completed</Badge>;
    }
    if (!step) {
      return <Badge variant="outline">Unknown</Badge>;
    }
    switch (step) {
      case 'initiated':
        return <Badge className="bg-blue-500 dark:bg-blue-600 text-white">Initiated</Badge>;
      case 'pending_approval':
        return <Badge className="bg-yellow-500 dark:bg-yellow-600 text-white">Pending Approval</Badge>;
      case 'approved':
        return <Badge className="bg-green-500 dark:bg-green-600 text-white">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-500 dark:bg-blue-600 text-white">In Progress</Badge>;
      case 'completed':
        return <Badge className="bg-green-500 dark:bg-green-600 text-white">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelled</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{WORKFLOW_STEP_LABELS[step]}</Badge>;
    }
  };

  const toggleEntityExpanded = (entityKey: string) => {
    setExpandedEntityId(expandedEntityId === entityKey ? null : entityKey);
  };

  const toggleUserExpanded = (userId: string) => {
    setExpandedUserId(expandedUserId === userId ? null : userId);
  };

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

  const handleExportJSON = () => {
    // Export all filtered logs (respects all active filters including dates, success, actor)
    const data = JSON.stringify(filteredLogs, null, 2);
    
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

  const handleExportExcel = () => {
    const exportData = filteredLogs.map(log => ({
      'Timestamp': format(parseISO(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      'Module': AUDIT_MODULE_LABELS[log.module],
      'Action': AUDIT_ACTION_LABELS[log.action],
      'Severity': AUDIT_SEVERITY_LABELS[log.severity],
      'Actor': log.actorName,
      'Actor Email': log.actorEmail || '',
      'Actor Role': log.actorRole,
      'Entity Type': log.entityType,
      'Entity ID': log.entityId,
      'Entity Name': log.entityName || '',
      'Description': log.description,
      'Details': log.details || '',
      'Success': log.success ? 'Yes' : 'No',
      'Error': log.errorMessage || '',
      'Workflow Step': log.workflowStep ? WORKFLOW_STEP_LABELS[log.workflowStep] : '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit Logs');
    
    // Auto-size columns
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.max(key.length, 15)
    }));
    worksheet['!cols'] = colWidths;
    
    XLSX.writeFile(workbook, `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.xlsx`);
  };

  const handleExportCSV = () => {
    const exportData = filteredLogs.map(log => ({
      'Timestamp': format(parseISO(log.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      'Module': AUDIT_MODULE_LABELS[log.module],
      'Action': AUDIT_ACTION_LABELS[log.action],
      'Severity': AUDIT_SEVERITY_LABELS[log.severity],
      'Actor': log.actorName,
      'Actor Email': log.actorEmail || '',
      'Description': log.description,
      'Success': log.success ? 'Yes' : 'No',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd-HHmm')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogId(expandedLogId === logId ? null : logId);
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setModuleFilter('all');
    setActionFilter('all');
    setSeverityFilter('all');
    setSuccessFilter('all');
    setActorFilter('all');
    setQuickDateFilter('all');
    setDateRange({ from: undefined, to: undefined });
    setCurrentPage(1);
    setNewLogCount(0);
  };

  const hasActiveFilters = moduleFilter !== 'all' || actionFilter !== 'all' || 
    severityFilter !== 'all' || successFilter !== 'all' || actorFilter !== 'all' ||
    quickDateFilter !== 'all' || searchQuery.trim() !== '';

  const moduleOptions = Object.entries(AUDIT_MODULE_LABELS) as [AuditModule, string][];
  const actionOptions = Object.entries(AUDIT_ACTION_LABELS) as [AuditAction, string][];
  const severityOptions = Object.entries(AUDIT_SEVERITY_LABELS) as [AuditSeverity, string][];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Audit Log Explorer</h1>
            {newLogCount > 0 && (
              <Badge className="bg-green-500 text-white animate-pulse" data-testid="badge-new-logs">
                <Zap className="h-3 w-3 mr-1" />
                {newLogCount} new
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground">Complete audit trail of all system activities</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Live Mode Toggle */}
          <div className="flex items-center gap-2 mr-2">
            <Switch
              id="live-mode"
              checked={isLiveMode}
              onCheckedChange={setIsLiveMode}
              data-testid="switch-live-mode"
            />
            <Label htmlFor="live-mode" className="flex items-center gap-1 text-sm cursor-pointer">
              {isLiveMode ? (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  Live
                </>
              ) : (
                <>
                  <Circle className="h-2 w-2 text-muted-foreground" />
                  Paused
                </>
              )}
            </Label>
          </div>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => { refreshLogs(); setNewLogCount(0); }}
            data-testid="button-refresh-logs"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          {/* Export Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-export-dropdown">
                <Download className="h-4 w-4 mr-2" />
                Export
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportExcel} data-testid="button-export-excel">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Export to Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCSV} data-testid="button-export-csv">
                <FileText className="h-4 w-4 mr-2" />
                Export to CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleExportJSON} data-testid="button-export-json">
                <FileText className="h-4 w-4 mr-2" />
                Export to JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-logs">{stats.totalLogs}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredLogs.length} matching filters
            </p>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-colors ${severityFilter === 'info' ? 'ring-2 ring-green-500' : ''}`}
          onClick={() => setSeverityFilter(severityFilter === 'info' ? 'all' : 'info')}
          data-testid="card-filter-info"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Info</CardTitle>
            <Info className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600" data-testid="text-info-count">
              {stats.bySeverity.info || 0}
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-colors ${severityFilter === 'warning' ? 'ring-2 ring-yellow-500' : ''}`}
          onClick={() => setSeverityFilter(severityFilter === 'warning' ? 'all' : 'warning')}
          data-testid="card-filter-warning"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600" data-testid="text-warning-count">
              {stats.bySeverity.warning || 0}
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-colors ${severityFilter === 'error' ? 'ring-2 ring-destructive' : ''}`}
          onClick={() => setSeverityFilter(severityFilter === 'error' ? 'all' : 'error')}
          data-testid="card-filter-error"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="text-error-count">
              {stats.bySeverity.error || 0}
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`cursor-pointer transition-colors ${severityFilter === 'critical' ? 'ring-2 ring-destructive' : ''}`}
          onClick={() => setSeverityFilter(severityFilter === 'critical' ? 'all' : 'critical')}
          data-testid="card-filter-critical"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical</CardTitle>
            <Shield className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive" data-testid="text-critical-count">
              {stats.bySeverity.critical || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-2">
                  Active
                </Badge>
              )}
            </CardTitle>
            {hasActiveFilters && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={clearAllFilters}
                data-testid="button-clear-filters"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Clear All
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-10"
                data-testid="input-search-logs"
              />
            </div>
            
            {/* Module Filter */}
            <Select value={moduleFilter} onValueChange={(v) => { setModuleFilter(v as AuditModule | 'all'); setCurrentPage(1); }}>
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
            
            {/* Action Filter */}
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v as AuditAction | 'all'); setCurrentPage(1); }}>
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
            
            {/* Actor Filter */}
            <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-actor-filter">
                <SelectValue placeholder="All Users" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {uniqueActors.slice(0, 50).map((actor) => (
                  <SelectItem key={actor.id} value={actor.id}>
                    <div className="flex items-center gap-2">
                      <span>{actor.name}</span>
                      <Badge variant="outline" className="text-xs">{actor.count}</Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Second Row */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
            {/* Quick Date Filter */}
            <Select value={quickDateFilter} onValueChange={(v) => { setQuickDateFilter(v); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-date-filter">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7days">Last 7 Days</SelectItem>
                <SelectItem value="last30days">Last 30 Days</SelectItem>
                <SelectItem value="last90days">Last 90 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Custom Date Range Picker */}
            {quickDateFilter === 'custom' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start text-left font-normal" data-testid="button-date-range">
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                        </>
                      ) : (
                        format(dateRange.from, "LLL dd, y")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    initialFocus
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => {
                      setDateRange({ from: range?.from, to: range?.to });
                      setCurrentPage(1);
                    }}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>
            )}
            
            {/* Success Filter */}
            <Select value={successFilter} onValueChange={(v) => { setSuccessFilter(v as 'all' | 'success' | 'failed'); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-success-filter">
                <SelectValue placeholder="All Results" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Results</SelectItem>
                <SelectItem value="success">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    Successful Only
                  </div>
                </SelectItem>
                <SelectItem value="failed">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    Failed Only
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            {/* Severity Filter (in case quick click on cards doesn't work) */}
            <Select value={severityFilter} onValueChange={(v) => { setSeverityFilter(v as AuditSeverity | 'all'); setCurrentPage(1); }}>
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

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="timeline" data-testid="tab-timeline">
            <Clock className="h-4 w-4 mr-2" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <Users className="h-4 w-4 mr-2" />
            User Activity
          </TabsTrigger>
          <TabsTrigger value="workflows" data-testid="tab-workflows">
            <GitBranch className="h-4 w-4 mr-2" />
            Workflows
          </TabsTrigger>
          <TabsTrigger value="table" data-testid="tab-table">
            <FileText className="h-4 w-4 mr-2" />
            Table View
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">
            <Activity className="h-4 w-4 mr-2" />
            Statistics
          </TabsTrigger>
          <TabsTrigger value="activity-tracking" data-testid="tab-activity-tracking">
            <Zap className="h-4 w-4 mr-2" />
            Live Activity
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
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
                        <div className="sticky top-0 bg-muted/50 backdrop-blur px-4 py-2 text-sm font-medium flex items-center gap-2 z-10">
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
                                    {!log.success && (
                                      <Badge variant="destructive" className="text-xs">Failed</Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
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
                                    {log.actorEmail && (
                                      <div>
                                        <span className="text-muted-foreground">Actor Email:</span>
                                        <span className="ml-2 font-medium">{log.actorEmail}</span>
                                      </div>
                                    )}
                                    {log.workflowStep && (
                                      <div>
                                        <span className="text-muted-foreground">Workflow Step:</span>
                                        <Badge variant="outline" className="ml-2">{WORKFLOW_STEP_LABELS[log.workflowStep]}</Badge>
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
                                            <ArrowRight className="h-3 w-3" />
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
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * logsPerPage) + 1} - {Math.min(currentPage * logsPerPage, filteredLogs.length)} of {filteredLogs.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      data-testid="button-next-page"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Activity Tab */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                User Activity Tracking
              </CardTitle>
              <CardDescription>
                Monitor individual user activities and behavior patterns
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {loading || profilesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : groupedByUser.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mb-4" />
                    <p>No users found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    <div className="px-4 py-2 bg-muted/50 text-sm text-muted-foreground flex items-center justify-between">
                      <span>Showing {groupedByUser.length} users ({groupedByUser.filter(u => u.totalActions > 0).length} with recorded activity)</span>
                    </div>
                    {groupedByUser.map((user) => {
                      const isExpanded = expandedUserId === user.userId;
                      const statusColor = user.userStatus === 'approved' ? 'bg-green-500' : user.userStatus === 'pending' ? 'bg-yellow-500' : 'bg-gray-400';
                      
                      return (
                        <div key={user.userId}>
                          <div 
                            className="px-4 py-4 hover-elevate cursor-pointer"
                            onClick={() => toggleUserExpanded(user.userId)}
                            data-testid={`user-activity-${user.userId}`}
                          >
                            <div className="flex items-start gap-4">
                              <div className="relative">
                                <Avatar>
                                  <AvatarFallback>
                                    {user.userName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background ${statusColor}`} title={user.userStatus} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{user.userName}</span>
                                  <Badge variant="outline" className="text-xs">{user.userRole}</Badge>
                                  {user.userStatus && (
                                    <Badge variant={user.userStatus === 'approved' ? 'default' : 'secondary'} className="text-xs">
                                      {user.userStatus}
                                    </Badge>
                                  )}
                                  {user.totalActions > 0 && user.successRate === 100 && (
                                    <Badge className="bg-green-500 text-white text-xs">Perfect Record</Badge>
                                  )}
                                  {user.totalActions === 0 && (
                                    <Badge variant="secondary" className="text-xs">No Activity</Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                                  {user.userEmail && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {user.userEmail}
                                    </span>
                                  )}
                                  <span className="flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    {user.totalActions} actions
                                  </span>
                                  {user.totalActions > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      Last: {format(parseISO(user.lastActivity), 'MMM d, yyyy HH:mm')}
                                    </span>
                                  )}
                                </div>
                                {/* Registration and timestamps */}
                                <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground flex-wrap">
                                  {user.registeredAt && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      Registered: {format(parseISO(user.registeredAt), 'MMM d, yyyy')}
                                    </span>
                                  )}
                                  {user.firstActivityAt && (
                                    <span className="flex items-center gap-1">
                                      <PlayCircle className="h-3 w-3" />
                                      First activity: {format(parseISO(user.firstActivityAt), 'MMM d, yyyy HH:mm')}
                                    </span>
                                  )}
                                </div>
                                {/* Mini stats */}
                                {user.totalActions > 0 && (
                                  <div className="flex items-center gap-3 mt-2">
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-muted-foreground">Success:</span>
                                      <span className={`text-xs font-medium ${user.successRate >= 90 ? 'text-green-600' : user.successRate >= 70 ? 'text-yellow-600' : 'text-destructive'}`}>
                                        {user.successRate.toFixed(0)}%
                                      </span>
                                    </div>
                                    {user.severityBreakdown.warning && (
                                      <Badge variant="secondary" className="text-xs">
                                        <AlertTriangle className="h-3 w-3 mr-1 text-yellow-500" />
                                        {user.severityBreakdown.warning} warnings
                                      </Badge>
                                    )}
                                    {user.severityBreakdown.error && (
                                      <Badge variant="destructive" className="text-xs">
                                        {user.severityBreakdown.error} errors
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4">
                              <div className="ml-14 space-y-4">
                                {/* Module Breakdown */}
                                <div className="bg-muted/50 rounded-md p-4">
                                  <h4 className="text-sm font-medium mb-3">Activity by Module</h4>
                                  <div className="space-y-2">
                                    {Object.entries(user.moduleBreakdown)
                                      .sort(([,a], [,b]) => b - a)
                                      .slice(0, 5)
                                      .map(([module, count]) => (
                                        <div key={module} className="flex items-center justify-between">
                                          <span className="text-sm">{AUDIT_MODULE_LABELS[module as AuditModule]}</span>
                                          <div className="flex items-center gap-2">
                                            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                                              <div 
                                                className="h-full bg-primary rounded-full"
                                                style={{ width: `${(count / user.totalActions) * 100}%` }}
                                              />
                                            </div>
                                            <span className="text-xs font-medium w-8 text-right">{count}</span>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                </div>
                                
                                {/* Recent Activity */}
                                <div>
                                  <h4 className="text-sm font-medium mb-3">Recent Activity</h4>
                                  <div className="border rounded-md divide-y">
                                    {user.logs.slice(0, 10).map((log) => (
                                      <div key={log.id} className="p-3 text-sm">
                                        <div className="flex items-center gap-2">
                                          {getSeverityIcon(log.severity)}
                                          <span className="font-medium">{AUDIT_ACTION_LABELS[log.action]}</span>
                                          <Badge variant="outline" className="text-xs">{AUDIT_MODULE_LABELS[log.module]}</Badge>
                                          {!log.success && <Badge variant="destructive" className="text-xs">Failed</Badge>}
                                        </div>
                                        <p className="text-muted-foreground mt-1 ml-6">{log.description}</p>
                                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                                          {format(parseISO(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflows Tab */}
        <TabsContent value="workflows" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <GitBranch className="h-5 w-5" />
                Entity Workflow Tracking
              </CardTitle>
              <CardDescription>
                Track end-to-end workflow progress for each entity across all system activities
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : groupedByEntity.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <GitBranch className="h-12 w-12 mb-4" />
                    <p>No workflow entities found</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {groupedByEntity.slice(0, 100).map((entity) => {
                      const entityKey = `${entity.entityType}:${entity.entityId}`;
                      const isExpanded = expandedEntityId === entityKey;
                      
                      return (
                        <div key={entityKey}>
                          <div 
                            className="px-4 py-4 hover-elevate cursor-pointer"
                            onClick={() => toggleEntityExpanded(entityKey)}
                            data-testid={`workflow-entity-${entity.entityId}`}
                          >
                            <div className="flex items-start gap-4">
                              <div className="mt-0.5">
                                {getWorkflowStepIcon(entity.currentStep, entity.isCompleted, entity.hasFailed)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">
                                    {entity.entityName || entity.entityId}
                                  </span>
                                  {getWorkflowStatusBadge(entity.currentStep, entity.isCompleted, entity.hasFailed)}
                                  <Badge variant="outline" className="text-xs">
                                    {AUDIT_MODULE_LABELS[entity.module]}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    {entity.entityType}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    {entity.totalActions} actions
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {format(parseISO(entity.lastActivity), 'MMM d, HH:mm')}
                                  </span>
                                </div>
                              </div>
                              <div>
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {isExpanded && (
                            <div className="px-4 pb-4">
                              <div className="ml-9 border-l-2 border-muted pl-4 space-y-4">
                                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">
                                  Activity Timeline
                                </div>
                                {[...entity.logs]
                                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                  .map((log, index) => (
                                    <div 
                                      key={log.id} 
                                      className="relative"
                                      data-testid={`workflow-log-${log.id}`}
                                    >
                                      <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-background border-2 border-muted-foreground" />
                                      <div className="flex items-start gap-3">
                                        <div className="flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium">{AUDIT_ACTION_LABELS[log.action]}</span>
                                            {log.workflowStep && (
                                              <Badge variant="outline" className="text-xs">
                                                {WORKFLOW_STEP_LABELS[log.workflowStep]}
                                              </Badge>
                                            )}
                                            {!log.success && (
                                              <XCircle className="h-3 w-3 text-destructive" />
                                            )}
                                          </div>
                                          <p className="text-sm text-muted-foreground mt-0.5">
                                            {log.description}
                                          </p>
                                          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1">
                                              <User className="h-3 w-3" />
                                              {log.actorName}
                                            </span>
                                            <span className="flex items-center gap-1">
                                              <Clock className="h-3 w-3" />
                                              {format(parseISO(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                                            </span>
                                          </div>
                                          {log.errorMessage && (
                                            <p className="text-xs text-destructive mt-1">
                                              {log.errorMessage}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      {index < entity.logs.length - 1 && (
                                        <div className="absolute -left-[15px] top-4 bottom-0 flex items-center">
                                          <ArrowRight className="h-2 w-2 text-muted-foreground opacity-0" />
                                        </div>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Table View Tab */}
        <TabsContent value="table" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <ScrollArea className="h-[600px]">
                <table className="w-full">
                  <thead className="sticky top-0 bg-background border-b z-10">
                    <tr className="text-left text-sm text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Timestamp</th>
                      <th className="px-4 py-3 font-medium">Module</th>
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Actor</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Severity</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedLogs.map((log) => (
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
                        <td className="px-4 py-3 text-sm">
                          <div>
                            <p>{log.actorName}</p>
                            {log.actorEmail && (
                              <p className="text-xs text-muted-foreground">{log.actorEmail}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-md truncate">{log.description}</td>
                        <td className="px-4 py-3">
                          <Badge variant={getSeverityColor(log.severity)}>
                            {AUDIT_SEVERITY_LABELS[log.severity]}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {log.success ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
              
              {/* Pagination for table */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * logsPerPage) + 1} - {Math.min(currentPage * logsPerPage, filteredLogs.length)} of {filteredLogs.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Statistics Tab */}
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

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Severity Distribution</CardTitle>
                <CardDescription>Breakdown by severity level</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-green-500" />
                      <span className="text-sm">Info</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={(stats.bySeverity.info || 0) / stats.totalLogs * 100} className="w-32 h-2" />
                      <span className="text-sm font-medium w-12 text-right">{stats.bySeverity.info || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm">Warning</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={(stats.bySeverity.warning || 0) / stats.totalLogs * 100} className="w-32 h-2" />
                      <span className="text-sm font-medium w-12 text-right">{stats.bySeverity.warning || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="text-sm">Error</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={(stats.bySeverity.error || 0) / stats.totalLogs * 100} className="w-32 h-2" />
                      <span className="text-sm font-medium w-12 text-right">{stats.bySeverity.error || 0}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-destructive" />
                      <span className="text-sm">Critical</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={(stats.bySeverity.critical || 0) / stats.totalLogs * 100} className="w-32 h-2" />
                      <span className="text-sm font-medium w-12 text-right">{stats.bySeverity.critical || 0}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Success Rate</CardTitle>
                <CardDescription>Overall action success rate</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {(() => {
                    const successCount = filteredLogs.filter(l => l.success).length;
                    const failureCount = filteredLogs.filter(l => !l.success).length;
                    const successRate = filteredLogs.length > 0 ? (successCount / filteredLogs.length) * 100 : 0;
                    
                    return (
                      <>
                        <div className="flex items-center justify-center">
                          <div className="relative h-32 w-32">
                            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                              <circle
                                className="stroke-muted"
                                strokeWidth="3"
                                fill="none"
                                cx="18"
                                cy="18"
                                r="15.9"
                              />
                              <circle
                                className="stroke-green-500"
                                strokeWidth="3"
                                strokeLinecap="round"
                                fill="none"
                                cx="18"
                                cy="18"
                                r="15.9"
                                strokeDasharray={`${successRate} 100`}
                              />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-2xl font-bold">{successRate.toFixed(0)}%</span>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div className="p-3 bg-green-50 dark:bg-green-950 rounded-md">
                            <CheckCircle className="h-5 w-5 text-green-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-green-600">{successCount}</p>
                            <p className="text-xs text-muted-foreground">Successful</p>
                          </div>
                          <div className="p-3 bg-red-50 dark:bg-red-950 rounded-md">
                            <XCircle className="h-5 w-5 text-destructive mx-auto mb-1" />
                            <p className="text-lg font-bold text-destructive">{failureCount}</p>
                            <p className="text-xs text-muted-foreground">Failed</p>
                          </div>
                        </div>
                      </>
                    );
                  })()}
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

        {/* Live Activity Tracking Tab */}
        <TabsContent value="activity-tracking" className="mt-4">
          <div className="grid gap-4">
            {/* Activity Stats Summary */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Activities</p>
                      <p className="text-2xl font-bold">{activityStats.totalActivities}</p>
                    </div>
                    <Activity className="h-8 w-8 text-primary" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Success Rate</p>
                      <p className="text-2xl font-bold text-green-600">{activityStats.successRate.toFixed(1)}%</p>
                    </div>
                    <CheckCircle className="h-8 w-8 text-green-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Categories</p>
                      <p className="text-2xl font-bold">{Object.keys(activityStats.byCategory).length}</p>
                    </div>
                    <GitBranch className="h-8 w-8 text-blue-500" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Users</p>
                      <p className="text-2xl font-bold">{Object.keys(activityStats.byUser).length}</p>
                    </div>
                    <Users className="h-8 w-8 text-purple-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Live Activity Feed
                </CardTitle>
                <CardDescription>
                  Real-time tracking of all user interactions, button clicks, navigation, form submissions, and more
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4 flex-wrap">
                  <Select value={activityCategoryFilter} onValueChange={(v) => setActivityCategoryFilter(v as ActivityCategory | 'all')}>
                    <SelectTrigger className="w-40" data-testid="select-activity-category">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="interaction">Interactions</SelectItem>
                      <SelectItem value="navigation">Navigation</SelectItem>
                      <SelectItem value="data">Data Operations</SelectItem>
                      <SelectItem value="authentication">Authentication</SelectItem>
                      <SelectItem value="workflow">Workflow</SelectItem>
                      <SelectItem value="communication">Communication</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activityFilter} onValueChange={(v) => setActivityFilter(v as ActivityType | 'all')}>
                    <SelectTrigger className="w-40" data-testid="select-activity-type">
                      <SelectValue placeholder="Activity Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="button_click">Button Clicks</SelectItem>
                      <SelectItem value="navigation">Navigation</SelectItem>
                      <SelectItem value="page_view">Page Views</SelectItem>
                      <SelectItem value="form_submit">Form Submissions</SelectItem>
                      <SelectItem value="form_input">Form Inputs</SelectItem>
                      <SelectItem value="modal_open">Modal Opens</SelectItem>
                      <SelectItem value="modal_close">Modal Closes</SelectItem>
                      <SelectItem value="tab_switch">Tab Switches</SelectItem>
                      <SelectItem value="filter_change">Filter Changes</SelectItem>
                      <SelectItem value="search">Searches</SelectItem>
                      <SelectItem value="file_upload">File Uploads</SelectItem>
                      <SelectItem value="file_download">File Downloads</SelectItem>
                      <SelectItem value="data_create">Data Creates</SelectItem>
                      <SelectItem value="data_update">Data Updates</SelectItem>
                      <SelectItem value="data_delete">Data Deletes</SelectItem>
                      <SelectItem value="data_view">Data Views</SelectItem>
                      <SelectItem value="approval">Approvals</SelectItem>
                      <SelectItem value="rejection">Rejections</SelectItem>
                      <SelectItem value="login">Logins</SelectItem>
                      <SelectItem value="logout">Logouts</SelectItem>
                      <SelectItem value="error">Errors</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="ml-auto">
                    {filteredActivities.length} activities
                  </Badge>
                </div>

                <ScrollArea className="h-[500px]">
                  {filteredActivities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <MousePointer className="h-12 w-12 mb-4" />
                      <p>No activities recorded yet</p>
                      <p className="text-sm">Activities will appear here as users interact with the system</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filteredActivities.slice(0, 200).map((activity) => (
                        <div 
                          key={activity.id} 
                          className="flex items-start gap-3 p-3 rounded-md bg-muted/30 hover-elevate"
                          data-testid={`activity-item-${activity.id}`}
                        >
                          <div className="flex-shrink-0">
                            {activity.activityType === 'button_click' && <MousePointer className="h-4 w-4 text-blue-500" />}
                            {activity.activityType === 'navigation' && <ArrowRight className="h-4 w-4 text-green-500" />}
                            {activity.activityType === 'page_view' && <Eye className="h-4 w-4 text-purple-500" />}
                            {activity.activityType === 'form_submit' && <FileText className="h-4 w-4 text-orange-500" />}
                            {activity.activityType === 'form_input' && <FileText className="h-4 w-4 text-yellow-500" />}
                            {activity.activityType === 'search' && <Search className="h-4 w-4 text-cyan-500" />}
                            {activity.activityType === 'modal_open' && <Eye className="h-4 w-4 text-indigo-500" />}
                            {activity.activityType === 'modal_close' && <X className="h-4 w-4 text-gray-500" />}
                            {activity.activityType === 'tab_switch' && <ArrowRight className="h-4 w-4 text-teal-500" />}
                            {activity.activityType === 'filter_change' && <Filter className="h-4 w-4 text-pink-500" />}
                            {activity.activityType === 'file_upload' && <Download className="h-4 w-4 text-green-600" />}
                            {activity.activityType === 'file_download' && <Download className="h-4 w-4 text-blue-600" />}
                            {activity.activityType === 'data_create' && <CheckCircle className="h-4 w-4 text-green-500" />}
                            {activity.activityType === 'data_update' && <RefreshCw className="h-4 w-4 text-blue-500" />}
                            {activity.activityType === 'data_delete' && <XCircle className="h-4 w-4 text-red-500" />}
                            {activity.activityType === 'data_view' && <Eye className="h-4 w-4 text-gray-500" />}
                            {activity.activityType === 'approval' && <CheckCircle className="h-4 w-4 text-green-600" />}
                            {activity.activityType === 'rejection' && <XCircle className="h-4 w-4 text-red-600" />}
                            {activity.activityType === 'login' && <User className="h-4 w-4 text-green-500" />}
                            {activity.activityType === 'logout' && <User className="h-4 w-4 text-gray-500" />}
                            {activity.activityType === 'error' && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            {activity.activityType === 'toggle' && <RefreshCw className="h-4 w-4 text-blue-400" />}
                            {activity.activityType === 'selection' && <CheckCircle className="h-4 w-4 text-blue-400" />}
                            {!['button_click', 'navigation', 'page_view', 'form_submit', 'form_input', 'search', 'modal_open', 'modal_close', 'tab_switch', 'filter_change', 'file_upload', 'file_download', 'data_create', 'data_update', 'data_delete', 'data_view', 'approval', 'rejection', 'login', 'logout', 'error', 'toggle', 'selection'].includes(activity.activityType) && <Zap className="h-4 w-4 text-gray-400" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{activity.description}</span>
                              <Badge variant="outline" className="text-xs">
                                {activity.activityType.replace(/_/g, ' ')}
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {activity.category}
                              </Badge>
                              {!activity.success && (
                                <Badge variant="destructive" className="text-xs">Failed</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {activity.userName}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(parseISO(activity.timestamp), 'MMM d, HH:mm:ss')}
                              </span>
                              <span className="text-muted-foreground/70">
                                {activity.component} | {activity.path}
                              </span>
                            </div>
                            {activity.errorMessage && (
                              <p className="text-xs text-destructive mt-1">{activity.errorMessage}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>

            {/* Activity Breakdown */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Activity by Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(activityStats.byType)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 10)
                      .map(([type, count]) => (
                        <div key={type} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{type.replace(/_/g, ' ')}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Activity by Category</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {Object.entries(activityStats.byCategory)
                      .sort(([,a], [,b]) => b - a)
                      .map(([category, count]) => (
                        <div key={category} className="flex items-center justify-between">
                          <span className="text-sm capitalize">{category}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AuditLogs;
