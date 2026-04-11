import { type FC, useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Bell, CheckCheck, Trash2, Link as LinkIcon, Calendar, DollarSign, MapPin,
  Users, AlertCircle, CheckCircle, Info, MessageSquare, FileText, Clock,
  Search, Phone, PhoneMissed, Zap, Megaphone, RefreshCw, ThumbsUp, ThumbsDown,
  ArrowRight, Star, ChevronRight, Loader2, BarChart3, CircleDot,
  AlertTriangle, CheckCircle2, X, ExternalLink, Sparkles, Radio
} from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek, parseISO, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types';

// ── Category definitions ──────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',        label: 'All',        icon: Bell,         color: 'text-slate-500' },
  { id: 'urgent',     label: 'Urgent',     icon: AlertCircle,  color: 'text-red-500' },
  { id: 'approvals',  label: 'Approvals',  icon: CheckCircle,  color: 'text-green-500' },
  { id: 'assignments',label: 'Assignments',icon: MapPin,        color: 'text-cyan-500' },
  { id: 'financial',  label: 'Financial',  icon: DollarSign,   color: 'text-emerald-500' },
  { id: 'broadcast',  label: 'Broadcasts', icon: Megaphone,    color: 'text-amber-500' },
  { id: 'system',     label: 'System',     icon: RefreshCw,    color: 'text-slate-500' },
  { id: 'messages',   label: 'Messages',   icon: MessageSquare,color: 'text-blue-500' },
  { id: 'calls',      label: 'Calls',      icon: Phone,        color: 'text-purple-500' },
  { id: 'account',    label: 'Account',    icon: Users,        color: 'text-orange-500' },
];

// ── Which notifications need action buttons ────────────────────────────────────
const ACTION_EVENT_TYPES = new Set([
  'cost_submitted', 'approval_required', 'leave_request_submitted',
  'withdrawal_requested', 'signature_requested', 'mmp_forwarded',
  'payroll_approval_needed', 'site_assigned', 'site_visit_assigned',
  'task_assigned', 'mmp_assigned',
]);

const APPROVE_REJECT_TYPES = new Set([
  'cost_submitted', 'approval_required', 'leave_request_submitted',
  'withdrawal_requested', 'payroll_approval_needed',
]);

function needsAction(n: Notification): boolean {
  const cat = (n.category || '').toLowerCase();
  const evType = (n as any).eventType || cat;
  return (
    (cat === 'approvals' && !n.isRead) ||
    ACTION_EVENT_TYPES.has(evType) ||
    ACTION_EVENT_TYPES.has(cat)
  );
}

function canApproveReject(n: Notification): boolean {
  const cat = (n.category || '').toLowerCase();
  const evType = (n as any).eventType || cat;
  return (cat === 'approvals' && !n.isRead) || APPROVE_REJECT_TYPES.has(evType) || APPROVE_REJECT_TYPES.has(cat);
}

// ── Inline action handler ──────────────────────────────────────────────────────
async function performApprovalAction(
  n: Notification,
  action: 'approved' | 'rejected',
): Promise<{ success: boolean; message: string }> {
  const entityType = (n as any).relatedEntityType || (n as any).entity_type || '';
  const entityId   = n.relatedEntityId || (n as any).entity_id || '';
  if (!entityId) return { success: false, message: 'Entity ID not found' };

  const tableMap: Record<string, string> = {
    costSubmission:     'operational_costs',
    downPayment:        'down_payments',
    withdrawal:         'withdrawal_requests',
    leaveRequest:       'leave_requests',
    leave_request:      'leave_requests',
    mmpFile:            'mmp_files',
    payrollRun:         'payroll_runs',
  };
  const table = tableMap[entityType];
  if (!table) return { success: false, message: 'Navigate to action page to approve' };

  const { error } = await supabase
    .from(table as any)
    .update({ status: action, updated_at: new Date().toISOString() })
    .eq('id', entityId);

  if (error) return { success: false, message: error.message };
  return { success: true, message: `Successfully ${action}` };
}

