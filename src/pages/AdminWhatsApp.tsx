import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/context/user/UserContext";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare, CheckCircle2, XCircle, RefreshCw, Send, Webhook,
  Copy, Phone, BarChart3, AlertTriangle, ArrowLeft, Clock,
  ChevronDown, ChevronUp, Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface WhatsAppLog {
  id: string;
  phone: string;
  user_id: string | null;
  event_type: string;
  status: string;
  direction: string;
  message_body: string | null;
  error_message: string | null;
  wasender_id: string | null;
  created_at: string;
}

interface DeliveryStats {
  total: number;
  sent: number;
  failed: number;
  received: number;
  successRate: number;
}

const ADMIN_ROLES = ['admin', 'superadmin'];

export default function AdminWhatsAppPage() {
  const navigate = useNavigate();
  const { currentUser, userRole } = useUser();
  const { toast } = useToast();

  const role = (userRole ?? '').toLowerCase();
  const isAdmin = ADMIN_ROLES.includes(role);

  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [stats, setStats] = useState<DeliveryStats>({ total: 0, sent: 0, failed: 0, received: 0, successRate: 0 });
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from PACT Command Center! This is a test message. 🎉\n\nأهلاً من مركز قيادة باكت! هذه رسالة اختبار.');
  const [sending, setSending] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [logFilter, setLogFilter] = useState<'all' | 'outbound' | 'inbound' | 'failed'>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  const loadLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      const rows = (data ?? []) as WhatsAppLog[];
      setLogs(rows);

      const total = rows.length;
      const sent = rows.filter(l => l.status === 'sent').length;
      const failed = rows.filter(l => l.status === 'failed').length;
      const received = rows.filter(l => l.direction === 'inbound').length;
      setStats({
        total, sent, failed, received,
        successRate: total > 0 ? Math.round((sent / Math.max(sent + failed, 1)) * 100) : 0,
      });
    } catch (err) {
      console.error('Failed to load WhatsApp logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [isAdmin]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            user_ids: [],
            phone_numbers: [],
            event_type: 'reminder',
            data: { message: 'connection-check' },
          }),
        }
      );

      const result = await response.json() as { success?: boolean; skipped?: boolean; error?: string };

      if (result.error === 'WASENDER_API_KEY not configured') {
        setConnectionStatus('error');
        toast({
          title: 'API Key Not Configured',
          description: 'WASENDER_API_KEY is not set in your Supabase Edge Function secrets.',
          variant: 'destructive',
        });
      } else {
        setConnectionStatus('connected');
        toast({ title: 'Connection OK', description: 'WasenderAPI is reachable and the key is configured.' });
      }
    } catch (err) {
      setConnectionStatus('error');
      const message = err instanceof Error ? err.message : 'Connection check failed';
      toast({ title: 'Connection Error', description: message, variant: 'destructive' });
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Phone required', description: 'Enter a phone number to test', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            phone_numbers: [testPhone.trim()],
            event_type: 'reminder',
            data: { message: testMessage, message_ar: testMessage },
          }),
        }
      );

      const result = await response.json() as { success?: boolean; sent?: number; failed?: number; error?: string };

      if (!response.ok || result.error) throw new Error(result.error || 'Send failed');
      if (result.sent === 0) throw new Error('Message not delivered — check the phone number and API key');

      toast({ title: 'Test message sent!', description: `Delivered to ${testPhone}` });
      await loadLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send test message';
      toast({ title: 'Send failed', description: message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
      toast({ title: 'Copied!', description: 'Webhook URL copied to clipboard' });
    } catch {
      toast({ title: 'Copy failed', description: 'Please copy the URL manually', variant: 'destructive' });
    }
  };

  const filteredLogs = logs.filter(l => {
    if (logFilter === 'outbound') return l.direction === 'outbound';
    if (logFilter === 'inbound') return l.direction === 'inbound';
    if (logFilter === 'failed') return l.status === 'failed';
    return true;
  });

  if (!isAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Access restricted to administrators.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto" data-testid="admin-whatsapp-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            WhatsApp Integration
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Manage WasenderAPI connection, test messages, and view delivery logs
          </p>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Sent', value: stats.sent, icon: Send, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Delivered', value: `${stats.successRate}%`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Inbound', value: stats.received, icon: Activity, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={cn('rounded-xl p-4 flex items-center gap-3', stat.bg)}>
              <Icon className={cn('h-5 w-5 shrink-0', stat.color)} />
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className={cn('text-xl font-bold', stat.color)}>{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Connection Check Card */}
      <Card data-testid="card-connection-check">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">WasenderAPI Connection</CardTitle>
                <CardDescription>Verify the API key is configured correctly</CardDescription>
              </div>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                connectionStatus === 'connected' && 'bg-green-100 text-green-700 dark:bg-green-900/30',
                connectionStatus === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30',
                connectionStatus === 'checking' && 'bg-amber-100 text-amber-700',
              )}
              data-testid="badge-connection-status"
            >
              {connectionStatus === 'idle' && <><XCircle className="h-3 w-3 mr-1" />Not checked</>}
              {connectionStatus === 'checking' && <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Checking…</>}
              {connectionStatus === 'connected' && <><CheckCircle2 className="h-3 w-3 mr-1" />Connected</>}
              {connectionStatus === 'error' && <><AlertTriangle className="h-3 w-3 mr-1" />Error</>}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold mb-1">Setup required</p>
            <p>Set <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">WASENDER_API_KEY</code> in your Supabase dashboard → Edge Functions → Secrets. Optionally set <code className="font-mono bg-amber-100 dark:bg-amber-900/50 px-1 rounded">WASENDER_WEBHOOK_SECRET</code> to secure inbound messages.</p>
          </div>
          <Button
            onClick={checkConnection}
            disabled={connectionStatus === 'checking'}
            variant="outline"
            className="gap-2"
            data-testid="button-check-connection"
          >
            {connectionStatus === 'checking' ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Activity className="h-4 w-4" />
            )}
            Check Connection
          </Button>
        </CardContent>
      </Card>

      {/* Send Test Message */}
      <Card data-testid="card-test-message">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
              <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Send Test Message</CardTitle>
              <CardDescription>Verify delivery end-to-end with a real phone number</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="test-phone" className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Phone number
            </Label>
            <Input
              id="test-phone"
              placeholder="e.g. +249912345678 or 0912345678"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              data-testid="input-test-phone"
            />
            <p className="text-xs text-muted-foreground">Include country code. Sudan numbers: 09XXXXXXXX auto-converts to +249.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="test-message">Message</Label>
            <textarea
              id="test-message"
              rows={4}
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              data-testid="textarea-test-message"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <Button
            onClick={sendTest}
            disabled={sending || !testPhone.trim()}
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
            data-testid="button-send-test"
          >
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send Test Message'}
          </Button>
        </CardContent>
      </Card>

      {/* Webhook Setup */}
      <Card data-testid="card-webhook">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
              <Webhook className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-base">Inbound Webhook</CardTitle>
              <CardDescription>Receive messages sent to your WhatsApp number</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Webhook URL</p>
            <p className="text-xs text-muted-foreground">
              Paste this URL into your WasenderAPI dashboard → Webhook Settings
            </p>
            <div className="flex gap-2">
              <div className="flex-1 rounded-lg border bg-muted/50 px-3 py-2 font-mono text-xs break-all text-muted-foreground">
                {webhookUrl}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={copyWebhookUrl}
                data-testid="button-copy-webhook"
                className={cn(webhookCopied && 'border-green-500 text-green-600')}
              >
                {webhookCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <p className="text-sm font-medium">What the webhook handles</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              {[
                'Receives inbound WhatsApp messages from your connected number',
                'Automatically matches sender to a PACT user profile',
                'Logs all inbound messages to the delivery log below',
                'Secured via WASENDER_WEBHOOK_SECRET (set in Supabase secrets)',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Delivery Logs */}
      <Card data-testid="card-delivery-logs">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <CardTitle className="text-base">Delivery Logs</CardTitle>
                <CardDescription>Last 100 messages — outbound and inbound</CardDescription>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={loadLogs} disabled={loadingLogs} data-testid="button-refresh-logs">
              <RefreshCw className={cn('h-4 w-4', loadingLogs && 'animate-spin')} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter chips */}
          <div className="flex gap-2 flex-wrap">
            {(['all', 'outbound', 'inbound', 'failed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                data-testid={`filter-log-${f}`}
                className={cn(
                  'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                  logFilter === f
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 hover:border-slate-300',
                )}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {f === 'all' && ` (${logs.length})`}
                {f === 'outbound' && ` (${logs.filter(l => l.direction === 'outbound').length})`}
                {f === 'inbound' && ` (${logs.filter(l => l.direction === 'inbound').length})`}
                {f === 'failed' && ` (${logs.filter(l => l.status === 'failed').length})`}
              </button>
            ))}
          </div>

          {loadingLogs ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No messages yet</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredLogs.map(log => (
                <div
                  key={log.id}
                  className="border rounded-lg overflow-hidden"
                  data-testid={`log-row-${log.id}`}
                >
                  <button
                    className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                    onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0',
                          log.status === 'sent' && 'bg-green-100 text-green-700',
                          log.status === 'failed' && 'bg-red-100 text-red-700',
                          log.status === 'received' && 'bg-purple-100 text-purple-700',
                        )}
                      >
                        {log.direction === 'inbound' ? '← IN' : '→ OUT'}
                      </Badge>
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{log.phone}</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 hidden sm:block">
                        {log.event_type}
                      </span>
                      <span className="text-xs text-muted-foreground truncate min-w-0">
                        {log.message_body?.slice(0, 60)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-[10px] px-1.5 py-0',
                          log.status === 'sent' && 'bg-green-100 text-green-700',
                          log.status === 'failed' && 'bg-red-100 text-red-700',
                          log.status === 'received' && 'bg-purple-100 text-purple-700',
                        )}
                      >
                        {log.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap hidden md:block">
                        <Clock className="h-3 w-3 inline mr-0.5" />
                        {format(new Date(log.created_at), 'd MMM, HH:mm')}
                      </span>
                      {expandedLog === log.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    </div>
                  </button>
                  {expandedLog === log.id && (
                    <div className="border-t bg-muted/30 p-3 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-muted-foreground">Phone:</span> <span className="font-mono">{log.phone}</span></div>
                        <div><span className="text-muted-foreground">Event:</span> {log.event_type}</div>
                        <div><span className="text-muted-foreground">Status:</span> {log.status}</div>
                        <div><span className="text-muted-foreground">Direction:</span> {log.direction}</div>
                        {log.wasender_id && <div className="col-span-2"><span className="text-muted-foreground">Wasender ID:</span> <span className="font-mono">{log.wasender_id}</span></div>}
                        {log.error_message && <div className="col-span-2 text-red-600"><span className="font-semibold">Error:</span> {log.error_message}</div>}
                        <div className="col-span-2"><span className="text-muted-foreground">Time:</span> {format(new Date(log.created_at), 'd MMM yyyy, HH:mm:ss')}</div>
                      </div>
                      {log.message_body && (
                        <div>
                          <p className="text-muted-foreground mb-1">Message:</p>
                          <pre className="whitespace-pre-wrap bg-background rounded p-2 border text-[11px] max-h-32 overflow-y-auto">{log.message_body}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
