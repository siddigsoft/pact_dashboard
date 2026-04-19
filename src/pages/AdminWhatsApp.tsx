import { useState, useEffect, useCallback, useRef } from "react";
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
import { useSuperAdmin } from "@/context/superAdmin/SuperAdminContext";
import { supabase } from "@/integrations/supabase/client";
import {
  MessageSquare, CheckCircle2, XCircle, RefreshCw, Send, Webhook,
  Copy, Phone, BarChart3, AlertTriangle, ArrowLeft, Clock,
  ChevronDown, ChevronUp, Activity, Inbox, Reply, User, ArrowUpRight,
  ArrowDownLeft, Settings, Info,
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

interface Conversation {
  phone: string;
  userName: string | null;
  userId: string | null;
  messages: WhatsAppLog[];
  lastMessage: WhatsAppLog;
  unread: number;
}

type Tab = 'inbox' | 'logs' | 'send' | 'settings';

export default function AdminWhatsAppPage() {
  const navigate = useNavigate();
  const { authReady } = useUser();
  const { isSuperAdmin } = useSuperAdmin();
  const { toast } = useToast();

  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [stats, setStats] = useState<DeliveryStats & { skipped: number }>({ total: 0, sent: 0, failed: 0, received: 0, successRate: 0, skipped: 0 });
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Hello from PACT Command Center! This is a test message.\n\nأهلاً من مركز قيادة باكت! هذه رسالة اختبار.');
  const [sending, setSending] = useState(false);
  const [sendProvider, setSendProvider] = useState<'meta_first' | 'meta' | 'wasender'>('meta_first');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [metaStatus, setMetaStatus] = useState<{ ok: boolean; verified_name?: string; display_phone_number?: string; status?: string; checking?: boolean }>({ ok: false });
  const [logFilter, setLogFilter] = useState<'all' | 'outbound' | 'inbound' | 'failed' | 'skipped'>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const threadEndRef = useRef<HTMLDivElement>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  const loadLogs = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingLogs(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      const rows = (data ?? []) as WhatsAppLog[];
      setLogs(rows);

      const total = rows.length;
      const sent = rows.filter(l => l.status === 'sent').length;
      const failed = rows.filter(l => l.status === 'failed').length;
      const received = rows.filter(l => l.direction === 'inbound').length;
      const skipped = rows.filter(l => l.status === 'skipped').length;
      setStats({
        total, sent, failed, received, skipped,
        successRate: total > 0 ? Math.round((sent / Math.max(sent + failed, 1)) * 100) : 0,
      });

      // Load display names for user_ids found in logs
      const userIds = [...new Set(rows.filter(r => r.user_id).map(r => r.user_id as string))];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach(p => { map[p.id] = p.full_name || p.email || p.id; });
          setUserNames(map);
        }
      }
    } catch (err) {
      console.error('Failed to load WhatsApp logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedPhone, logs]);

  // Build conversation threads grouped by phone
  const conversations: Conversation[] = (() => {
    const map = new Map<string, WhatsAppLog[]>();
    const sorted = [...logs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    sorted.forEach(log => {
      if (!map.has(log.phone)) map.set(log.phone, []);
      map.get(log.phone)!.push(log);
    });
    const convs: Conversation[] = [];
    map.forEach((messages, phone) => {
      const lastMessage = messages[messages.length - 1];
      const userId = messages.find(m => m.user_id)?.user_id ?? null;
      convs.push({
        phone,
        userName: userId ? (userNames[userId] ?? null) : null,
        userId,
        messages,
        lastMessage,
        unread: messages.filter(m => m.direction === 'inbound').length,
      });
    });
    return convs.sort((a, b) =>
      new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
    );
  })();

  const selectedConv = conversations.find(c => c.phone === selectedPhone) ?? null;

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
            user_ids: [], phone_numbers: [],
            event_type: 'reminder',
            data: { message: 'connection-check' },
          }),
        }
      );
      const result = await response.json() as { error?: string };
      if (result.error === 'WASENDER_API_KEY not configured') {
        setConnectionStatus('error');
        toast({ title: 'API Key Not Configured', description: 'Set WASENDER_API_KEY in Supabase → Edge Functions → Secrets.', variant: 'destructive' });
      } else {
        setConnectionStatus('connected');
        toast({ title: 'Connection OK', description: 'WasenderAPI is reachable and the key is configured.' });
      }
    } catch (err) {
      setConnectionStatus('error');
      toast({ title: 'Connection Error', description: err instanceof Error ? err.message : 'Connection check failed', variant: 'destructive' });
    }
  };

  const callSendWhatsApp = async (phones: string[], message: string, providerOverride?: 'meta' | 'wasender' | 'meta_first') => {
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
          phone_numbers: phones,
          event_type: 'admin_reply',
          provider: providerOverride || sendProvider,
          priority: 'urgent',
          data: { message, message_ar: message },
        }),
      }
    );
    const result = await response.json() as { sent?: number; failed?: number; error?: string; sent_via_meta?: number; sent_via_wasender?: number };
    if (!response.ok || result.error) throw new Error(result.error || 'Send failed');
    if ((result.sent ?? 0) === 0) throw new Error('Message not delivered — check the phone number and API key');
    return result;
  };

  const checkMetaStatus = async () => {
    setMetaStatus(s => ({ ...s, checking: true }));
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-register-phone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ action: 'status' }),
      });
      const result = await resp.json();
      if (resp.ok && result.ok && result.phone) {
        setMetaStatus({
          ok: true,
          checking: false,
          verified_name: result.phone.verified_name,
          display_phone_number: result.phone.display_phone_number,
          status: result.phone.status,
        });
        toast({ title: 'Meta connected', description: `${result.phone.verified_name} • ${result.phone.display_phone_number} • ${result.phone.status}` });
      } else {
        setMetaStatus({ ok: false, checking: false });
        toast({ title: 'Meta check failed', description: result.error || 'Unable to reach Meta', variant: 'destructive' });
      }
    } catch (err) {
      setMetaStatus({ ok: false, checking: false });
      toast({ title: 'Meta check failed', description: err instanceof Error ? err.message : 'Network error', variant: 'destructive' });
    }
  };

  const sendTest = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Phone required', description: 'Enter a phone number to test', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      await callSendWhatsApp([testPhone.trim()], testMessage);
      toast({ title: 'Test message sent!', description: `Delivered to ${testPhone}` });
      setTestPhone('');
      await loadLogs();
    } catch (err) {
      toast({ title: 'Send failed', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const sendReply = async () => {
    if (!selectedPhone || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await callSendWhatsApp([selectedPhone], replyText.trim());
      toast({ title: 'Reply sent', description: `Message delivered to ${selectedPhone}` });
      setReplyText('');
      await loadLogs();
    } catch (err) {
      toast({ title: 'Reply failed', description: err instanceof Error ? err.message : 'Failed', variant: 'destructive' });
    } finally {
      setSendingReply(false);
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
    if (logFilter === 'outbound') return l.direction === 'outbound' && l.status !== 'skipped';
    if (logFilter === 'inbound') return l.direction === 'inbound';
    if (logFilter === 'failed') return l.status === 'failed';
    if (logFilter === 'skipped') return l.status === 'skipped';
    return true;
  });

  const parseSkipReason = (errorMsg: string | null): string => {
    if (!errorMsg) return 'Unknown';
    if (errorMsg.includes('no_integration')) return 'Never set up WhatsApp';
    if (errorMsg.includes('whatsapp_disabled')) return 'WhatsApp turned off';
    if (errorMsg.includes('category_disabled')) {
      const col = errorMsg.split('category_disabled:')[1] ?? '';
      const label = col.replace('whatsapp_notify_', '').replace(/_/g, ' ');
      return `Category disabled: ${label}`;
    }
    if (errorMsg.includes('no_phone')) return 'No phone number on file';
    return errorMsg;
  };

  // Detect provider from message_body prefix.
  const getProvider = (body: string | null): 'meta' | 'wasender' | null => {
    if (!body) return null;
    if (body.startsWith('[META')) return 'meta';
    if (body.startsWith('[WASENDER]')) return 'wasender';
    return null;
  };

  // Extract a human-readable preview from any log body.
  // Handles legacy Meta logs that stored raw JSON template payloads.
  const readableBody = (body: string | null): string => {
    if (!body) return '(no message)';
    // Strip provider prefix
    let text = body.replace(/^\[META→[^\]]+\]\s*/, '').replace(/^\[WASENDER\]\s*/, '');

    // If it looks like a Meta template JSON, extract template name + parameters
    if (text.trim().startsWith('{') && text.includes('"template"')) {
      try {
        const parsed = JSON.parse(text);
        const tpl = parsed?.template;
        if (tpl) {
          const name = tpl.name || 'template';
          const lang = tpl.language?.code || '';
          const params: string[] = [];
          for (const c of tpl.components || []) {
            for (const p of c.parameters || []) {
              if (typeof p?.text === 'string') params.push(p.text);
            }
          }
          const paramSummary = params.length ? `\n  • ${params.join('\n  • ')}` : '';
          return `📨 Template: ${name}${lang ? ` (${lang})` : ''}${paramSummary}`;
        }
      } catch (_) { /* fall through */ }
      // Truncated JSON that won't parse — show a hint instead of the raw blob
      return '📨 Meta template message (raw payload — re-send to see readable text)';
    }
    return text;
  };

  if (!authReady) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  if (!isSuperAdmin) {
    return <div className="p-8 text-center text-muted-foreground">Access restricted to Super Admins only.</div>;
  }

  const tabs: { id: Tab; label: string; icon: typeof Inbox }[] = [
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'logs', label: 'Delivery Logs', icon: BarChart3 },
    { id: 'send', label: 'Send Message', icon: Send },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto" data-testid="admin-whatsapp-page">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} data-testid="button-back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-green-600" />
            WhatsApp Notifications
          </h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            PACT's WhatsApp number sends system notifications to staff. View replies and respond here.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={loadLogs} disabled={loadingLogs} data-testid="button-refresh">
          <RefreshCw className={cn('h-4 w-4', loadingLogs && 'animate-spin')} />
        </Button>
      </div>

      {/* How it works banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">How this works: </span>
          PACT runs <strong>two WhatsApp channels in parallel</strong>. Meta is tried first; if it fails, Wasender takes over automatically. Both send fully bilingual (EN+AR) messages.
        </div>
      </div>

      {/* Provider status cards (Meta + Wasender) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" data-testid="providers-strip">
        {/* Meta */}
        <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10 p-4" data-testid="card-provider-meta">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">Primary</span>
                <span className="font-bold text-blue-900 dark:text-blue-100">Meta WhatsApp Cloud API</span>
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1 font-mono">
                {metaStatus.display_phone_number || '+256 751 900013'}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                {metaStatus.verified_name || 'PACT Consultancy'} • Official templates • EN or AR
              </p>
            </div>
            <Badge variant="secondary" className={cn(
              'shrink-0',
              metaStatus.ok && metaStatus.status === 'CONNECTED' && 'bg-green-100 text-green-700 dark:bg-green-900/30',
              !metaStatus.ok && metaStatus.checking === false && 'bg-amber-100 text-amber-700',
              metaStatus.checking && 'bg-blue-100 text-blue-700'
            )}>
              {metaStatus.checking ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Checking</>
                : metaStatus.ok && metaStatus.status === 'CONNECTED' ? <><CheckCircle2 className="h-3 w-3 mr-1" />Connected</>
                : <><AlertTriangle className="h-3 w-3 mr-1" />Not checked</>}
            </Badge>
          </div>
        </div>

        {/* Wasender */}
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-4" data-testid="card-provider-wasender">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">Backup</span>
                <span className="font-bold text-emerald-900 dark:text-emerald-100">WasenderAPI</span>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
                Different number (set in Wasender dashboard)
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                Free-text bilingual EN+AR • Automatic failover • Works inside conversations
              </p>
            </div>
            <Badge variant="secondary" className={cn(
              'shrink-0',
              connectionStatus === 'connected' && 'bg-green-100 text-green-700 dark:bg-green-900/30',
              connectionStatus === 'error' && 'bg-red-100 text-red-700 dark:bg-red-900/30',
              connectionStatus === 'checking' && 'bg-amber-100 text-amber-700',
              connectionStatus === 'idle' && 'bg-amber-100 text-amber-700'
            )}>
              {connectionStatus === 'idle' && <><AlertTriangle className="h-3 w-3 mr-1" />Not checked</>}
              {connectionStatus === 'checking' && <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Checking</>}
              {connectionStatus === 'connected' && <><CheckCircle2 className="h-3 w-3 mr-1" />Connected</>}
              {connectionStatus === 'error' && <><XCircle className="h-3 w-3 mr-1" />Error</>}
            </Badge>
          </div>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Notifications Sent', value: stats.sent, icon: Send, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Delivery Rate', value: `${stats.successRate}%`, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/20' },
          { label: 'Failed', value: stats.failed, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
          { label: 'Skipped', value: stats.skipped, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Replies Received', value: stats.received, icon: Inbox, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/20' },
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

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              data-testid={`tab-${t.id}`}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                activeTab === t.id
                  ? 'border-[#1D3461] text-[#1D3461] dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.id === 'inbox' && stats.received > 0 && (
                <span className="ml-1 bg-purple-600 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {stats.received}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── INBOX TAB ── */}
      {activeTab === 'inbox' && (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 min-h-[500px]">
          {/* Conversation list */}
          <div className="border rounded-xl overflow-hidden flex flex-col" data-testid="inbox-list">
            <div className="p-3 border-b bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conversations ({conversations.length})</p>
            </div>
            {loadingLogs ? (
              <div className="p-3 space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                <Inbox className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm">No conversations yet</p>
                <p className="text-xs mt-1">Replies from staff will appear here once the webhook is configured</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y">
                {conversations.map(conv => (
                  <button
                    key={conv.phone}
                    onClick={() => setSelectedPhone(conv.phone)}
                    data-testid={`conv-${conv.phone}`}
                    className={cn(
                      'w-full text-left px-3 py-3 hover:bg-muted/50 transition-colors',
                      selectedPhone === conv.phone && 'bg-blue-50 dark:bg-blue-900/20',
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-7 w-7 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-green-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {conv.userName ?? conv.phone}
                        </p>
                        {conv.userName && (
                          <p className="text-[10px] font-mono text-muted-foreground">{conv.phone}</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(conv.lastMessage.created_at), 'd MMM, HH:mm')}
                        </p>
                        {conv.unread > 0 && (
                          <span className="inline-block mt-0.5 bg-green-600 text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                            {conv.unread}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate pl-9">
                      {conv.lastMessage.direction === 'inbound' ? '← ' : '→ '}
                      {readableBody(conv.lastMessage.message_body).slice(0, 55)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Thread / Reply panel */}
          <div className="border rounded-xl flex flex-col overflow-hidden" data-testid="inbox-thread">
            {!selectedConv ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground p-8">
                <MessageSquare className="h-10 w-10 mb-3 opacity-20" />
                <p className="font-medium">Select a conversation</p>
                <p className="text-sm mt-1">Choose a contact from the list to see their messages and reply</p>
              </div>
            ) : (
              <>
                {/* Thread header */}
                <div className="flex items-center gap-3 p-4 border-b bg-muted/20">
                  <div className="h-9 w-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{selectedConv.userName ?? selectedConv.phone}</p>
                    {selectedConv.userName && (
                      <p className="text-xs font-mono text-muted-foreground">{selectedConv.phone}</p>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {selectedConv.messages.length} messages
                  </Badge>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 max-h-[400px]">
                  {selectedConv.messages.map(msg => (
                    <div
                      key={msg.id}
                      className={cn('flex gap-2', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}
                    >
                      {msg.direction === 'inbound' && (
                        <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-1">
                          <ArrowDownLeft className="h-3 w-3 text-green-600" />
                        </div>
                      )}
                      <div
                        className={cn(
                          'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                          msg.direction === 'outbound'
                            ? 'bg-[#1D3461] text-white rounded-tr-sm'
                            : 'bg-muted rounded-tl-sm',
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{readableBody(msg.message_body)}</p>
                        <div className={cn('flex items-center gap-1 mt-1', msg.direction === 'outbound' ? 'justify-end' : 'justify-start')}>
                          <span className={cn('text-[10px]', msg.direction === 'outbound' ? 'text-blue-200' : 'text-muted-foreground')}>
                            {format(new Date(msg.created_at), 'HH:mm · d MMM')}
                          </span>
                          {msg.direction === 'outbound' && (
                            <span className={cn('text-[10px]', msg.status === 'sent' ? 'text-green-300' : 'text-red-300')}>
                              · {msg.status}
                            </span>
                          )}
                        </div>
                      </div>
                      {msg.direction === 'outbound' && (
                        <div className="h-6 w-6 rounded-full bg-[#1D3461]/10 flex items-center justify-center shrink-0 mt-1">
                          <ArrowUpRight className="h-3 w-3 text-[#1D3461]" />
                        </div>
                      )}
                    </div>
                  ))}
                  <div ref={threadEndRef} />
                </div>

                {/* Reply composer */}
                <div className="p-3 border-t bg-muted/10">
                  <div className="flex gap-2">
                    <textarea
                      rows={2}
                      placeholder={`Reply to ${selectedConv.userName ?? selectedConv.phone}…`}
                      value={replyText}
                      onChange={e => setReplyText(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) sendReply(); }}
                      data-testid="textarea-reply"
                      className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                    />
                    <Button
                      onClick={sendReply}
                      disabled={sendingReply || !replyText.trim()}
                      className="gap-2 bg-green-600 hover:bg-green-700 text-white self-end"
                      data-testid="button-send-reply"
                    >
                      {sendingReply ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Reply className="h-4 w-4" />}
                      {sendingReply ? 'Sending…' : 'Reply'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Ctrl+Enter to send</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── LOGS TAB ── */}
      {activeTab === 'logs' && (
        <Card data-testid="card-delivery-logs">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Delivery Logs</CardTitle>
                  <CardDescription>All outbound notifications and inbound replies</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={loadLogs} disabled={loadingLogs} data-testid="button-refresh-logs">
                <RefreshCw className={cn('h-4 w-4', loadingLogs && 'animate-spin')} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              {([
                { key: 'all', label: 'All', count: logs.length },
                { key: 'outbound', label: 'Sent', count: logs.filter(l => l.direction === 'outbound' && l.status !== 'skipped').length },
                { key: 'inbound', label: 'Replies', count: logs.filter(l => l.direction === 'inbound').length },
                { key: 'failed', label: 'Failed', count: logs.filter(l => l.status === 'failed').length },
                { key: 'skipped', label: 'Skipped', count: logs.filter(l => l.status === 'skipped').length },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setLogFilter(f.key)}
                  data-testid={`filter-log-${f.key}`}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-all',
                    logFilter === f.key
                      ? 'bg-[#1D3461] text-white border-[#1D3461]'
                      : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 hover:border-slate-300',
                    f.key === 'skipped' && logFilter !== f.key && f.count > 0 && 'border-amber-300 text-amber-700',
                  )}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {loadingLogs ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
            ) : filteredLogs.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {filteredLogs.map(log => (
                  <div key={log.id} className="border rounded-lg overflow-hidden" data-testid={`log-row-${log.id}`}>
                    <button
                      className="w-full text-left p-3 flex items-center gap-3 hover:bg-muted/50 transition-colors"
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'shrink-0 text-[10px] px-1.5 py-0',
                            log.status === 'skipped' && 'bg-amber-100 text-amber-700',
                            log.direction === 'outbound' && log.status !== 'skipped' && 'bg-blue-100 text-blue-700',
                            log.direction === 'inbound' && 'bg-purple-100 text-purple-700',
                          )}
                        >
                          {log.status === 'skipped' ? '⊘ SKIP' : log.direction === 'inbound' ? '← IN' : '→ OUT'}
                        </Badge>
                        <span className="text-xs font-mono text-muted-foreground shrink-0">{log.phone === 'unknown' ? userNames[log.user_id ?? ''] ?? log.phone : log.phone}</span>
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 shrink-0 hidden sm:block">
                          {log.event_type}
                        </span>
                        {(() => {
                          const prov = getProvider(log.message_body);
                          return prov && (
                            <Badge variant="secondary" className={cn(
                              'shrink-0 text-[9px] px-1.5 py-0 font-bold uppercase tracking-wider',
                              prov === 'meta' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'
                            )}>
                              {prov}
                            </Badge>
                          );
                        })()}
                        <span className="text-xs text-muted-foreground truncate min-w-0">
                          {log.status === 'skipped'
                            ? parseSkipReason(log.error_message)
                            : readableBody(log.message_body).replace(/\n/g, ' ').slice(0, 60)}
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
                            log.status === 'skipped' && 'bg-amber-100 text-amber-700',
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
                          {log.status === 'skipped' && log.error_message && (
                            <div className="col-span-2 text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span><span className="font-semibold">Skip reason:</span> {parseSkipReason(log.error_message)}</span>
                            </div>
                          )}
                          {log.status !== 'skipped' && log.error_message && (
                            <div className="col-span-2 text-red-600"><span className="font-semibold">Error:</span> {log.error_message}</div>
                          )}
                          <div className="col-span-2"><span className="text-muted-foreground">Time:</span> {format(new Date(log.created_at), 'd MMM yyyy, HH:mm:ss')}</div>
                        </div>
                        {log.message_body && log.status !== 'skipped' && (() => {
                          const prov = getProvider(log.message_body);
                          return (
                            <div>
                              <p className="text-muted-foreground mb-1 flex items-center gap-2">
                                Message:
                                {prov && (
                                  <Badge variant="secondary" className={cn(
                                    'text-[9px] px-1.5 py-0 font-bold uppercase tracking-wider',
                                    prov === 'meta' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'
                                  )}>
                                    sent via {prov}
                                  </Badge>
                                )}
                              </p>
                              <pre className="whitespace-pre-wrap bg-background rounded p-2 border text-[11px] max-h-48 overflow-y-auto">{readableBody(log.message_body)}</pre>
                            </div>
                          );
                        })()}
                        {log.direction === 'inbound' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={() => { setSelectedPhone(log.phone); setActiveTab('inbox'); }}
                          >
                            <Reply className="h-3.5 w-3.5" /> Open in Inbox
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── SEND MESSAGE TAB ── */}
      {activeTab === 'send' && (
        <Card data-testid="card-send-message">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle className="text-base">Send a Message</CardTitle>
                <CardDescription>Send a direct message from PACT's WhatsApp number to any phone</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-800 dark:text-blue-200">
              Choose which WhatsApp channel to send from. <strong>Auto-failover</strong> tries Meta first, then Wasender if Meta fails.
            </div>

            {/* Provider selector */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Send via
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="provider-selector">
                {[
                  { id: 'meta_first' as const, label: 'Auto-failover', sub: 'Meta → Wasender', color: 'purple' },
                  { id: 'meta' as const, label: 'Meta only', sub: '+256 751 900013', color: 'blue' },
                  { id: 'wasender' as const, label: 'Wasender only', sub: 'Backup number', color: 'emerald' },
                ].map(opt => {
                  const active = sendProvider === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSendProvider(opt.id)}
                      data-testid={`provider-option-${opt.id}`}
                      className={cn(
                        'rounded-lg border-2 p-3 text-left transition-all',
                        active
                          ? opt.color === 'blue' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : opt.color === 'emerald' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'border-muted hover:border-muted-foreground/30'
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {active && <CheckCircle2 className={cn(
                          'h-4 w-4',
                          opt.color === 'blue' ? 'text-blue-600' : opt.color === 'emerald' ? 'text-emerald-600' : 'text-purple-600'
                        )} />}
                        <span className="text-sm font-semibold">{opt.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 ml-0.5">{opt.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="test-phone" className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> Recipient phone number
              </Label>
              <Input
                id="test-phone"
                placeholder="e.g. +249912345678 or 0912345678"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                data-testid="input-test-phone"
              />
              <p className="text-xs text-muted-foreground">Sudan numbers (09XXXXXXXX) are auto-converted to +249.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="test-message">Message</Label>
              <textarea
                id="test-message"
                rows={5}
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
              {sending ? 'Sending…' : 'Send Message'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          {/* Meta Cloud API Connection */}
          <Card data-testid="card-meta-connection" className="border-blue-200 dark:border-blue-800">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      Meta WhatsApp Cloud API
                      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded">Primary</span>
                    </CardTitle>
                    <CardDescription>Official template messages from {metaStatus.display_phone_number || '+256 751 900013'}</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary" className={cn(
                  'shrink-0',
                  metaStatus.ok && metaStatus.status === 'CONNECTED' && 'bg-green-100 text-green-700 dark:bg-green-900/30',
                  !metaStatus.ok && !metaStatus.checking && 'bg-amber-100 text-amber-700',
                  metaStatus.checking && 'bg-blue-100 text-blue-700'
                )}>
                  {metaStatus.checking ? <><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Checking…</>
                    : metaStatus.ok && metaStatus.status === 'CONNECTED' ? <><CheckCircle2 className="h-3 w-3 mr-1" />Connected</>
                    : <><AlertTriangle className="h-3 w-3 mr-1" />Not checked</>}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200">
                <p className="font-semibold mb-1">Setup required</p>
                <p>Set <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">META_WA_ACCESS_TOKEN_NEW</code>, <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">META_WA_PHONE_NUMBER_ID</code>, and <code className="font-mono bg-blue-100 dark:bg-blue-900/50 px-1 rounded">META_WABA_ID</code> in your Supabase Edge Function secrets.</p>
              </div>
              {metaStatus.ok && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Display name</p><p className="font-semibold">{metaStatus.verified_name}</p></div>
                  <div className="rounded-lg border p-2"><p className="text-xs text-muted-foreground">Phone number</p><p className="font-mono">{metaStatus.display_phone_number}</p></div>
                  <div className="rounded-lg border p-2 col-span-2"><p className="text-xs text-muted-foreground">Cloud API status</p><p className="font-semibold">{metaStatus.status}</p></div>
                </div>
              )}
              <Button
                onClick={checkMetaStatus}
                disabled={metaStatus.checking}
                variant="outline"
                className="gap-2"
                data-testid="button-check-meta"
              >
                {metaStatus.checking ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Check Meta Connection
              </Button>
            </CardContent>
          </Card>

          {/* WasenderAPI Connection */}
          <Card data-testid="card-connection-check" className="border-emerald-200 dark:border-emerald-800">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                    <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      WasenderAPI
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">Backup</span>
                    </CardTitle>
                    <CardDescription>Free-text bilingual messages — used when Meta fails</CardDescription>
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
                {connectionStatus === 'checking' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                Check Connection
              </Button>
            </CardContent>
          </Card>

          {/* Webhook */}
          <Card data-testid="card-webhook">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <Webhook className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Inbound Webhook</CardTitle>
                  <CardDescription>Receive replies sent to PACT's WhatsApp number</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Paste this URL into your <strong>WasenderAPI dashboard → Webhook Settings</strong>. When any staff member replies to PACT's WhatsApp number, the message is logged and appears in the Inbox above.
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
              <Separator />
              <ul className="text-sm text-muted-foreground space-y-1">
                {[
                  'Receives replies from staff who message PACT\'s WhatsApp number',
                  'Automatically matches sender phone to PACT staff profile',
                  'Logs all inbound messages — visible in Inbox and Delivery Logs',
                  'Secured via WASENDER_WEBHOOK_SECRET (set in Supabase secrets)',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
