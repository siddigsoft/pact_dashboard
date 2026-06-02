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
  ArrowDownLeft, Settings, Info, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, isValid } from "date-fns";

const safeFormat = (raw: string | null | undefined, fmt: string, fallback = '—'): string => {
  if (!raw) return fallback;
  const d = new Date(raw);
  return isValid(d) ? format(d, fmt) : fallback;
};

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

type Tab = 'inbox' | 'logs' | 'send' | 'templates' | 'settings';

// Sample renderings of the 5 message shapes used by both providers.
// (Wasender sends as free text; Meta sends as pre-approved template by the same name.)
const TEMPLATE_PREVIEWS = [
  {
    id: 'pact_task_event',
    icon: '✅',
    title: 'Task Update',
    color: 'blue',
    description: 'Task lifecycle events (created, assigned, started, completed, etc.)',
    eventCount: 9,
    sampleEvents: ['task_assigned', 'task_completed', 'task_started', 'task_acknowledged', 'project_task_assigned'],
    en: `*Task Update*\n\nHello ELSIDDIG,\n\nTask: *Site monitoring report Q2*\nStatus: assigned to you by Manager\nDue date: 2026-04-25\n\nOpen task: https://app.pactorg.com/my-tasks`,
    ar: `*تحديث مهمة*\n\nمرحباً ELSIDDIG،\n\nالمهمة: *Site monitoring report Q2*\nالحالة: assigned to you by Manager\nتاريخ الاستحقاق: 2026-04-25\n\nفتح المهمة: https://app.pactorg.com/my-tasks`,
  },
  {
    id: 'pact_approval_request',
    icon: '📋',
    title: 'Approval Required',
    color: 'amber',
    description: 'Items needing manager approval (leave, costs, signatures, MMP, payroll)',
    eventCount: 9,
    sampleEvents: ['approval_required', 'leave_request_submitted', 'cost_submitted', 'signature_requested', 'mmp_forwarded', 'payroll_approval_needed'],
    en: `*Approval Required*\n\nHello Manager,\n\nleave request (Annual, 2026-05-01 → 2026-05-07) requires your approval.\nSubmitted by: ELSIDDIG IBRAHIM\n\nReview: https://app.pactorg.com/approvals`,
    ar: `*مطلوب موافقة*\n\nمرحباً Manager،\n\nleave request (Annual, 2026-05-01 → 2026-05-07) يتطلب موافقتك.\nمقدم من: ELSIDDIG IBRAHIM\n\nللمراجعة: https://app.pactorg.com/approvals`,
  },
  {
    id: 'pact_status_update',
    icon: '🔄',
    title: 'Status Update',
    color: 'emerald',
    description: 'Outcome of a request or workflow stage (approved, rejected, completed, advanced)',
    eventCount: 32,
    sampleEvents: ['leave_request_approved', 'cost_approved', 'project_completed', 'mmp_completed', 'payroll_slip_ready', 'site_visit_completed', 'crm_opportunity_won', 'user_approved'],
    en: `*Status Update*\n\nHello ELSIDDIG,\n\nYour leave request (Annual) has been *approved*.\nNotes: 2026-05-01 → 2026-05-07 by Manager`,
    ar: `*تحديث حالة*\n\nمرحباً ELSIDDIG،\n\nتم *approved* leave request (Annual) الخاص بك.\nملاحظات: 2026-05-01 → 2026-05-07 by Manager`,
  },
  {
    id: 'pact_alert',
    icon: '⚠️',
    title: 'Alert',
    color: 'red',
    description: 'Urgent issues needing immediate attention (overdue, expired, stalled, over-budget)',
    eventCount: 12,
    sampleEvents: ['task_overdue', 'task_delayed', 'contract_expiring_7d', 'budget_threshold_100', 'project_stalled', 'site_flagged_uncovered'],
    en: `⚠️ *Overdue Task*\n\nSite monitoring report Q2\n\nDetails: due 2026-04-19\nAction needed: take action immediately`,
    ar: `⚠️ *Overdue Task*\n\nSite monitoring report Q2\n\nالتفاصيل: due 2026-04-19\nالإجراء المطلوب: take action immediately`,
  },
  {
    id: 'pact_reminder',
    icon: '🔔',
    title: 'Reminder',
    color: 'purple',
    description: 'Soft nudges, daily digests, and broadcast announcements',
    eventCount: 4,
    sampleEvents: ['reminder', 'daily_digest', 'broadcast', 'task_reminder_1day'],
    en: `*Reminder*\n\nHello ELSIDDIG,\n\nYou have 1 task due tomorrow: "Site monitoring report Q2".\n\nView: https://app.pactorg.com/my-tasks`,
    ar: `*تذكير*\n\nمرحباً ELSIDDIG،\n\nلديك 1 task due tomorrow: "Site monitoring report Q2".\n\nللعرض: https://app.pactorg.com/my-tasks`,
  },
] as const;

