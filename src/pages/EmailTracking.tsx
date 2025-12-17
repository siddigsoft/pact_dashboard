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
  Radio,
  Wifi,
  WifiOff,
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
    smtpHost?: string;
    smtpPort?: string;
    smtpResponse?: string;
    smtpResponseCode?: number;
    retryCount?: number;
    maxRetries?: number;
    lastRetryAt?: string;
    bounceType?: string;
    bounceReason?: string;
    spamScore?: number;
    contentType?: string;
    attachmentCount?: number;
    templateId?: string;
    templateName?: string;
    recipientName?: string;
    senderEmail?: string;
    senderName?: string;
    replyTo?: string;
    cc?: string[];
    bcc?: string[];
    priority?: string;
    headers?: Record<string, string>;
    ipAddress?: string;
    userAgent?: string;
    deliveryStatus?: 'pending' | 'sent' | 'delivered' | 'bounced' | 'failed' | 'deferred';
    deliveryAttempts?: number;
    queuedAt?: string;
    processedAt?: string;
    openedAt?: string;
    clickedAt?: string;
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

  // Real-time subscription state
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  // Handle new log with animation
  const handleNewLog = (newLog: EmailLog) => {
    if (newLog.entity_type === 'email' || newLog.entity_type === 'otp') {
      setEmailLogs((prev) => {
        if (prev.some((log) => log.id === newLog.id)) {
          return prev;
        }
        return [newLog, ...prev];
      });
      
      // Mark as new for highlight animation
      setNewLogIds((prev) => new Set(prev).add(newLog.id));
      setTimeout(() => {
        setNewLogIds((prev) => {
          const next = new Set(prev);
          next.delete(newLog.id);
          return next;
        });
      }, 5000);
      
      // Update stats
      setStats((prev) => ({
        total: prev.total + 1,
        successful: newLog.success ? prev.successful + 1 : prev.successful,
        failed: !newLog.success ? prev.failed + 1 : prev.failed,
        emails: newLog.entity_type === 'email' ? prev.emails + 1 : prev.emails,
        otpSent: newLog.entity_type === 'otp' && !newLog.tags?.includes('verification') 
          ? prev.otpSent + 1 
          : prev.otpSent,
        otpVerified: newLog.entity_type === 'otp' && newLog.tags?.includes('verification') 
          ? prev.otpVerified + 1 
          : prev.otpVerified,
      }));
      
      setLastUpdate(new Date());
      
      // Show toast for new email
      toast({
        title: 'New notification logged',
        description: newLog.entity_type === 'email' 
          ? `Email to ${newLog.metadata?.recipient || 'unknown'}` 
          : `OTP ${newLog.tags?.includes('verification') ? 'verification' : 'sent'}`,
      });
    }
  };

  useEffect(() => {
    fetchEmailLogs();

    // Set up real-time subscription for new email/OTP logs
    const channel = supabase
      .channel('email-tracking-realtime', {
        config: {
          broadcast: { self: true },
          presence: { key: 'email-tracking' },
        },
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'audit_logs',
          filter: 'module=eq.notification',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            handleNewLog(payload.new as EmailLog);
          } else if (payload.eventType === 'UPDATE') {
            // Handle updates to existing logs
            const updatedLog = payload.new as EmailLog;
            setEmailLogs((prev) => 
              prev.map((log) => log.id === updatedLog.id ? updatedLog : log)
            );
            setLastUpdate(new Date());
          }
        }
      )
      .subscribe((status) => {
        setIsRealtimeConnected(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') {
          console.log('[EmailTracking] Real-time subscription active');
          setLastUpdate(new Date());
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [toast]);

  // Auto-refresh polling as backup (every 5 seconds when enabled)
  useEffect(() => {
    if (!autoRefreshEnabled) return;
    
    const pollInterval = setInterval(() => {
      // Only poll if realtime is not connected or as a backup
      if (!isRealtimeConnected) {
        fetchEmailLogs();
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [autoRefreshEnabled, isRealtimeConnected]);

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

  const [diagnosticResult, setDiagnosticResult] = useState<string | null>(null);

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
    setDiagnosticResult(null);
    
    try {
      console.log('[DIAGNOSTIC] Calling send-email Edge Function directly...');
      
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: testEmail.toLowerCase(),
          subject: 'PACT SMTP Test | اختبار البريد',
          type: 'notification',
          recipientName: 'Test User',
          title_en: 'SMTP Connection Test',
          title_ar: 'اختبار اتصال SMTP',
          message_en: 'This is a test email to verify SMTP configuration. If you receive this, email is working correctly.',
          message_ar: 'هذه رسالة اختبار للتحقق من إعدادات SMTP. إذا استلمت هذه الرسالة، فالبريد يعمل بشكل صحيح.',
          priority: 'normal',
        },
      });

      console.log('[DIAGNOSTIC] Edge Function response:', { data, error });
      
      const resultInfo = JSON.stringify({ data, error }, null, 2);
      setDiagnosticResult(resultInfo);

      if (error) {
        console.error('[DIAGNOSTIC] Invocation error:', error);
        storeLocalEmailLog(testEmail, 'SMTP Direct Test', false, error.message);
        toast({
          title: 'Edge Function Error',
          description: `Invocation failed: ${error.message}`,
          variant: 'destructive',
        });
      } else if (data && !data.success) {
        console.error('[DIAGNOSTIC] SMTP error:', data.error);
        storeLocalEmailLog(testEmail, 'SMTP Direct Test', false, data.error);
        toast({
          title: 'SMTP Error',
          description: data.error || 'Email sending failed - check diagnostic output below',
          variant: 'destructive',
        });
      } else if (data?.success) {
        console.log('[DIAGNOSTIC] Success:', data);
        storeLocalEmailLog(testEmail, 'SMTP Direct Test', true);
        toast({
          title: 'Email sent successfully',
          description: `Message ID: ${data.messageId}. Check inbox and spam folder.`,
        });
        setTestEmail('');
      }
      
      setTimeout(fetchEmailLogs, 500);
    } catch (error: any) {
      console.error('[DIAGNOSTIC] Exception:', error);
      const errorInfo = JSON.stringify({ error: error.message, stack: error.stack }, null, 2);
      setDiagnosticResult(errorInfo);
      storeLocalEmailLog(testEmail, 'SMTP Direct Test', false, error.message);
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
        <div className="flex items-center gap-3">
          {/* Real-time connection indicator */}
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={isRealtimeConnected 
                ? "bg-green-500/10 text-green-600 border-green-500/30" 
                : "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
              }
              data-testid="badge-realtime-status"
            >
              {isRealtimeConnected ? (
                <>
                  <Radio className="h-3 w-3 mr-1 animate-pulse" />
                  Live
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 mr-1" />
                  Connecting...
                </>
              )}
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Updated {format(lastUpdate, 'h:mm:ss a')}
            </span>
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

      {/* SMTP Configuration Info */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-500" />
            IONOS SMTP Configuration (Required in Supabase Edge Function Secrets)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-background rounded-lg border">
              <p className="text-xs text-muted-foreground mb-1">SMTP_HOST</p>
              <p className="font-mono font-medium">smtp.ionos.com</p>
            </div>
            <div className="p-3 bg-background rounded-lg border">
              <p className="text-xs text-muted-foreground mb-1">SMTP_PORT</p>
              <p className="font-mono font-medium text-green-600">465 (SSL)</p>
            </div>
            <div className="p-3 bg-background rounded-lg border">
              <p className="text-xs text-muted-foreground mb-1">SMTP_USER</p>
              <p className="font-mono font-medium text-xs">noreply@pactorg.com</p>
            </div>
            <div className="p-3 bg-background rounded-lg border">
              <p className="text-xs text-muted-foreground mb-1">SMTP_PASSWORD</p>
              <p className="font-mono font-medium">(Your IONOS password)</p>
            </div>
          </div>
          <div className="mt-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <p className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="font-medium">Important:</span> Set these in Supabase Dashboard → Edge Functions → send-email → Secrets
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Port must be 465 (not 587). The Edge Function uses SSL for port 465 automatically.
            </p>
          </div>
        </CardContent>
      </Card>

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
            Tests your IONOS SMTP directly via the send-email Edge Function. This will show the exact error if email fails.
          </p>
          
          {diagnosticResult && (
            <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Diagnostic Result (Edge Function Response)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(diagnosticResult);
                    toast({ title: 'Copied', description: 'Diagnostic result copied to clipboard' });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <pre className="text-xs bg-background p-3 rounded border overflow-auto max-h-48 whitespace-pre-wrap">
                {diagnosticResult}
              </pre>
              <p className="text-xs text-muted-foreground mt-2">
                If "requestId" appears, the new Edge Function IS deployed. Check Supabase Edge Function Logs for details.
              </p>
            </div>
          )}
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
                      className={`cursor-pointer hover-elevate transition-colors duration-500 ${
                        newLogIds.has(log.id) 
                          ? 'bg-green-500/10 animate-pulse' 
                          : ''
                      }`}
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
        <DialogContent className="max-w-3xl max-h-[90vh]" data-testid="dialog-log-details">
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
              Complete details for troubleshooting and tracking
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 pr-4">
                {/* Status and Quick Actions */}
                <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50 flex-wrap">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Status:</span>
                      {getStatusBadge(selectedLog.success)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Type:</span>
                      {getTypeBadge(selectedLog)}
                    </div>
                    {selectedLog.metadata?.deliveryStatus && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Delivery:</span>
                        <Badge variant="outline" className={
                          selectedLog.metadata.deliveryStatus === 'delivered' ? 'bg-green-500/10 text-green-600 border-green-500/30' :
                          selectedLog.metadata.deliveryStatus === 'bounced' ? 'bg-red-500/10 text-red-600 border-red-500/30' :
                          selectedLog.metadata.deliveryStatus === 'deferred' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30' :
                          'bg-muted'
                        }>
                          {selectedLog.metadata.deliveryStatus}
                        </Badge>
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const fullDetails = JSON.stringify(selectedLog, null, 2);
                      navigator.clipboard.writeText(fullDetails);
                      toast({ title: 'Copied', description: 'Full log details copied to clipboard' });
                    }}
                    data-testid="button-copy-all"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy All Details
                  </Button>
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

                    {selectedLog.metadata?.messageId && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Message ID</label>
                        <div className="flex items-center gap-2">
                          <code className="text-xs bg-muted px-2 py-1 rounded truncate flex-1">
                            {selectedLog.metadata.messageId}
                          </code>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              navigator.clipboard.writeText(selectedLog.metadata?.messageId || '');
                              toast({ title: 'Copied', description: 'Message ID copied' });
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedLog.metadata?.priority && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Priority</label>
                        <Badge variant="outline">{selectedLog.metadata.priority}</Badge>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Sender & Recipient Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Sender & Recipient Details
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(selectedLog.metadata?.senderEmail || selectedLog.metadata?.senderName) && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">From</label>
                        <div className="text-sm">
                          {selectedLog.metadata.senderName && <span className="font-medium">{selectedLog.metadata.senderName} </span>}
                          {selectedLog.metadata.senderEmail && <span className="text-muted-foreground">&lt;{selectedLog.metadata.senderEmail}&gt;</span>}
                          {!selectedLog.metadata.senderName && !selectedLog.metadata.senderEmail && <span>noreply@pactorg.com</span>}
                        </div>
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">To</label>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">{getRecipient(selectedLog)}</span>
                        {selectedLog.metadata?.recipientName && (
                          <span className="text-xs text-muted-foreground">({selectedLog.metadata.recipientName})</span>
                        )}
                      </div>
                    </div>

                    {selectedLog.metadata?.replyTo && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Reply-To</label>
                        <span className="text-sm">{selectedLog.metadata.replyTo}</span>
                      </div>
                    )}

                    {selectedLog.metadata?.cc && selectedLog.metadata.cc.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">CC</label>
                        <span className="text-sm">{selectedLog.metadata.cc.join(', ')}</span>
                      </div>
                    )}
                    
                    <div className="space-y-1 md:col-span-2">
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

                {/* SMTP & Delivery Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    SMTP & Delivery Information
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Provider</label>
                      <span className="text-sm">{selectedLog.metadata?.provider || 'IONOS SMTP'}</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">SMTP Server</label>
                      <span className="text-sm">{selectedLog.metadata?.smtpHost || 'smtp.ionos.com'}</span>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Port</label>
                      <span className="text-sm">{selectedLog.metadata?.smtpPort || '587'}</span>
                    </div>

                    {selectedLog.metadata?.smtpResponseCode && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">SMTP Response Code</label>
                        <Badge variant={selectedLog.metadata.smtpResponseCode >= 200 && selectedLog.metadata.smtpResponseCode < 300 ? 'default' : 'destructive'}>
                          {selectedLog.metadata.smtpResponseCode}
                        </Badge>
                      </div>
                    )}

                    {selectedLog.metadata?.smtpResponse && (
                      <div className="space-y-1 md:col-span-2">
                        <label className="text-xs text-muted-foreground">SMTP Response</label>
                        <code className="text-xs bg-muted px-2 py-1 rounded block">
                          {selectedLog.metadata.smtpResponse}
                        </code>
                      </div>
                    )}

                    {selectedLog.metadata?.deliveryAttempts !== undefined && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Delivery Attempts</label>
                        <span className="text-sm">{selectedLog.metadata.deliveryAttempts}</span>
                      </div>
                    )}

                    {selectedLog.metadata?.retryCount !== undefined && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Retry Count</label>
                        <span className="text-sm">
                          {selectedLog.metadata.retryCount}
                          {selectedLog.metadata.maxRetries && ` / ${selectedLog.metadata.maxRetries}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Delivery Timeline */}
                {(selectedLog.metadata?.queuedAt || selectedLog.metadata?.processedAt || selectedLog.metadata?.deliveredAt) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Delivery Timeline
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        {selectedLog.metadata?.queuedAt && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Queued</label>
                            <span className="text-sm">{safeParseDateForDisplay(selectedLog.metadata.queuedAt)}</span>
                          </div>
                        )}
                        {selectedLog.metadata?.processedAt && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Processed</label>
                            <span className="text-sm">{safeParseDateForDisplay(selectedLog.metadata.processedAt)}</span>
                          </div>
                        )}
                        {selectedLog.metadata?.deliveredAt && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Delivered</label>
                            <span className="text-sm">{safeParseDateForDisplay(selectedLog.metadata.deliveredAt)}</span>
                          </div>
                        )}
                        {selectedLog.metadata?.openedAt && (
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">Opened</label>
                            <span className="text-sm">{safeParseDateForDisplay(selectedLog.metadata.openedAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                <Separator />

                {/* Actor Information */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Triggered By
                  </h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Actor</label>
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

                    {selectedLog.metadata?.templateName && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Template Used</label>
                        <Badge variant="secondary">{selectedLog.metadata.templateName}</Badge>
                      </div>
                    )}

                    {selectedLog.metadata?.emailType && (
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Email Type</label>
                        <Badge variant="outline">{selectedLog.metadata.emailType}</Badge>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    Description
                  </h4>
                  <p className="text-sm bg-muted/50 p-3 rounded-lg">
                    {selectedLog.description || 'No description available'}
                  </p>
                </div>

                {/* Error Message & Troubleshooting */}
                {(selectedLog.error_message || !selectedLog.success) && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-red-500" />
                        Error Details & Troubleshooting
                      </h4>
                      
                      {selectedLog.error_message && (
                        <div className="bg-red-500/10 border border-red-500/30 p-3 rounded-lg space-y-2">
                          <p className="text-sm font-medium text-red-600 dark:text-red-400">Error Message:</p>
                          <p className="text-sm text-red-600 dark:text-red-400 font-mono">
                            {selectedLog.error_message}
                          </p>
                        </div>
                      )}

                      {selectedLog.metadata?.bounceType && (
                        <div className="bg-orange-500/10 border border-orange-500/30 p-3 rounded-lg">
                          <p className="text-sm font-medium text-orange-600">Bounce Type: {selectedLog.metadata.bounceType}</p>
                          {selectedLog.metadata.bounceReason && (
                            <p className="text-sm text-orange-600 mt-1">{selectedLog.metadata.bounceReason}</p>
                          )}
                        </div>
                      )}

                      {/* Troubleshooting Tips */}
                      <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-lg space-y-2">
                        <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Troubleshooting Tips:</p>
                        <ul className="text-sm text-blue-600 dark:text-blue-400 list-disc list-inside space-y-1">
                          {selectedLog.error_message?.toLowerCase().includes('authentication') && (
                            <li>Check SMTP credentials in environment secrets (SMTP_USER, SMTP_PASSWORD)</li>
                          )}
                          {selectedLog.error_message?.toLowerCase().includes('connection') && (
                            <li>Verify SMTP host and port settings (SMTP_HOST, SMTP_PORT)</li>
                          )}
                          {selectedLog.error_message?.toLowerCase().includes('timeout') && (
                            <li>The mail server may be temporarily unavailable. Try again later.</li>
                          )}
                          {selectedLog.error_message?.toLowerCase().includes('rejected') && (
                            <li>The recipient address may be invalid or the mailbox may be full</li>
                          )}
                          {selectedLog.error_message?.toLowerCase().includes('spam') && (
                            <li>Email may have been flagged as spam. Check email content and sender reputation.</li>
                          )}
                          {selectedLog.metadata?.bounceType === 'hard' && (
                            <li>Hard bounce: The email address does not exist. Remove from mailing list.</li>
                          )}
                          {selectedLog.metadata?.bounceType === 'soft' && (
                            <li>Soft bounce: Temporary issue (mailbox full, server busy). Will retry automatically.</li>
                          )}
                          <li>Check the SMTP response code above for specific error details</li>
                          <li>Verify the recipient email address is correct and active</li>
                          <li>Contact IT support if the issue persists</li>
                        </ul>
                      </div>
                    </div>
                  </>
                )}

                {/* Raw Metadata Section */}
                {selectedLog.metadata && Object.keys(selectedLog.metadata).length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Raw Metadata (Technical Details)
                      </h4>
                      <div className="bg-muted/50 p-3 rounded-lg">
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap max-h-48">
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
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