// ── Icon + color helpers ───────────────────────────────────────────────────────
function getNotificationIcon(n: Notification) {
  const t = (n.title || '').toLowerCase();
  const cat = (n.category || '').toLowerCase();
  if (cat === 'financial' || t.includes('payment') || t.includes('cost') || t.includes('budget')) return <DollarSign className="h-4 w-4" />;
  if (cat === 'assignments' || t.includes('visit') || t.includes('site') || t.includes('assigned')) return <MapPin className="h-4 w-4" />;
  if (cat === 'approvals' || t.includes('approved') || t.includes('approval')) return <CheckCircle className="h-4 w-4" />;
  if (cat === 'messages' || t.includes('message') || t.includes('chat')) return <MessageSquare className="h-4 w-4" />;
  if (cat === 'calls' || t.includes('call') || t.includes('missed')) return <Phone className="h-4 w-4" />;
  if (cat === 'broadcast' || t.includes('broadcast') || t.includes('announcement')) return <Megaphone className="h-4 w-4" />;
  if (t.includes('document') || t.includes('file') || t.includes('report') || t.includes('mmp')) return <FileText className="h-4 w-4" />;
  if (t.includes('schedule') || t.includes('reminder') || t.includes('deadline')) return <Calendar className="h-4 w-4" />;
  if (t.includes('urgent') || t.includes('alert') || t.includes('warning') || t.includes('error')) return <AlertCircle className="h-4 w-4" />;
  if (n.type === 'success' || t.includes('success') || t.includes('complete')) return <CheckCircle2 className="h-4 w-4" />;
  if (n.priority === 'urgent') return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

function getIconBg(n: Notification) {
  const t = (n.title || '').toLowerCase();
  const cat = (n.category || '').toLowerCase();
  if (n.priority === 'urgent' || t.includes('urgent') || t.includes('error') || t.includes('rejected') || t.includes('missed')) return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
  if (n.type === 'success' || t.includes('approved') || t.includes('success') || t.includes('complete')) return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (n.priority === 'high' || t.includes('warning') || t.includes('pending')) return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
  if (cat === 'financial' || t.includes('payment') || t.includes('wallet')) return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (cat === 'approvals') return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
  if (cat === 'assignments') return 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400';
  if (cat === 'broadcast') return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
  if (cat === 'calls') return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
  return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
}

function getPriorityBadge(priority?: string) {
  switch (priority) {
    case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
    case 'high':   return 'bg-amber-100 text-amber-700 border-amber-200';
    default:       return null;
  }
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return formatDistanceToNow(d, { addSuffix: true });
    if (isYesterday(d)) return `Yesterday ${format(d, 'h:mm a')}`;
    if (isThisWeek(d)) return format(d, 'EEE h:mm a');
    return format(d, 'MMM d, yyyy');
  } catch { return iso; }
}

function groupByDate(list: Notification[]) {
  const groups: Record<string, Notification[]> = { Today: [], Yesterday: [], 'This Week': [], Earlier: [] };
  for (const n of list) {
    if (!n.createdAt) { groups.Earlier.push(n); continue; }
    try {
      const d = parseISO(n.createdAt);
      if (isToday(d)) groups.Today.push(n);
      else if (isYesterday(d)) groups.Yesterday.push(n);
      else if (isThisWeek(d)) groups['This Week'].push(n);
      else groups.Earlier.push(n);
    } catch { groups.Earlier.push(n); }
  }
  return groups;
}

// ── Bundle similar notifications ──────────────────────────────────────────────
interface Bundle { key: string; notifications: Notification[]; representative: Notification }
function bundleNotifications(list: Notification[]): (Notification | Bundle)[] {
  const bundles = new Map<string, Notification[]>();
  for (const n of list) {
    const key = `${n.category || 'system'}::${(n.title || '').split(':')[0].trim()}`;
    if (!bundles.has(key)) bundles.set(key, []);
    bundles.get(key)!.push(n);
  }
  const result: (Notification | Bundle)[] = [];
  for (const [key, items] of bundles) {
    if (items.length >= 3) {
      result.push({ key, notifications: items, representative: items[0] });
    } else {
      result.push(...items);
    }
  }
  return result;
}

