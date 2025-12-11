import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Mail,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Send,
  ArrowLeft,
  Filter,
  KeyRound,
  MessageSquare,
  AlertTriangle,
  MailCheck,
  MailX,
  Eye,
  User,
  Calendar,
  FileText,
  Copy,
} from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { EmailNotificationService } from '@/services/email-notification.service';

interface EmailLog {
  id: string;
  entity_type: string;
  entity_name: string;
  description: string;
  timestamp: string;
  success: boolean;
  error_message?: string;
  metadata: {
    recipient?: string;
    subject?: string;
    emailType?: string;
    messageId?: string;
    deliveredAt?: string;
    method?: string;
    destination?: string;
    purpose?: string;
    provider?: string;
  };
  actor_name: string;
  actor_email?: string;
  tags?: string[];
}

interface EmailStats {
  total: number;
  successful: number;
  failed: number;
  emails: number;
  otpSent: number;
  otpVerified: number;
}

const safeParseDateForDisplay = (dateString: string | null | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return 'Invalid date';
    return format(date, 'MMM d, yyyy h:mm a');
  } catch {
    return 'Invalid date';
  }
};

export default function EmailTracking() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'email' | 'otp'>('all');
  const [stats, setStats] = useState<EmailStats>({
    total: 0,
    successful: 0,
    failed: 0,
    emails: 0,
    otpSent: 0,
    otpVerified: 0,
  });
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [selectedLog, setSelectedLog] = useState<EmailLog | null>(null);

  const fetchEmailLogs = async () => {
    setLoading(true);
    try {
      // Try to fetch from database first
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('module', 'notification')
        .in('entity_type', ['email', 'otp'])
        .order('timestamp', { ascending: false })
        .limit(500);

      let logs: EmailLog[] = [];

      if (error) {
        console.warn('Database not available, using localStorage:', error.message);
        // Fallback to localStorage
        const localLogs = getLocalEmailLogs();
        logs = localLogs;
      } else {
        logs = (data || []) as EmailLog[];
      }

      setEmailLogs(logs);

      // Calculate stats
      const newStats: EmailStats = {
        total: logs.length,
        successful: logs.filter(l => l.success).length,
        failed: logs.filter(l => !l.success).length,
        emails: logs.filter(l => l.entity_type === 'email').length,
        otpSent: logs.filter(l => l.entity_type === 'otp' && l.metadata?.purpose !== 'verification').length,
        otpVerified: logs.filter(l => l.entity_type === 'otp' && l.tags?.includes('verification')).length,
      };
      setStats(newStats);
    } catch (error: any) {
      console.error('Error:', error);
      // Try localStorage as last resort
      const localLogs = getLocalEmailLogs();
      setEmailLogs(localLogs);
    } finally {
      setLoading(false);
    }
  };

  // Get email logs from localStorage (fallback)
  const getLocalEmailLogs = (): EmailLog[] => {
    try {
      const stored = localStorage.getItem('pact_audit_logs');
      if (!stored) return [];
      const allLogs = JSON.parse(stored);
      // Filter for email/otp logs
      return allLogs.filter((log: any) => 
        log.module === 'notification' && 
        (log.entityType === 'email' || log.entityType === 'otp' || 
         log.entity_type === 'email' || log.entity_type === 'otp')
      ).map((log: any) => ({
        id: log.id,
        entity_type: log.entityType || log.entity_type || 'email',
        entity_name: log.entityName || log.entity_name || '',
        description: log.description || '',
        timestamp: log.timestamp || new Date().toISOString(),
        success: log.success !== false,
        error_message: log.errorMessage || log.error_message,
        metadata: log.metadata || {},
        actor_name: log.actorName || log.actor_name || 'System',
        actor_email: log.actorEmail || log.actor_email,
        tags: log.tags || [],
      }));
    } catch (e) {
      console.warn('Failed to read local logs:', e);
      return [];
    }
  };

  useEffect(() => {
    fetchEmailLogs();
  }, []);

  const filteredLogs = emailLogs.filter(log => {
    const matchesSearch = searchQuery === '' ||
      log.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.metadata?.recipient?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.metadata?.destination?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.metadata?.subject?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'success' && log.success) ||
      (statusFilter === 'failed' && !log.success);

    const matchesType = typeFilter === 'all' ||
      (typeFilter === 'email' && log.entity_type === 'email') ||
      (typeFilter === 'otp' && log.entity_type === 'otp');

    return matchesSearch && matchesStatus && matchesType;
  });

  // Store email log locally for immediate display
  const storeLocalEmailLog = (recipient: string, subject: string, success: boolean, error?: string) => {
    try {
      const stored = localStorage.getItem('pact_audit_logs');
      const logs = stored ? JSON.parse(stored) : [];
      const newLog = {
        id: `email-${Date.now()}`,
        module: 'notification',
        entityType: 'email',
        entity_type: 'email',
        entityName: subject,
        entity_name: subject,
        description: success ? `Email sent to ${recipient}: ${subject}` : `Failed to send email to ${recipient}`,
        timestamp: new Date().toISOString(),
        success,
        errorMessage: error,
        error_message: error,
        metadata: { recipient, subject, emailType: 'test' },
        actorName: 'System',
        actor_name: 'System',
        tags: ['notification', 'email', 'test'],
      };
      logs.unshift(newLog);
      localStorage.setItem('pact_audit_logs', JSON.stringify(logs.slice(0, 1000)));
    } catch (e) {
      console.warn('Failed to store local email log:', e);
    }
  };

  const sendTestEmail = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setSendingTest(true);
    try {
      // Use Supabase Auth password reset - this goes through IONOS SMTP configured in Dashboard
      const { error } = await supabase.auth.resetPasswordForEmail(testEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      const success = !error;
      const errorMessage = error?.message;

      // Store log locally for immediate display
      storeLocalEmailLog(testEmail, 'Password Reset Test (SMTP)', success, errorMessage);

      if (success) {
        toast({
          title: 'Password reset email sent',
          description: `Test email sent to ${testEmail} via IONOS SMTP. Check inbox (and spam folder).`,
        });
        setTestEmail('');
      } else {
        toast({
          title: 'Failed to send test email',
          description: errorMessage || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
      // Refresh logs after storing
      setTimeout(fetchEmailLogs, 500);
    } catch (error: any) {
      storeLocalEmailLog(testEmail, 'Password Reset Test (SMTP)', false, error.message);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send test email',
        variant: 'destructive',
      });
      setTimeout(fetchEmailLogs, 500);
    } finally {
      setSendingTest(false);
    }
  };

  const getStatusBadge = (success: boolean) => {
    if (success) {
      return (
        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Sent
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
        <XCircle className="w-3 h-3 mr-1" />
        Failed
      </Badge>
    );
  };

  const getTypeBadge = (log: EmailLog) => {
    if (log.entity_type === 'email') {
      return (
        <Badge variant="secondary">
          <Mail className="w-3 h-3 mr-1" />
          Email
        </Badge>
      );
    }
    if (log.tags?.includes('verification')) {
      return (
        <Badge variant="secondary" className="bg-purple-500/10 text-purple-600 border-purple-500/30">
          <KeyRound className="w-3 h-3 mr-1" />
          OTP Verify
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 border-blue-500/30">
        <KeyRound className="w-3 h-3 mr-1" />
        OTP Send
      </Badge>
    );
  };

  const getRecipient = (log: EmailLog): string => {
    return log.metadata?.recipient || log.metadata?.destination || 'N/A';
  };

  const getSubject = (log: EmailLog): string => {
    if (log.entity_type === 'email') {
      return log.metadata?.subject || log.entity_name || 'N/A';
    }
    return log.metadata?.purpose || 'OTP Verification';
  };

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <Mail className="h-6 w-6" />
              Email Tracking
            </h1>
            <p className="text-sm text-muted-foreground">
              Monitor email and OTP delivery status
            </p>
          </div>
        </div>
        <Button
          onClick={fetchEmailLogs}
          variant="outline"
          disabled={loading}
          data-testid="button-refresh"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-total">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <MailCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600" data-testid="stat-success">{stats.successful}</p>
                <p className="text-xs text-muted-foreground">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <MailX className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600" data-testid="stat-failed">{stats.failed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-emails">{stats.emails}</p>
                <p className="text-xs text-muted-foreground">Emails</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <KeyRound className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-otp-sent">{stats.otpSent}</p>
                <p className="text-xs text-muted-foreground">OTP Sent</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="stat-otp-verified">{stats.otpVerified}</p>
                <p className="text-xs text-muted-foreground">OTP Verified</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Test Email Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" />
            Test IONOS SMTP Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-center flex-wrap">
            <Input
              placeholder="Enter email address to test..."
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              className="max-w-sm"
              data-testid="input-test-email"
            />
            <Button
              onClick={sendTestEmail}
              disabled={sendingTest || !testEmail}
              data-testid="button-send-test"
            >
              {sendingTest ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Test Email
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Tests your IONOS SMTP by sending a password reset email. This uses the same SMTP configured in Supabase Dashboard for all auth emails.
          </p>
        </CardContent>
      </Card>

      {/* Filters and Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Email & OTP Logs</CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-[200px]"
                  data-testid="input-search"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                <SelectTrigger className="w-[130px]" data-testid="select-status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Successful</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
                <SelectTrigger className="w-[130px]" data-testid="select-type">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="email">Emails</SelectItem>
                  <SelectItem value="otp">OTP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No email logs found</p>
              <p className="text-sm">Email and OTP activities will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject / Purpose</TableHead>
                    <TableHead>Sent By</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow 
                      key={log.id} 
                      data-testid={`row-email-${log.id}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell>{getStatusBadge(log.success)}</TableCell>
                      <TableCell>{getTypeBadge(log)}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate">
                        {getRecipient(log)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {getSubject(log)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.actor_name || 'System'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {safeParseDateForDisplay(log.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          data-testid={`button-view-details-${log.id}`}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl" data-testid="dialog-log-details">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog?.entity_type === 'email' ? (
                <Mail className="h-5 w-5" />
              ) : (
                <KeyRound className="h-5 w-5" />
              )}
              {selectedLog?.entity_type === 'email' ? 'Email' : 'OTP'} Log Details
            </DialogTitle>
            <DialogDescription>
              Complete details for this notification log entry
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                {/* Status Section */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Status:</span>
                    {getStatusBadge(selectedLog.success)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Type:</span>
                    {getTypeBadge(selectedLog)}
                  </div>
                </div>

                {/* Basic Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Basic Information
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Log ID</label>
                      <div className="flex items-center gap-2">
                        <code className="text-sm bg-muted px-2 py-1 rounded flex-1 truncate">
                          {selectedLog.id}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => {
                            navigator.clipboard.writeText(selectedLog.id);
                            toast({ title: 'Copied', description: 'Log ID copied to clipboard' });
                          }}
                          data-testid="button-copy-id"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Timestamp</label>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{safeParseDateForDisplay(selectedLog.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Recipient Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Recipient Details
                  </h4>
                  
                  <div className="grid grid-cols-1 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {selectedLog.entity_type === 'email' ? 'Email Address' : 'Destination'}
                      </label>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{getRecipient(selectedLog)}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        {selectedLog.entity_type === 'email' ? 'Subject' : 'Purpose'}
                      </label>
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{getSubject(selectedLog)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Actor Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Actor Information
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Sent By</label>
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm">{selectedLog.actor_name || 'System'}</span>
                      </div>
                    </div>
                    
                    {selectedLog.actor_email && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Actor Email</label>
                        <span className="text-sm">{selectedLog.actor_email}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Description */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Description
                  </h4>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg">
                    {selectedLog.description || 'No description available'}
                  </p>
                </div>

                {/* Metadata Section */}
                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Metadata
                      </h4>
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(selectedLog.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </>
                )}

                {/* Tags */}
                {selectedLog.tags && selectedLog.tags.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Tags
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedLog.tags.map((tag, idx) => (
                          <Badge key={idx} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* Error Message */}
                {selectedLog.error_message && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        Error Details
                      </h4>
                      <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          {selectedLog.error_message}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