const FOOTER = '\n\n— PACT Command Center\nhttps://app.pactorg.com';

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
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<{ keyMissing: boolean; detail: string } | null>(null);
  const [logFilter, setLogFilter] = useState<'all' | 'outbound' | 'inbound' | 'failed' | 'skipped'>('all');
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('inbox');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, { name: string; email: string }>>({});
  const threadEndRef = useRef<HTMLDivElement>(null);
  const [noIntegrationCount, setNoIntegrationCount] = useState(0);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [staffWithPhones, setStaffWithPhones] = useState<{ id: string; full_name: string; phone: string }[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [sendingOptIn, setSendingOptIn] = useState(false);
  const [optInResults, setOptInResults] = useState<{ sent: number; failed: number } | null>(null);

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
          const map: Record<string, { name: string; email: string }> = {};
          profiles.forEach(p => { map[p.id] = { name: p.full_name || p.id, email: p.email || '' }; });
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
  useEffect(() => { if (activeTab === 'send') loadStaffWithPhones(); }, [activeTab, loadStaffWithPhones]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    (async () => {
      try {
        const since = new Date();
        since.setDate(since.getDate() - 30);
        const { data } = await supabase
          .from('whatsapp_logs')
          .select('user_id')
          .eq('status', 'skipped')
          .ilike('error_message', '%no_integration%')
          .gte('created_at', since.toISOString())
          .not('user_id', 'is', null);
        const unique = new Set((data ?? []).map((r: { user_id: string }) => r.user_id)).size;
        setNoIntegrationCount(unique);
      } catch { /* non-fatal */ }
    })();
  }, [isSuperAdmin]);

  useEffect(() => {
    if (threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedPhone, logs]);

  // Build conversation threads grouped by phone
  const conversations: Conversation[] = (() => {
    const map = new Map<string, WhatsAppLog[]>();
    const safeTime = (v: string | null | undefined) => { const d = v ? new Date(v) : null; return d && isValid(d) ? d.getTime() : 0; };
    const sorted = [...logs].sort((a, b) => safeTime(a.created_at) - safeTime(b.created_at));
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
        userName: userId ? (userNames[userId]?.name ?? null) : null,
        userId,
        messages,
        lastMessage,
        unread: messages.filter(m => m.direction === 'inbound').length,
      });
    });
    return convs.sort((a, b) => safeTime(b.lastMessage.created_at) - safeTime(a.lastMessage.created_at));
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
          body: JSON.stringify({ ping: true }),
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Function returned HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const result = await response.json() as {
        ping?: boolean;
        configured?: boolean;
        providers?: { wasender?: boolean; meta?: boolean };
        wasender_detail?: Record<string, unknown>;
        error?: string;
      };

      if (!result.configured) {
        setConnectionStatus('error');
        setConnectionError({ keyMissing: true, detail: 'WASENDER_API_KEY is not set in Supabase Edge Function Secrets.' });
        toast({ title: 'WASENDER_API_KEY Not Set', description: 'Add it in Supabase → Edge Functions → Secrets, then redeploy.', variant: 'destructive' });
      } else if (result.providers?.wasender) {
        setConnectionStatus('connected');
        setConnectionError(null);
        toast({ title: 'WasenderAPI Connected ✓', description: 'API key accepted — messages will be delivered.' });
      } else {
        setConnectionStatus('error');
        const errDetail = result.error || 'Unknown error from WasenderAPI';
        setConnectionError({ keyMissing: false, detail: errDetail });
        toast({ title: 'WasenderAPI Error', description: errDetail, variant: 'destructive' });
      }
    } catch (err) {
      setConnectionStatus('error');
      toast({
        title: 'Connection Error',
        description: err instanceof Error ? err.message : 'Connection check failed',
        variant: 'destructive',
      });
    }
  };

  const callSendWhatsApp = async (phones: string[], message: string) => {
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
          priority: 'urgent',
          data: { message, message_ar: message },
        }),
      }
    );
    const result = await response.json() as { sent?: number; failed?: number; error?: string; sent_via_wasender?: number; skipped?: boolean; reason?: string; failure_details?: Array<{ phone: string; error: string }> };
    if (!response.ok || result.error) throw new Error(result.error || 'Send failed');
    if ((result.sent ?? 0) === 0) {
      // Show the specific WasenderAPI error if available
      const detail = result.failure_details?.[0]?.error;
      const reason = result.reason;
      if (detail) throw new Error(`Delivery failed: ${detail}`);
      if (reason === 'quiet_hours') throw new Error('Quiet hours active (10 PM – 7 AM Khartoum). Use urgent priority to override.');
      if (reason === 'No valid phones') throw new Error('Phone number format not recognised. Try international format: +249XXXXXXXXX');
      throw new Error('Message not delivered — check the phone number and API key');
    }
    return result;
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

  const loadStaffWithPhones = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone')
        .not('phone', 'is', null)
        .neq('phone', '');
      setStaffWithPhones((data ?? []).filter(p => p.phone && p.phone.trim().length > 4));
    } catch { /* non-fatal */ } finally {
      setLoadingStaff(false);
    }
  }, []);

  const sendOptInToAll = async () => {
    if (staffWithPhones.length === 0) return;
    setSendingOptIn(true);
    setOptInResults(null);
    let sent = 0;
    let failed = 0;
    const optInMsg = `👋 Hello from *PACT Command Center*!\n\nTo receive automated WhatsApp notifications (task reminders, approvals, survey invites, and more), please *reply to this message* with *Hi* — that's all it takes!\n\nAfter replying, our system will send you relevant updates directly to this number.\n\n━━━━━━━━━━━━━━━━\n\n👋 مرحباً من *مركز قيادة باكت*!\n\nلاستقبال إشعارات واتساب التلقائية (تذكيرات المهام، الموافقات، دعوات الاستبيانات وأكثر)، يرجى *الرد على هذه الرسالة* بـ *مرحبا* — هذا كل ما تحتاجه!\n\nبعد الرد، سيُرسل لك النظام التحديثات المهمة مباشرة على هذا الرقم.\n\n🔗 PACT: https://app.pactorg.com`;
    for (const staff of staffWithPhones) {
      try {
        await callSendWhatsApp([staff.phone], optInMsg);
        sent++;
      } catch {
        failed++;
      }
      await new Promise(r => setTimeout(r, 800));
    }
    setOptInResults({ sent, failed });
    setSendingOptIn(false);
    toast({
      title: `Opt-in invites sent`,
      description: `${sent} sent, ${failed} failed`,
      variant: failed > 0 && sent === 0 ? 'destructive' : 'default',
    });
    await loadLogs();
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
    if (logFilter === 'outbound') return l.status === 'sent';
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
    { id: 'templates', label: 'Templates', icon: MessageSquare },
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
      <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <span className="font-semibold">How this works: </span>
          All WhatsApp notifications are delivered via <strong>WasenderAPI</strong>. Messages are sent fully bilingual (EN+AR) in a single message.
        </div>
      </div>

      {/* Provider status card — WasenderAPI only */}
      <div data-testid="providers-strip">
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10 p-4" data-testid="card-provider-wasender">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">Active Provider</span>
                <span className="font-bold text-emerald-900 dark:text-emerald-100">WasenderAPI</span>
              </div>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                Number configured in your WasenderAPI dashboard
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                Free-text bilingual EN+AR • Works inside conversations • No template approval needed
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

      {/* Unregistered-users banner (#49) */}
      {noIntegrationCount >= 5 && !bannerDismissed && (
        <div
          data-testid="banner-no-integration"
          className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="flex-1 leading-snug">
            <span className="font-semibold">{noIntegrationCount} staff member{noIntegrationCount !== 1 ? 's' : ''}</span> were skipped in the last 30 days because they haven't connected WhatsApp.
            {' '}Remind them to go to <span className="font-mono text-xs bg-amber-100 dark:bg-amber-800/40 px-1 rounded">Settings → Notifications → WhatsApp</span> to opt in.
          </p>
          <button
            data-testid="button-dismiss-no-integration-banner"
            onClick={() => setBannerDismissed(true)}
            className="shrink-0 text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 p-0.5 rounded"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

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
                          {safeFormat(conv.lastMessage.created_at, 'd MMM, HH:mm')}
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
                            {safeFormat(msg.created_at, 'HH:mm · d MMM')}
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
                { key: 'all',      label: 'All',     count: logs.length },
                { key: 'outbound', label: 'Sent',    count: logs.filter(l => l.status === 'sent').length },
                { key: 'inbound',  label: 'Replies', count: logs.filter(l => l.direction === 'inbound').length },
                { key: 'failed',   label: 'Failed',  count: logs.filter(l => l.status === 'failed').length },
                { key: 'skipped',  label: 'Skipped', count: logs.filter(l => l.status === 'skipped').length },
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
                    f.key === 'failed'  && logFilter !== f.key && f.count > 0 && 'border-red-300 text-red-700',
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
                        <div className="flex flex-col min-w-0 shrink-0">
                          {userNames[log.user_id ?? '']?.name && (
                            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-tight">{userNames[log.user_id ?? '']?.name}</span>
                          )}
                          <span className="text-xs font-mono text-muted-foreground leading-tight">{log.phone === 'unknown' ? '—' : log.phone}</span>
                        </div>
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
                          {safeFormat(log.created_at, 'd MMM, HH:mm')}
                        </span>
                        {expandedLog === log.id ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                    </button>
                    {expandedLog === log.id && (
                      <div className="border-t bg-muted/30 p-3 space-y-2 text-xs">
                        <div className="grid grid-cols-2 gap-2">
                          {userNames[log.user_id ?? '']?.name && (
                            <div className="col-span-2 flex items-center gap-1.5 flex-wrap">
                              <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">Name:</span>
                              <span className="font-semibold">{userNames[log.user_id ?? '']?.name}</span>
                              {userNames[log.user_id ?? '']?.email && (
                                <span className="text-muted-foreground font-mono">({userNames[log.user_id ?? '']?.email})</span>
                              )}
                            </div>
                          )}
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
                          <div className="col-span-2"><span className="text-muted-foreground">Time:</span> {safeFormat(log.created_at, 'd MMM yyyy, HH:mm:ss')}</div>
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
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Sending via <strong>WasenderAPI</strong> — bilingual EN+AR message delivered to recipient.
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

      {/* ── OPT-IN BROADCAST ── */}
      {activeTab === 'send' && (
        <Card data-testid="card-optin-broadcast">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                <MessageSquare className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle className="text-base">Send Opt-in Invite to All Staff</CardTitle>
                <CardDescription>
                  Sends a WhatsApp message to every staff member with a phone number, asking them to reply once to activate notifications.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                WhatsApp delivers messages from new numbers only when the recipient has chatted with PACT's number before.
                This invite message asks staff to <strong>reply with "Hi"</strong> to activate future notifications.
                Once they reply, all automated notifications will reach them automatically.
              </span>
            </div>

            {loadingStaff && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4 animate-spin" /> Loading staff list…
              </div>
            )}

            {staffWithPhones.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{staffWithPhones.length} staff with phone numbers</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadStaffWithPhones}
                    disabled={loadingStaff}
                    className="gap-1.5 text-xs"
                    data-testid="button-reload-staff"
                  >
                    <RefreshCw className={cn('h-3 w-3', loadingStaff && 'animate-spin')} /> Refresh
                  </Button>
                </div>

                <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
                  {staffWithPhones.map(s => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{s.phone}</p>
                      </div>
                      <a
                        href={`https://wa.me/${s.phone.replace(/[^0-9]/g, '')}?text=Hi%20PACT`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-green-600 hover:underline flex items-center gap-0.5 shrink-0"
                        data-testid={`link-chat-${s.id}`}
                      >
                        Open chat <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                  ))}
                </div>

                {optInResults && (
                  <div className={cn(
                    'flex items-center gap-2 p-3 rounded-lg text-sm',
                    optInResults.failed === 0
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200 border border-green-200'
                      : 'bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 border border-amber-200'
                  )}>
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      <strong>{optInResults.sent}</strong> invites sent successfully
                      {optInResults.failed > 0 && <>, <strong>{optInResults.failed}</strong> failed</>}.
                    </span>
                  </div>
                )}

                <Button
                  onClick={sendOptInToAll}
                  disabled={sendingOptIn}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white w-full"
                  data-testid="button-send-optin-all"
                >
                  {sendingOptIn
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Sending to all staff…</>
                    : <><Send className="h-4 w-4" /> Send Opt-in Invite to All {staffWithPhones.length} Staff</>
                  }
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── TEMPLATES TAB ── */}
      {activeTab === 'templates' && (
        <div className="space-y-4" data-testid="templates-tab">
          {/* Explainer */}
          <div className="rounded-xl border-2 border-dashed border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900 dark:text-amber-100 space-y-2">
                <p>
                  <strong>WasenderAPI doesn't use registered templates.</strong> Every message is composed in our code and sent as a normal WhatsApp message — no Meta-style approval is needed. The Wasender dashboard's "Templates" feature is for their own canned-replies tool and isn't used by PACT.
                </p>
                <p>
                  <strong>Meta Cloud API does require approval.</strong> The 5 templates below are registered in your Meta Business Manager and reused for 60+ event types. The same content shape is used for both providers, so the messages your staff receive look consistent.
                </p>
              </div>
            </div>
          </div>

          {/* Template cards */}
          <div className="space-y-4">
            {TEMPLATE_PREVIEWS.map(tpl => {
              const colorClasses = {
                blue: 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10',
                amber: 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10',
                emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10',
                red: 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10',
                purple: 'border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10',
              }[tpl.color] || '';
              const badgeClasses = {
                blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40',
                amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',
                emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40',
                red: 'bg-red-100 text-red-700 dark:bg-red-900/40',
                purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40',
              }[tpl.color] || '';
              return (
                <Card key={tpl.id} className={cn('border-2', colorClasses)} data-testid={`template-card-${tpl.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-3xl shrink-0">{tpl.icon}</span>
                        <div className="min-w-0">
                          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                            {tpl.title}
                            <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">{tpl.id}</code>
                          </CardTitle>
                          <CardDescription className="mt-1">{tpl.description}</CardDescription>
                        </div>
                      </div>
                      <Badge variant="secondary" className={cn('shrink-0', badgeClasses)} data-testid={`template-event-count-${tpl.id}`}>
                        {tpl.eventCount} events
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Sample event types */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Used by events</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tpl.sampleEvents.map(ev => (
                          <code key={ev} className="text-[11px] font-mono bg-muted px-2 py-0.5 rounded border">{ev}</code>
                        ))}
                        {tpl.eventCount > tpl.sampleEvents.length && (
                          <span className="text-[11px] text-muted-foreground italic px-1">+ {tpl.eventCount - tpl.sampleEvents.length} more</span>
                        )}
                      </div>
                    </div>

                    {/* Live previews EN + AR */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">What recipients see</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* English bubble */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">English</p>
                          <div className="rounded-lg bg-[#005c4b] text-white p-3 text-xs whitespace-pre-wrap break-words font-sans leading-relaxed shadow" dir="ltr" data-testid={`template-preview-en-${tpl.id}`}>
                            {tpl.en}{FOOTER}
                          </div>
                        </div>
                        {/* Arabic bubble */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">العربية</p>
                          <div className="rounded-lg bg-[#005c4b] text-white p-3 text-xs whitespace-pre-wrap break-words font-sans leading-relaxed shadow" dir="rtl" data-testid={`template-preview-ar-${tpl.id}`}>
                            {tpl.ar}{FOOTER}
                          </div>
                        </div>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-2 italic">
                        Note: When sent via Wasender, both EN and AR appear in one message separated by a divider. When sent via Meta, the recipient gets only their preferred language (cleaner native experience).
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── SETTINGS TAB ── */}
      {activeTab === 'settings' && (
        <div className="space-y-4">

          {/* ── Quick Activation Guide ── */}
          <Card data-testid="card-activation-guide" className="border-emerald-200 dark:border-emerald-800">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <Info className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Quick Activation Guide</CardTitle>
                  <CardDescription>Follow these steps once to get WhatsApp notifications working end-to-end</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">

                {/* Step 1 */}
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center mt-0.5">1</span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Set the WasenderAPI key in Supabase secrets</p>
                    <p className="text-xs text-muted-foreground">
                      Go to <strong>Supabase dashboard → Edge Functions → Secrets</strong> and add:
                    </p>
                    <div className="rounded-md bg-muted/60 border px-3 py-2 font-mono text-xs space-y-1 mt-1">
                      <p><span className="text-emerald-600 dark:text-emerald-400">WASENDER_API_KEY</span> = your WasenderAPI key (get it from <span className="underline">wasenderapi.com</span>)</p>
                      <p className="text-muted-foreground"># Optional — secures inbound replies:</p>
                      <p><span className="text-muted-foreground">WASENDER_WEBHOOK_SECRET</span> = any strong random string</p>
                    </div>
                  </div>
                </li>

                {/* Step 2 */}
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center mt-0.5">2</span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Deploy (or re-deploy) the two WhatsApp edge functions</p>
                    <p className="text-xs text-muted-foreground">Run these two commands from the project root in your terminal:</p>
                    <div className="rounded-md bg-muted/60 border px-3 py-2 font-mono text-xs space-y-1 mt-1">
                      <p>supabase functions deploy send-whatsapp --project-ref abznugnirnlrqnnfkein</p>
                      <p>supabase functions deploy whatsapp-webhook --project-ref abznugnirnlrqnnfkein</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      If you don't have the Supabase CLI, install it first:{' '}
                      <code className="bg-muted px-1 rounded">npm install -g supabase</code>{' '}
                      then run <code className="bg-muted px-1 rounded">supabase login</code>
                    </p>
                  </div>
                </li>

                {/* Step 3 */}
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center mt-0.5">3</span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Run the WhatsApp database migration</p>
                    <p className="text-xs text-muted-foreground">
                      Open the Supabase SQL Editor and run{' '}
                      <code className="bg-muted px-1 rounded">supabase/migrations/20260416_whatsapp_integration.sql</code>{' '}
                      followed by{' '}
                      <code className="bg-muted px-1 rounded">supabase/migrations/20260416_whatsapp_logs_broadcast_id.sql</code>.
                      These create the <code className="bg-muted px-1 rounded">whatsapp_logs</code> and{' '}
                      <code className="bg-muted px-1 rounded">user_integrations</code> tables if they don't exist yet.
                    </p>
                  </div>
                </li>

                {/* Step 4 */}
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center mt-0.5">4</span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Verify — click Check Connection below</p>
                    <p className="text-xs text-muted-foreground">
                      A green "Connected" badge confirms the API key is live in the edge function.
                      If you still see an error, double-check the key value in Supabase secrets and redeploy.
                    </p>
                  </div>
                </li>

                {/* Step 5 */}
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center justify-center mt-0.5">5</span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Enable WhatsApp for each user (per-user opt-in)</p>
                    <p className="text-xs text-muted-foreground">
                      Each staff member goes to <strong>My Profile → Notification Settings → WhatsApp</strong>,
                      enters their number, and turns on the categories they want (Tasks, Approvals, etc.).
                      Alternatively, you can enable it for them directly in the database{' '}
                      (<code className="bg-muted px-1 rounded">user_integrations.whatsapp_enabled = true</code>).
                    </p>
                  </div>
                </li>

                {/* Step 6 — Webhook optional */}
                <li className="flex gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 text-xs font-bold flex items-center justify-center mt-0.5">6</span>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-muted-foreground">Optional — configure inbound webhook for replies</p>
                    <p className="text-xs text-muted-foreground">
                      In your WasenderAPI dashboard, set the webhook URL to the address shown in the Inbound Webhook card below.
                      This allows staff replies to appear in the Inbox tab.
                    </p>
                  </div>
                </li>

              </ol>
            </CardContent>
          </Card>

          {/* WasenderAPI Connection Check */}
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
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded">Primary (free-text)</span>
                    </CardTitle>
                    <CardDescription>Bilingual EN+AR messages — active whenever WASENDER_API_KEY is set</CardDescription>
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
            <CardContent className="space-y-3">
              {connectionStatus === 'error' && connectionError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-800 dark:text-red-200">
                  {connectionError.keyMissing ? (
                    <>
                      <p className="font-semibold mb-1">⚠ WASENDER_API_KEY not configured</p>
                      <p>Set <code className="font-mono bg-red-100 dark:bg-red-900/50 px-1 rounded">WASENDER_API_KEY</code> in Supabase → Edge Functions → Secrets, then redeploy <code className="bg-red-100 dark:bg-red-900/50 px-1 rounded font-mono">send-whatsapp</code>.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold mb-1">⚠ WasenderAPI returned an error</p>
                      <p className="text-xs font-mono break-all mt-1 opacity-80">{connectionError.detail}</p>
                      <p className="mt-1">Check your API key in <a href="https://wasenderapi.com" target="_blank" rel="noopener noreferrer" className="underline">wasenderapi.com</a> → Credentials tab.</p>
                    </>
                  )}
                </div>
              )}
              {connectionStatus === 'connected' && (
                <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm text-green-800 dark:text-green-200">
                  <p className="font-semibold">✓ API key confirmed — WhatsApp notifications are active</p>
                  <p className="mt-0.5 text-xs">Messages will fire automatically for tasks, approvals, payroll, MMP events, and more.</p>
                </div>
              )}
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

          {/* Inbound Webhook */}
          <Card data-testid="card-webhook">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                  <Webhook className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Inbound Webhook URL</CardTitle>
                  <CardDescription>Paste this into WasenderAPI dashboard to receive replies from staff</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  'Automatically matches sender phone to their PACT staff profile',
                  'Logs all inbound messages — visible in the Inbox and Delivery Logs tabs',
                  'Secured via WASENDER_WEBHOOK_SECRET (set in Supabase Edge Function secrets)',
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