// ── BundleCard ─────────────────────────────────────────────────────────────────
const BundleCard: FC<{
  bundle: Bundle;
  onOpen: (n: Notification) => void;
  onMarkRead: (id: string) => void;
}> = ({ bundle, onOpen, onMarkRead }) => {
  const [expanded, setExpanded] = useState(false);
  const unread = bundle.notifications.filter(n => !n.isRead).length;
  const rep = bundle.representative;
  return (
    <div className="rounded-xl border border-border/60 bg-card overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className={cn('p-2 rounded-lg shrink-0', getIconBg(rep))}>{getNotificationIcon(rep)}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{(rep.title || '').split(':')[0].trim()}</span>
            <Badge className="text-[10px] px-1.5 py-0 bg-[#1D3461]/10 text-[#1D3461] border-0">
              {bundle.notifications.length} notifications
            </Badge>
            {unread > 0 && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {unread > 0 ? `${unread} unread` : 'All read'} · Latest {formatDate(rep.createdAt)}
          </p>
        </div>
        <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="border-t border-border/40 bg-muted/20 divide-y divide-border/30">
          {bundle.notifications.map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => { onMarkRead(n.id); if (n.link) onOpen(n); }}
              className={cn('w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-card/60 transition-colors', !n.isRead && 'bg-blue-50/50 dark:bg-blue-900/10')}
            >
              {!n.isRead && <div className="mt-2 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground line-clamp-1">{n.message}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(n.createdAt)}</p>
              </div>
              {n.link && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── NotificationCard ──────────────────────────────────────────────────────────
const NotificationCard: FC<{
  n: Notification;
  onRead: (id: string) => void;
  onOpen: (n: Notification) => void;
  onApprove: (n: Notification) => void;
  onReject: (n: Notification) => void;
  actionPending: string | null;
}> = ({ n, onRead, onOpen, onApprove, onReject, actionPending }) => {
  const isPending = actionPending === n.id;
  const priorityBadge = getPriorityBadge(n.priority);
  const showApproveReject = canApproveReject(n) && !n.isRead;
  const showAction = needsAction(n);
  const hasLink = !!(n.link);

  return (
    <div
      className={cn(
        'rounded-xl border transition-all group',
        !n.isRead
          ? 'bg-white dark:bg-gray-900 border-blue-100 dark:border-blue-900/40 shadow-sm'
          : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800',
        n.priority === 'urgent' && !n.isRead && 'border-red-200 dark:border-red-900/40',
      )}
    >
      {/* Unread indicator strip */}
      {!n.isRead && (
        <div className={cn(
          'h-0.5 rounded-t-xl',
          n.priority === 'urgent' ? 'bg-red-500' : n.priority === 'high' ? 'bg-amber-500' : 'bg-blue-500',
        )} />
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn('p-2.5 rounded-xl shrink-0 mt-0.5', getIconBg(n))}>
            {getNotificationIcon(n)}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn(
                    'font-semibold text-sm leading-snug',
                    !n.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400',
                  )}>
                    {n.title}
                  </span>
                  {priorityBadge && (
                    <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full border', priorityBadge)}>
                      {(n.priority || '').toUpperCase()}
                    </span>
                  )}
                </div>
                {n.message && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 leading-relaxed line-clamp-2">
                    {n.message}
                  </p>
                )}
              </div>

              {/* Time + unread dot */}
              <div className="flex items-center gap-2 shrink-0">
                {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(n.createdAt)}</span>
              </div>
            </div>

            {/* Action buttons row */}
            {(showApproveReject || showAction || hasLink) && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {showApproveReject && (
                  <>
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold"
                      onClick={e => { e.stopPropagation(); onApprove(n); }}
                      disabled={isPending}
                      data-testid={`btn-approve-${n.id}`}
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5 font-semibold dark:border-red-900/50 dark:hover:bg-red-900/20"
                      onClick={e => { e.stopPropagation(); onReject(n); }}
                      disabled={isPending}
                      data-testid={`btn-reject-${n.id}`}
                    >
                      {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsDown className="h-3 w-3" />}
                      Reject
                    </Button>
                    <div className="h-4 w-px bg-border/60" />
                  </>
                )}
                {hasLink && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-3 text-xs text-[#1D3461] hover:bg-[#1D3461]/5 gap-1.5 font-semibold"
                    onClick={e => { e.stopPropagation(); onOpen(n); }}
                    data-testid={`btn-view-${n.id}`}
                  >
                    View Details
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                )}
                {!hasLink && !n.isRead && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-3 text-xs text-muted-foreground hover:text-foreground gap-1.5"
                    onClick={e => { e.stopPropagation(); onRead(n.id); }}
                    data-testid={`btn-markread-${n.id}`}
                  >
                    <CheckCheck className="h-3 w-3" />
                    Mark read
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Analytics bar ──────────────────────────────────────────────────────────────
const AnalyticsBar: FC<{ notifications: Notification[] }> = ({ notifications }) => {
  const stats = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter(n => !n.isRead).length;
    const urgent = notifications.filter(n => (n.priority === 'urgent' || n.priority === 'high') && !n.isRead).length;
    const pendingActions = notifications.filter(n => needsAction(n) && !n.isRead).length;
    const todayCount = notifications.filter(n => {
      try { return isToday(parseISO(n.createdAt || '')); } catch { return false; }
    }).length;
    return { total, unread, urgent, pendingActions, todayCount };
  }, [notifications]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50">
      {[
        { label: 'Today', value: stats.todayCount, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
        { label: 'Unread', value: stats.unread, icon: CircleDot, color: 'text-[#1D3461]', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
        { label: 'Pending Actions', value: stats.pendingActions, icon: Zap, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        { label: 'Urgent', value: stats.urgent, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/20' },
      ].map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className={cn('rounded-xl p-3 flex items-center gap-3', bg)}>
          <div className={cn('h-8 w-8 rounded-lg bg-white/70 dark:bg-black/20 flex items-center justify-center')}>
            <Icon className={cn('h-4 w-4', color)} />
          </div>
          <div>
            <p className={cn('text-xl font-bold leading-none tabular-nums', color)}>{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const Notifications: FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin']);
  const { notifications, markNotificationAsRead, clearAllNotifications } = useNotifications();

  const [activeTab, setActiveTab] = useState<'all' | 'unread' | 'actions' | 'analytics'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [bundleMode, setBundleMode] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<{
    total: number; sent: number; read: number; pending: number;
    emailSent: number; escalated: number;
    byEventType: { event_type: string; count: number }[];
    byPriority: { priority: string; count: number }[];
    avgReadMinutes: number | null;
  } | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Fetch system-wide analytics for admin
  useEffect(() => {
    if (activeTab !== 'analytics' || !isAdmin) return;
    setAnalyticsLoading(true);
    (async () => {
      try {
        const [totalRes, byEventRes, byPriorityRes, emailRes, readRes] = await Promise.allSettled([
          supabase.from('notifications').select('id, status, is_read, email_sent, escalated_at', { count: 'exact', head: false }).limit(1000),
          supabase.from('notifications').select('event_type').limit(5000),
          supabase.from('notifications').select('priority').limit(5000),
          supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('email_sent', true),
          supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', true),
        ]);

        const rows = totalRes.status === 'fulfilled' ? (totalRes.value.data || []) : [];
        const total = rows.length;
        const sent  = rows.filter((r: any) => r.status === 'sent' || r.email_sent).length;
        const read  = totalRes.status === 'fulfilled' ? (readRes.status === 'fulfilled' ? (readRes.value.count || 0) : 0) : 0;
        const pending = rows.filter((r: any) => r.status === 'pending').length;
        const emailSent = emailRes.status === 'fulfilled' ? (emailRes.value.count || 0) : 0;
        const escalated = rows.filter((r: any) => r.escalated_at).length;

        // Aggregate event types
        const eventRows = byEventRes.status === 'fulfilled' ? (byEventRes.value.data || []) : [];
        const eventMap = new Map<string, number>();
        for (const r of eventRows) {
          const et = (r as any).event_type || 'unknown';
          eventMap.set(et, (eventMap.get(et) || 0) + 1);
        }
        const byEventType = Array.from(eventMap.entries())
          .map(([event_type, count]) => ({ event_type, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        // Aggregate priorities
        const priorRows = byPriorityRes.status === 'fulfilled' ? (byPriorityRes.value.data || []) : [];
        const priorMap = new Map<string, number>();
        for (const r of priorRows) {
          const p = (r as any).priority || 'normal';
          priorMap.set(p, (priorMap.get(p) || 0) + 1);
        }
        const byPriority = Array.from(priorMap.entries())
          .map(([priority, count]) => ({ priority, count }))
          .sort((a, b) => b.count - a.count);

        setAnalyticsData({ total, sent, read: Number(read), pending, emailSent: Number(emailSent), escalated, byEventType, byPriority, avgReadMinutes: null });
      } catch (err) {
        console.error('Analytics fetch error:', err);
      } finally {
        setAnalyticsLoading(false);
      }
    })();
  }, [activeTab, isAdmin]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  const pendingActionsCount = useMemo(() => notifications.filter(n => needsAction(n) && !n.isRead).length, [notifications]);

  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    if (activeTab === 'unread') filtered = filtered.filter(n => !n.isRead);
    if (activeTab === 'actions') filtered = filtered.filter(n => needsAction(n) && !n.isRead);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.message || '').toLowerCase().includes(q)
      );
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => {
        if (selectedCategory === 'urgent') return n.priority === 'urgent' || n.priority === 'high';
        return (n.category || '').toLowerCase() === selectedCategory;
      });
    }
    return filtered;
  }, [notifications, activeTab, searchQuery, selectedCategory]);

  const groupedNotifications = useMemo(() => groupByDate(filteredNotifications), [filteredNotifications]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notifications.length };
    for (const n of notifications) {
      const cat = (n.category || '').toLowerCase();
      if (n.priority === 'urgent' || n.priority === 'high') counts.urgent = (counts.urgent || 0) + 1;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [notifications]);

  const handleOpen = useCallback(async (n: Notification) => {
    await markNotificationAsRead(n.id);
    if (n.link) navigate(n.link);
  }, [markNotificationAsRead, navigate]);

  const handleApprove = useCallback(async (n: Notification) => {
    setActionPending(n.id);
    try {
      const result = await performApprovalAction(n, 'approved');
      if (result.success) {
        await markNotificationAsRead(n.id);
        toast({ title: '✓ Approved', description: result.message });
      } else {
        // Fall back to navigation
        await markNotificationAsRead(n.id);
        if (n.link) navigate(n.link);
        else toast({ title: 'Navigate to review', description: 'Open the action page to approve.' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not perform action.', variant: 'destructive' });
    } finally {
      setActionPending(null);
    }
  }, [markNotificationAsRead, navigate, toast]);

  const handleReject = useCallback(async (n: Notification) => {
    setActionPending(n.id);
    try {
      const result = await performApprovalAction(n, 'rejected');
      if (result.success) {
        await markNotificationAsRead(n.id);
        toast({ title: '✗ Rejected', description: result.message });
      } else {
        await markNotificationAsRead(n.id);
        if (n.link) navigate(n.link);
        else toast({ title: 'Navigate to review', description: 'Open the action page to reject.' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not perform action.', variant: 'destructive' });
    } finally {
      setActionPending(null);
    }
  }, [markNotificationAsRead, navigate, toast]);

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    await Promise.all(unread.map(n => markNotificationAsRead(n.id)));
    toast({ title: `Marked ${unread.length} notifications as read` });
  };

  const handleClearAll = async () => {
    if (!confirm('Clear all notifications? This cannot be undone.')) return;
    try {
      await clearAllNotifications();
      toast({ title: 'All notifications cleared' });
    } catch { toast({ title: 'Failed to clear', variant: 'destructive' }); }
  };

  // Render bundled or regular list
  function renderList(items: Notification[]) {
    if (bundleMode) {
      const bundled = bundleNotifications(items);
      return bundled.map((item, idx) => {
        if ('notifications' in item) {
          return (
            <BundleCard
              key={item.key}
              bundle={item}
              onOpen={handleOpen}
              onMarkRead={markNotificationAsRead}
            />
          );
        }
        return (
          <NotificationCard
            key={item.id}
            n={item}
            onRead={markNotificationAsRead}
            onOpen={handleOpen}
            onApprove={handleApprove}
            onReject={handleReject}
            actionPending={actionPending}
          />
        );
      });
    }
    return items.map(n => (
      <NotificationCard
        key={n.id}
        n={n}
        onRead={markNotificationAsRead}
        onOpen={handleOpen}
        onApprove={handleApprove}
        onReject={handleReject}
        actionPending={actionPending}
      />
    ));
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950" data-testid="notifications-page">

      {/* ── Page Header ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-0.5">
              <div className="h-8 w-8 rounded-lg bg-[#1D3461] flex items-center justify-center">
                <Bell className="h-4 w-4 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white" data-testid="text-page-title">
                Notifications
              </h1>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 ml-10">
              {unreadCount > 0 ? (
                <span><span className="text-blue-600 font-medium">{unreadCount} unread</span> · {notifications.length} total</span>
              ) : (
                <span>{notifications.length} notifications</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Bundle toggle */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant={bundleMode ? 'default' : 'outline'}
                    className={cn('h-9 px-3 gap-1.5 text-xs', bundleMode && 'bg-[#1D3461]')}
                    onClick={() => setBundleMode(v => !v)}
                    data-testid="button-toggle-bundle"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {bundleMode ? 'Bundled' : 'Bundle'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Group similar notifications together</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3 gap-1.5 text-xs"
              onClick={() => window.location.reload()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3 gap-1.5 text-xs"
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 px-3 gap-1.5 text-xs text-red-500 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/20"
              onClick={handleClearAll}
              data-testid="button-clear-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                className="h-9 px-3 gap-1.5 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white font-semibold"
                onClick={() => navigate('/admin/broadcast')}
                data-testid="button-broadcast-center"
              >
                <Radio className="h-3.5 w-3.5" />
                Broadcast Center
              </Button>
            )}
          </div>
        </div>

        {/* ── Category Chips ── */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-0.5 scrollbar-hide">
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.id] || 0;
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                data-testid={`category-${cat.id}`}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors border',
                  isActive
                    ? 'bg-[#1D3461] text-white border-[#1D3461] shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-transparent hover:bg-gray-200 dark:hover:bg-gray-700',
                )}
              >
                <cat.icon className={cn('h-3 w-3', isActive ? '' : cat.color)} />
                {cat.label}
                {count > 0 && (
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none',
                    isActive ? 'bg-white/25 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
                  )}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Analytics Bar ── */}
      <AnalyticsBar notifications={notifications} />

      {/* ── Tabs + Search toolbar ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-3 flex-wrap">
        {/* Tabs */}
        <div className="flex rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shrink-0 flex-wrap">
          {([
            { key: 'all',       label: 'All',            count: notifications.length },
            { key: 'unread',    label: 'Unread',         count: unreadCount },
            { key: 'actions',   label: 'Pending Actions', count: pendingActionsCount },
            ...(isAdmin ? [{ key: 'analytics', label: 'Analytics', count: 0 }] : []),
          ] as const).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              data-testid={`tab-${tab.key}`}
              className={cn(
                'px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5',
                activeTab === tab.key
                  ? 'bg-[#1D3461] text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  'px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none',
                  activeTab === tab.key ? 'bg-white/25 text-white' : 'bg-red-500 text-white',
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search (hidden in analytics mode) */}
        {activeTab !== 'analytics' && (
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search notifications…"
              className="w-full h-9 pl-9 pr-8 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/30"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {activeTab !== 'analytics' && (
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {filteredNotifications.length} result{filteredNotifications.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Actions Needed Banner ── */}
      {activeTab === 'actions' && pendingActionsCount > 0 && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 flex items-center gap-3">
          <Zap className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
              {pendingActionsCount} notification{pendingActionsCount !== 1 ? 's' : ''} requiring your action
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
              Click Approve or Reject directly, or View Details to review first.
            </p>
          </div>
        </div>
      )}

      {/* ── Analytics Panel (admin only) ── */}
      {activeTab === 'analytics' && isAdmin && (
        <div className="flex-1 overflow-auto px-6 py-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#1D3461]" />
              <span className="ml-3 text-sm text-gray-500">Loading analytics…</span>
            </div>
          ) : analyticsData ? (
            <div className="max-w-4xl space-y-6">
              {/* KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Total',      value: analyticsData.total,      color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700',    icon: Bell },
                  { label: 'Sent',       value: analyticsData.sent,       color: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700', icon: CheckCircle2 },
                  { label: 'Read',       value: analyticsData.read,       color: 'bg-green-50 dark:bg-green-900/20 text-green-700',  icon: CheckCheck },
                  { label: 'Pending',    value: analyticsData.pending,    color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700',  icon: Clock },
                  { label: 'Emails Out', value: analyticsData.emailSent,  color: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700',    icon: ArrowRight },
                  { label: 'Escalated',  value: analyticsData.escalated,  color: 'bg-red-50 dark:bg-red-900/20 text-red-700',       icon: AlertTriangle },
                ].map(({ label, value, color, icon: Icon }) => (
                  <div key={label} className={cn('rounded-xl p-4 flex flex-col gap-1', color.split(' ')[0], color.split(' ')[1])}>
                    <Icon className={cn('h-5 w-5', color.split(' ').pop())} />
                    <p className={cn('text-2xl font-bold tabular-nums mt-1', color.split(' ').pop())}>{value.toLocaleString()}</p>
                    <p className="text-xs font-medium text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>

              {/* Delivery rate */}
              {analyticsData.total > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">Delivery Rate</h3>
                  <div className="space-y-3">
                    {[
                      { label: 'Email Delivery', value: analyticsData.emailSent, total: analyticsData.total, color: 'bg-cyan-500' },
                      { label: 'Read Rate',       value: analyticsData.read,      total: analyticsData.total, color: 'bg-emerald-500' },
                    ].map(({ label, value, total, color }) => {
                      const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                      return (
                        <div key={label}>
                          <div className="flex justify-between text-xs text-gray-500 mb-1">
                            <span>{label}</span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">{pct}% ({value.toLocaleString()} / {total.toLocaleString()})</span>
                          </div>
                          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top event types */}
              {analyticsData.byEventType.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Top Event Types (last 1,000 notifications)
                  </h3>
                  <div className="space-y-2">
                    {analyticsData.byEventType.map(({ event_type, count }) => {
                      const maxCount = analyticsData.byEventType[0]?.count || 1;
                      const pct = Math.round((count / maxCount) * 100);
                      return (
                        <div key={event_type} className="flex items-center gap-3">
                          <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-48 shrink-0 truncate">{event_type}</span>
                          <div className="flex-1 h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                            <div className="h-2 rounded-full bg-[#1D3461]" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-10 text-right tabular-nums">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Priority breakdown */}
              {analyticsData.byPriority.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-3">Priority Breakdown</h3>
                  <div className="flex gap-4 flex-wrap">
                    {analyticsData.byPriority.map(({ priority, count }) => {
                      const colors: Record<string, string> = { urgent: 'bg-red-100 text-red-700 border-red-200', high: 'bg-amber-100 text-amber-700 border-amber-200', normal: 'bg-gray-100 text-gray-700 border-gray-200' };
                      const cls = colors[priority] || colors.normal;
                      const pct = analyticsData.total > 0 ? Math.round((count / analyticsData.total) * 100) : 0;
                      return (
                        <div key={priority} className={cn('px-4 py-3 rounded-xl border text-center min-w-[100px]', cls)}>
                          <p className="text-2xl font-bold tabular-nums">{count}</p>
                          <p className="text-xs font-semibold mt-1 uppercase tracking-wide">{priority}</p>
                          <p className="text-[11px] opacity-70 mt-0.5">{pct}%</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-400 text-center pb-2">
                Data reflects the most recent 5,000 notifications. Refresh analytics tab to update.
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <BarChart3 className="h-10 w-10 text-gray-300 mb-3" />
              <p className="font-semibold text-gray-600">No analytics data available</p>
              <p className="text-sm text-gray-400 mt-1">The notifications table may be empty or inaccessible.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Notification List ── */}
      {activeTab !== 'analytics' && (
      <div className="flex-1 overflow-auto px-6 py-4">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              {activeTab === 'actions' ? <Zap className="h-7 w-7 text-gray-400" /> : <Bell className="h-7 w-7 text-gray-400" />}
            </div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {searchQuery
                ? 'No matching notifications'
                : activeTab === 'unread'
                ? 'No unread notifications'
                : activeTab === 'actions'
                ? 'No pending actions'
                : 'No notifications yet'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {searchQuery
                ? 'Try a different search term'
                : activeTab === 'unread'
                ? "You're all caught up! 🎉"
                : activeTab === 'actions'
                ? 'Nothing needs your attention right now.'
                : 'Activity will appear here.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            {Object.entries(groupedNotifications).map(([dateGroup, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={dateGroup}>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{dateGroup}</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {renderList(items)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default Notifications;
