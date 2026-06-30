import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  Bell, Mail, MessageSquare, CheckCircle, XCircle, RefreshCw, Clock,
  Zap, Send, Users, Filter, ChevronDown, ChevronUp, Database,
  AlertTriangle, FileDown, Wifi, WifiOff, Target, RotateCcw, Trash2,
  Info, Shield, Eye
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type TabId = 'alerts' | 'subscriptions' | 'log';

// ── Field Data event catalogue ─────────────────────────────────────────────────
interface FDEvent {
  type: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  color: string;
  channels: { inApp: boolean; email: boolean; whatsapp: boolean };
  audienceNote?: string;
}

const FD_EVENTS: FDEvent[] = [
  {
    type: 'fd_new_submission',
    label: 'New Submission',
    desc: 'A new data submission arrives for a form you manage.',
    icon: CheckCircle,
    color: 'text-green-600',
    channels: { inApp: true, email: true, whatsapp: true },
  },
  {
    type: 'fd_submission_rejected',
    label: 'Submission Rejected',
    desc: 'A submission has been rejected and needs correction by the enumerator.',
    icon: XCircle,
    color: 'text-red-600',
    channels: { inApp: true, email: true, whatsapp: true },
    audienceNote: 'WhatsApp sent directly to the submitting enumerator.',
  },
  {
    type: 'fd_quality_alert',
    label: 'Data Quality Alert',
    desc: 'Quality checks flag anomalies or threshold breaches in submitted data.',
    icon: AlertTriangle,
    color: 'text-amber-600',
    channels: { inApp: true, email: true, whatsapp: true },
  },
  {
    type: 'fd_target_reached',
    label: 'Target Reached',
    desc: 'A form or study round has hit its submission target.',
    icon: Target,
    color: 'text-blue-600',
    channels: { inApp: true, email: true, whatsapp: true },
  },
  {
    type: 'fd_sync_failed',
    label: 'Sync Failed',
    desc: 'A scheduled sync with an external server (ODK Central, Ona, MoDa) failed.',
    icon: WifiOff,
    color: 'text-red-500',
    channels: { inApp: true, email: true, whatsapp: false },
  },
  {
    type: 'fd_export_ready',
    label: 'Export Ready',
    desc: 'A data export you requested is ready for download.',
    icon: FileDown,
    color: 'text-teal-600',
    channels: { inApp: true, email: true, whatsapp: false },
  },
  {
    type: 'fd_case_visit_due',
    label: 'Case Visit Due',
    desc: 'An upcoming case visit is approaching its due date.',
    icon: Clock,
    color: 'text-purple-600',
    channels: { inApp: true, email: false, whatsapp: true },
    audienceNote: 'WhatsApp sent directly to the assigned enumerator.',
  },
  {
    type: 'fd_study_round_deadline',
    label: 'Study Round Deadline',
    desc: 'A study round deadline is approaching (48 h and 24 h warnings).',
    icon: Zap,
    color: 'text-orange-600',
    channels: { inApp: true, email: true, whatsapp: true },
  },
  {
    type: 'fd_server_connection_lost',
    label: 'Server Connection Lost',
    desc: 'PACT cannot reach a configured external data server (ODK/Ona/MoDa).',
    icon: WifiOff,
    color: 'text-destructive',
    channels: { inApp: true, email: true, whatsapp: false },
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts: string) {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: My Alerts
// ─────────────────────────────────────────────────────────────────────────────
interface Prefs {
  [eventType: string]: { in_app: boolean; email: boolean; whatsapp: boolean };
}

function buildDefaultPrefs(): Prefs {
  return Object.fromEntries(
    FD_EVENTS.map(e => [e.type, {
      in_app:   e.channels.inApp,
      email:    e.channels.email,
      whatsapp: e.channels.whatsapp,
    }])
  );
}

function MyAlertsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testingType, setTestingType] = useState<string | null>(null);

  const { data: prefs, isLoading } = useQuery<Prefs>({
    queryKey: ['fd-notif-prefs', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('fd_notification_prefs')
        .select('event_type, in_app, email, whatsapp')
        .eq('user_id', user?.id ?? '');
      const defaults = buildDefaultPrefs();
      for (const row of (data ?? [])) {
        defaults[row.event_type] = {
          in_app:   row.in_app,
          email:    row.email,
          whatsapp: row.whatsapp,
        };
      }
      return defaults;
    },
    enabled: !!user?.id,
  });

  const updatePref = useMutation({
    mutationFn: async ({
      eventType, channel, value,
    }: { eventType: string; channel: 'in_app' | 'email' | 'whatsapp'; value: boolean }) => {
      const current = prefs?.[eventType] ?? buildDefaultPrefs()[eventType];
      const patch = { ...current, [channel]: value };
      const { error } = await supabase.from('fd_notification_prefs').upsert({
        user_id:    user?.id,
        event_type: eventType,
        in_app:     patch.in_app,
        email:      patch.email,
        whatsapp:   patch.whatsapp,
      }, { onConflict: 'user_id,event_type' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-notif-prefs', user?.id] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const sendTest = async (eventType: string) => {
    setTestingType(eventType);
    try {
      const ev = FD_EVENTS.find(e => e.type === eventType);
      const { error } = await supabase.from('notifications').insert({
        recipient_id: user?.id,
        title_en: `[Test] ${ev?.label}`,
        title_ar: `[اختبار] ${ev?.label}`,
        message_en: `This is a test notification for: ${ev?.desc}`,
        message_ar: `هذا إشعار اختبار لـ: ${ev?.desc}`,
        event_type: eventType,
        action_url: '/field-data/notifications',
        priority: 'normal',
        status: 'unread',
        is_read: false,
      });
      if (error) throw error;
      toast({ title: 'Test notification sent', description: 'Check your notification bell.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setTestingType(null);
    }
  };

  const channelDefs: { key: 'in_app' | 'email' | 'whatsapp'; label: string; icon: React.ElementType }[] = [
    { key: 'in_app',   label: 'In-App', icon: Bell },
    { key: 'email',    label: 'Email',  icon: Mail },
    { key: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Channel legend */}
      <div className="flex flex-wrap gap-3">
        {channelDefs.map(c => (
          <div key={c.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <c.icon className="h-3.5 w-3.5" /> {c.label}
          </div>
        ))}
        <div className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
          <Info className="h-3.5 w-3.5" /> Changes save instantly.
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 justify-center py-10 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading preferences…
        </div>
      )}

      {!isLoading && prefs && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left" colSpan={2}>Event</th>
                <th className="p-3 text-center">
                  <Bell className="h-4 w-4 mx-auto text-muted-foreground" />
                </th>
                <th className="p-3 text-center">
                  <Mail className="h-4 w-4 mx-auto text-muted-foreground" />
                </th>
                <th className="p-3 text-center">
                  <MessageSquare className="h-4 w-4 mx-auto text-muted-foreground" />
                </th>
                <th className="p-3 text-left hidden md:table-cell">Note</th>
                <th className="p-3 text-left">Test</th>
              </tr>
            </thead>
            <tbody>
              {FD_EVENTS.map((ev, i) => {
                const p = prefs[ev.type] ?? buildDefaultPrefs()[ev.type];
                const E = ev.icon;
                return (
                  <tr key={ev.type}
                    className={cn('border-b last:border-0', i % 2 === 0 && 'bg-background', 'hover:bg-muted/20')}
                    data-testid={`alert-row-${ev.type}`}>
                    <td className="p-3 w-8">
                      <E className={cn('h-4 w-4', ev.color)} />
                    </td>
                    <td className="p-3">
                      <p className="font-medium">{ev.label}</p>
                      <p className="text-xs text-muted-foreground hidden sm:block">{ev.desc}</p>
                    </td>
                    <td className="p-3 text-center">
                      <Switch
                        checked={p.in_app}
                        onCheckedChange={v => updatePref.mutate({ eventType: ev.type, channel: 'in_app', value: v })}
                        data-testid={`switch-inapp-${ev.type}`}
                      />
                    </td>
                    <td className="p-3 text-center">
                      <Switch
                        checked={p.email}
                        onCheckedChange={v => updatePref.mutate({ eventType: ev.type, channel: 'email', value: v })}
                        data-testid={`switch-email-${ev.type}`}
                      />
                    </td>
                    <td className="p-3 text-center">
                      {ev.channels.whatsapp ? (
                        <Switch
                          checked={p.whatsapp}
                          onCheckedChange={v => updatePref.mutate({ eventType: ev.type, channel: 'whatsapp', value: v })}
                          data-testid={`switch-whatsapp-${ev.type}`}
                        />
                      ) : (
                        <span className="text-xs text-muted-foreground opacity-40">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">
                      {ev.audienceNote ?? ''}
                    </td>
                    <td className="p-3">
                      <Button variant="ghost" size="sm"
                        disabled={testingType === ev.type}
                        onClick={() => sendTest(ev.type)}
                        data-testid={`btn-test-${ev.type}`}
                        className="text-xs">
                        {testingType === ev.type
                          ? <RefreshCw className="h-3 w-3 animate-spin" />
                          : <Send className="h-3 w-3" />}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Form Subscriptions
// ─────────────────────────────────────────────────────────────────────────────
function SubscriptionsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [selFormId, setSelFormId] = useState('');
  const [selEvents, setSelEvents] = useState<string[]>(['fd_new_submission']);
  const [subFilter, setSubFilter] = useState('');

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-api'],
    queryFn: async () => {
      const { data } = await supabase.from('fd_forms').select('id, name').order('name');
      return data ?? [];
    },
  });

  const { data: subs = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-form-subscriptions'],
    queryFn: async () => {
      const { data } = await supabase
        .from('fd_form_subscriptions')
        .select('id, form_id, user_id, event_types, created_at')
        .order('created_at', { ascending: false });
      return data ?? [];
    },
  });

  const addSub = useMutation({
    mutationFn: async () => {
      if (!selFormId) throw new Error('Select a form');
      if (!selEvents.length) throw new Error('Select at least one event type');
      const { error } = await supabase.from('fd_form_subscriptions').upsert({
        form_id:     selFormId,
        user_id:     user?.id,
        event_types: selEvents,
      }, { onConflict: 'form_id,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-form-subscriptions'] });
      setShowAdd(false);
      setSelFormId('');
      setSelEvents(['fd_new_submission']);
      toast({ title: 'Subscription saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const removeSub = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fd_form_subscriptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-form-subscriptions'] });
      toast({ title: 'Subscription removed' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleEvent = (type: string) => {
    setSelEvents(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const filtered = subs.filter(s => !subFilter || s.form_id === subFilter);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={subFilter} onValueChange={setSubFilter}>
          <SelectTrigger className="w-52" data-testid="sub-filter-form">
            <SelectValue placeholder="Filter by form…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All forms</SelectItem>
            {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowAdd(true)} data-testid="btn-add-subscription">
          + Subscribe to Form
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
          <Bell className="h-10 w-10 opacity-25" />
          <p className="text-sm">No form subscriptions yet.</p>
          <p className="text-xs">Subscribe to a form to receive event notifications for it.</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left">Form</th>
                <th className="p-3 text-left">Subscribed events</th>
                <th className="p-3 text-left">Since</th>
                <th className="p-3 text-left"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => (
                <tr key={s.id}
                  className={cn('border-b last:border-0 hover:bg-muted/20', i % 2 === 0 && 'bg-background')}
                  data-testid={`sub-row-${s.id}`}>
                  <td className="p-3 font-medium">
                    {forms.find(f => f.id === s.form_id)?.name ?? s.form_id.slice(0, 8) + '…'}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(s.event_types as string[]).map(t => {
                        const ev = FD_EVENTS.find(e => e.type === t);
                        return (
                          <Badge key={t} variant="outline" className="text-xs">
                            {ev?.label ?? t}
                          </Badge>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{ago(s.created_at)}</td>
                  <td className="p-3">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => removeSub.mutate(s.id)}
                      data-testid={`btn-remove-sub-${s.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add subscription dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" /> Subscribe to Form
            </DialogTitle>
            <DialogDescription>
              Choose a form and which events to notify you about. Uses your channel settings from My Alerts.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label>Form</Label>
              <Select value={selFormId} onValueChange={setSelFormId}>
                <SelectTrigger data-testid="sub-select-form">
                  <SelectValue placeholder="Select form…" />
                </SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Events to notify</Label>
              <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto">
                {FD_EVENTS.map(ev => {
                  const E = ev.icon;
                  return (
                    <label key={ev.type}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                        selEvents.includes(ev.type) ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                      )}
                      data-testid={`sub-event-${ev.type}`}>
                      <input type="checkbox" className="hidden"
                        checked={selEvents.includes(ev.type)}
                        onChange={() => toggleEvent(ev.type)} />
                      <E className={cn('h-4 w-4 flex-shrink-0', ev.color)} />
                      <span className="text-sm">{ev.label}</span>
                      {selEvents.includes(ev.type) && <CheckCircle className="h-4 w-4 text-primary ml-auto" />}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button disabled={!selFormId || !selEvents.length || addSub.isPending}
              onClick={() => addSub.mutate()}
              data-testid="btn-confirm-subscription">
              {addSub.isPending ? 'Saving…' : 'Subscribe'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: Event Log
// ─────────────────────────────────────────────────────────────────────────────
function EventLogTab() {
  const [filterType, setFilterType]     = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [dateRange, setDateRange]       = useState('7');

  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-notif-log', filterType, filterStatus, dateRange],
    queryFn: async () => {
      const since = new Date(Date.now() - parseInt(dateRange, 10) * 86400000).toISOString();
      let q = supabase
        .from('fd_notification_log')
        .select('id, event_type, form_id, recipient_count, channels, status, error_message, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (filterType)   q = q.eq('event_type', filterType);
      if (filterStatus) q = q.eq('status', filterStatus);
      const { data } = await q;
      return data ?? [];
    },
  });

  const totalFired = logs.length;
  const delivered  = logs.filter(l => l.status === 'delivered').length;
  const failed     = logs.filter(l => l.status === 'failed').length;
  const recipients = logs.reduce((s: number, l: any) => s + (l.recipient_count ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Events Fired',  value: totalFired, icon: Zap,         color: 'text-blue-600' },
          { label: 'Delivered',     value: delivered,  icon: CheckCircle,  color: 'text-green-600' },
          { label: 'Failed',        value: failed,     icon: XCircle,      color: 'text-red-600' },
          { label: 'Recipients',    value: recipients, icon: Users,        color: 'text-purple-600' },
        ].map(kv => (
          <div key={kv.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
            <kv.icon className={cn('h-5 w-5 flex-shrink-0', kv.color)} />
            <div>
              <p className="text-2xl font-bold">{kv.value}</p>
              <p className="text-xs text-muted-foreground">{kv.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-36" data-testid="log-filter-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Last 24h</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-52" data-testid="log-filter-type">
            <SelectValue placeholder="All event types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All event types</SelectItem>
            {FD_EVENTS.map(e => <SelectItem key={e.type} value={e.type}>{e.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="log-filter-status">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All status</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 justify-center py-8 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      )}
      {!isLoading && logs.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No notification events in this period.
        </div>
      )}

      {logs.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left">Time</th>
                <th className="p-3 text-left">Event</th>
                <th className="p-3 text-left">Channels</th>
                <th className="p-3 text-left">Recipients</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Error</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => {
                const ev = FD_EVENTS.find(e => e.type === l.event_type);
                const E  = ev?.icon ?? Zap;
                return (
                  <tr key={l.id}
                    className={cn('border-b last:border-0 hover:bg-muted/20', i % 2 === 0 && 'bg-background')}
                    data-testid={`log-row-${l.id}`}>
                    <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">{ago(l.created_at)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <E className={cn('h-4 w-4 flex-shrink-0', ev?.color ?? 'text-muted-foreground')} />
                        <span>{ev?.label ?? l.event_type}</span>
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 flex-wrap">
                        {((l.channels ?? []) as string[]).map(ch => (
                          <Badge key={ch} variant="outline" className="text-xs capitalize">{ch}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{l.recipient_count ?? 0}</td>
                    <td className="p-3">
                      <Badge className={cn('text-xs',
                        l.status === 'delivered' ? 'bg-green-100 text-green-800 border-green-200' :
                        l.status === 'partial'   ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                                   'bg-red-100 text-red-800 border-red-200')}>
                        {l.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground max-w-[160px] truncate"
                      title={l.error_message ?? ''}>
                      {l.error_message ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {logs.length >= 200 && (
            <div className="p-3 text-center text-xs text-muted-foreground border-t">
              Showing most recent 200 records. Narrow the date range for older entries.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function FieldDataNotifications() {
  const [tab, setTab] = useState<TabId>('alerts');

  const TABS: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'alerts',        label: 'My Alerts',          icon: Bell,       desc: 'Configure which channels fire for each event' },
    { id: 'subscriptions', label: 'Form Subscriptions', icon: Database,   desc: 'Choose which forms trigger notifications' },
    { id: 'log',           label: 'Event Log',           icon: Eye,        desc: 'History of notification events and delivery status' },
  ];

  const ActiveTab = tab === 'alerts' ? MyAlertsTab : tab === 'subscriptions' ? SubscriptionsTab : EventLogTab;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" />
          Field Data Notifications
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Configure in-app, email, and WhatsApp alerts for field data events across all 9 event types.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              'text-left rounded-xl border p-4 flex items-start gap-3 transition-all',
              tab === t.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
            )}
            data-testid={`tab-card-${t.id}`}>
            <div className={cn('rounded-lg p-2 flex-shrink-0',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <t.icon className="h-5 w-5" />
            </div>
            <div>
              <p className={cn('font-semibold text-sm', tab === t.id && 'text-primary')}>{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card p-5">
        <ActiveTab />
      </div>
    </div>
  );
}
