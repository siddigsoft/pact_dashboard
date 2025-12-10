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

  const fetchEmailLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('module', 'notification')
        .in('entity_type', ['email', 'otp'])
        .order('timestamp', { ascending: false })
        .limit(500);

      if (error) {
        console.error('Error fetching email logs:', error);
        toast({
          title: 'Error loading logs',
          description: error.message,
          variant: 'destructive',
        });
        return;
      }

      const logs = (data || []) as EmailLog[];
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
    } finally {
      setLoading(false);
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
      const result = await EmailNotificationService.sendNotification(
        testEmail,
        'Test User',
        {
          title: 'SMTP Test Email',
          message: 'This is a test email to verify your SMTP configuration is working correctly. If you received this email, your IONOS SMTP settings are configured properly.',
          type: 'success',
          actionUrl: window.location.origin,
          actionLabel: 'Go to PACT Platform',
        }
      );

      if (result.success) {
        toast({
          title: 'Test email sent',
          description: `Email sent successfully to ${testEmail}`,
        });
        setTestEmail('');
        // Refresh logs after a short delay
        setTimeout(fetchEmailLogs, 2000);
      } else {
        toast({
          title: 'Failed to send test email',
          description: result.error || 'Unknown error occurred',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send test email',
        variant: 'destructive',
      });
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
            Test SMTP Configuration
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
            Send a test email to verify your IONOS SMTP configuration is working correctly.
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
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id} data-testid={`row-email-${log.id}`}>
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
                        {log.error_message && (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            {log.error_message.substring(0, 30)}...
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
