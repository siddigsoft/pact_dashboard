import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, AlertTriangle, Clock, Mail, ChevronRight,
  ClipboardCheck, CreditCard, UserCheck, FileText, X, Check,
  RefreshCw, Inbox,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useNavBadgeCountsContext } from '@/context/NavBadgeCountsContext';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface PendingAction {
  id: string;
  label: string;
  count: number;
  url: string;
  icon: React.ReactNode;
  urgency: 'high' | 'normal';
}

export function NavbarNotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('actions');
  const {
    counts,
    loading: badgeCountsLoading,
    refresh: refreshBadgeCounts,
    includeAdminBellCounts,
    includeFomVerifiedCounts,
  } = useNavBadgeCountsContext();

  const { notifications, markNotificationAsRead, markAllNotificationsAsRead, getUnreadNotificationsCount } =
    useNotifications() as any;

  const markAllAsRead = useCallback(async () => {
    setLoadingNotifs(true);
    try {
      if (typeof markAllNotificationsAsRead === 'function') {
        await markAllNotificationsAsRead();
      } else {
        const unread = (notifications || []).filter((n: any) => !n.isRead);
        await Promise.all(unread.map((n: any) => markNotificationAsRead?.(n.id)));
      }
    } finally {
      setLoadingNotifs(false);
    }
  }, [notifications, markNotificationAsRead, markAllNotificationsAsRead]);

  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  // All role checks return boolean primitives — safe to use in useCallback deps
  const isSupervisor = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);

  const pendingActions = useMemo((): PendingAction[] => {
    const actions: PendingAction[] = [];
    if (!currentUser?.id) return actions;

    if (isSupervisor && currentUser.hubId) {
      if (counts.pendingCostTier1Hub > 0) {
        actions.push({
          id: 'cost-tier1',
          label: 'Cost submissions awaiting your approval',
          count: counts.pendingCostTier1Hub,
          url: '/cost-approval',
          icon: <ClipboardCheck className="h-4 w-4" />,
          urgency: 'high',
        });
      }
      if (counts.pendingDpSupervisor > 0) {
        actions.push({
          id: 'dp-supervisor',
          label: 'Down-payment requests awaiting approval',
          count: counts.pendingDpSupervisor,
          url: '/down-payment-approval',
          icon: <CreditCard className="h-4 w-4" />,
          urgency: 'high',
        });
      }
    }

    if (includeAdminBellCounts) {
      if (counts.pendingUsers > 0) {
        actions.push({
          id: 'pending-users',
          label: 'New user registrations awaiting approval',
          count: counts.pendingUsers,
          url: '/admin-hub?tab=users',
          icon: <UserCheck className="h-4 w-4" />,
          urgency: 'high',
        });
      }
      if (counts.pendingTier2Cost > 0) {
        actions.push({
          id: 'cost-tier2',
          label: 'Cost submissions pending final approval',
          count: counts.pendingTier2Cost,
          url: '/cost-approval',
          icon: <ClipboardCheck className="h-4 w-4" />,
          urgency: 'normal',
        });
      }
      if (counts.pendingDpAdmin > 0) {
        actions.push({
          id: 'dp-admin',
          label: 'Down-payment requests pending admin review',
          count: counts.pendingDpAdmin,
          url: '/down-payment-approval',
          icon: <CreditCard className="h-4 w-4" />,
          urgency: 'high',
        });
      }
    }

    if (includeFomVerifiedCounts && counts.mmpVerifiedSites > 0) {
      actions.push({
        id: 'site-verify',
        label: 'Verified sites awaiting MMP approval',
        count: counts.mmpVerifiedSites,
        url: '/mmp?tab=verified',
        icon: <FileText className="h-4 w-4" />,
        urgency: 'normal',
      });
    }

    return actions;
  }, [
    currentUser?.id,
    currentUser?.hubId,
    isSupervisor,
    includeAdminBellCounts,
    includeFomVerifiedCounts,
    counts,
  ]);

  // Switch to the more relevant tab when panel opens
  useEffect(() => {
    if (open) {
      setActiveTab(pendingActions.length > 0 ? 'actions' : 'notifications');
    }
  }, [open, pendingActions.length]);

  let contextUnreadCount = 0;
  try {
    contextUnreadCount = typeof getUnreadNotificationsCount === 'function'
      ? (getUnreadNotificationsCount() || 0)
      : (notifications || []).filter((n: any) => !n.isRead).length;
  } catch { contextUnreadCount = 0; }
  const unreadCount = Math.max(contextUnreadCount, counts.unreadNotifications);

  const pendingActionsCount = pendingActions.reduce((sum, a) => sum + a.count, 0);
  const totalBadge = unreadCount + pendingActionsCount;
  const hasUrgent = pendingActions.some(a => a.urgency === 'high') ||
    (notifications || []).some((n: any) => !n.isRead && n.priority === 'urgent');

  const recentNotifications = [...(notifications || [])]
    .sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() -
      new Date(a.createdAt || a.created_at || 0).getTime())
    .slice(0, 30);

  const getPriorityIcon = (n: any) => {
    if (n.priority === 'urgent') return <AlertTriangle className="h-3.5 w-3.5 text-red-500" />;
    if (n.priority === 'high') return <Clock className="h-3.5 w-3.5 text-amber-500" />;
    if (n.emailSent || n.email_sent) return <Mail className="h-3.5 w-3.5 text-blue-500" />;
    return <Bell className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const handleNotificationClick = async (n: any) => {
    if (!n.isRead) await markNotificationAsRead?.(n.id);
    const raw = n.link || n.action_url;
    if (!raw) return;

    // Normalize known dead deep-links from older notification payloads.
    let link = String(raw).startsWith('/') ? String(raw) : `/${raw}`;
    if (link.startsWith('/finance/down-payments')) {
      link = '/down-payment-approval';
    } else if (link.startsWith('/finance/operational-costs')) {
      link = '/cost-approval';
    } else if (link.startsWith('/users?tab=pending-approvals') || link === '/users') {
      link = '/admin-hub?tab=users';
    } else if (
      n.relatedEntityType === 'mmp_site_entry' ||
      n.related_entity_type === 'mmp_site_entry' ||
      /^\/mmp\/[0-9a-f-]{36}$/i.test(link)
    ) {
      // Site-entry notifications historically used /mmp/{siteEntryId}. Resolve parent MMP.
      const siteId =
        n.relatedEntityId ||
        n.related_entity_id ||
        link.match(/^\/mmp\/([0-9a-f-]{36})$/i)?.[1];
      if (siteId) {
        try {
          const { data } = await supabase
            .from('mmp_site_entries')
            .select('id, mmp_file_id')
            .eq('id', siteId)
            .maybeSingle();
          if (data?.mmp_file_id) {
            link = `/mmp/${data.mmp_file_id}?site=${data.id}`;
          }
        } catch {
          /* keep original link; MMPDetailView also redirects */
        }
      }
    }

    navigate(link);
    setOpen(false);
  };

  const displayBadge = totalBadge > 99 ? '99+' : totalBadge;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          data-testid="button-notification-bell"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className={cn(
              "absolute top-0.5 right-0 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[9px] font-bold text-white leading-none ring-2 ring-white dark:ring-slate-950",
              hasUrgent ? "bg-red-500" : "bg-primary"
            )}>
              {displayBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={16}
        className={cn(
          // Must beat Popover default `sm:w-72` / `p-4` or titles stay clipped.
          'w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:!w-[420px] sm:!max-w-[420px] !p-0',
          'rounded-xl border border-border/70 bg-background text-foreground shadow-xl overflow-hidden',
        )}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-[#1D3461]/10 dark:bg-[#1D3461]/30 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 text-[#1D3461] dark:text-blue-300" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-foreground leading-none">Notifications</p>
              {totalBadge > 0 && (
                <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  {pendingActionsCount > 0 && `${pendingActionsCount > 99 ? '99+' : pendingActionsCount} actions`}
                  {pendingActionsCount > 0 && unreadCount > 0 && ' · '}
                  {unreadCount > 0 && `${unreadCount > 99 ? '99+' : unreadCount} unread`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => void refreshBadgeCounts()}
              title="Refresh"
              data-testid="button-refresh-notifications"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', badgeCountsLoading && 'animate-spin')} />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
                disabled={loadingNotifs}
                title="Mark all as read"
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Mark all
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
              data-testid="button-close-notifications"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-4 pt-3 pb-2">
            <TabsList className="grid w-full grid-cols-2 h-10 rounded-lg bg-muted p-1 gap-1">
              <TabsTrigger
                value="actions"
                className="h-8 rounded-md text-xs font-medium gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground"
                data-testid="tab-pending-actions"
              >
                <ClipboardCheck className="h-3.5 w-3.5 shrink-0 opacity-70" />
                Actions
                {pendingActionsCount > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-red-500/90 text-white text-[10px] font-semibold tabular-nums">
                    {pendingActionsCount > 99 ? '99+' : pendingActionsCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="notifications"
                className="h-8 rounded-md text-xs font-medium gap-1.5 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground"
                data-testid="tab-notifications"
              >
                <Inbox className="h-3.5 w-3.5 shrink-0 opacity-70" />
                Inbox
                {unreadCount > 0 && (
                  <span className="ml-0.5 inline-flex items-center justify-center h-5 min-w-[1.25rem] px-1.5 rounded-full bg-[#1D3461] text-white text-[10px] font-semibold tabular-nums">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Pending Actions Tab ──────────────────────────────────── */}
          <TabsContent value="actions" className="m-0 flex flex-col outline-none">
            <ScrollArea className="h-[min(400px,calc(100vh-240px))]">
              <div className="px-2 pb-2">
                {badgeCountsLoading ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div className="h-6 w-6 border-2 border-[#1D3461] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-muted-foreground">Loading actions…</p>
                  </div>
                ) : pendingActions.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2 px-4">
                    <div className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                      <Check className="h-6 w-6 text-emerald-500" />
                    </div>
                    <p className="text-sm font-medium text-foreground">All caught up</p>
                    <p className="text-xs text-center text-muted-foreground">No pending actions right now</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {pendingActions.map(action => (
                      <button
                        key={action.id}
                        type="button"
                        className="w-full flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-muted/70 active:bg-muted transition-colors text-left group"
                        onClick={() => { navigate(action.url); setOpen(false); }}
                        data-testid={`action-item-${action.id}`}
                      >
                        <div className={cn(
                          'shrink-0 h-10 w-10 rounded-xl flex items-center justify-center',
                          action.urgency === 'high'
                            ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                            : 'bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
                        )}>
                          {action.icon}
                        </div>
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm font-medium text-foreground leading-snug">
                            {action.label}
                          </p>
                          <span className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold tabular-nums',
                            action.urgency === 'high'
                              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                          )}>
                            {action.count} pending
                          </span>
                        </div>
                        <ChevronRight className="h-4 w-4 mt-1 text-muted-foreground/50 group-hover:text-foreground shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* ── Notifications Tab ────────────────────────────────────── */}
          <TabsContent value="notifications" className="m-0 flex flex-col outline-none">
            <ScrollArea className="h-[min(400px,calc(100vh-280px))]">
              <div className="px-2 pb-2">
                {loadingNotifs ? (
                  <div className="flex flex-col items-center justify-center py-14 gap-3">
                    <div className="h-6 w-6 border-2 border-[#1D3461] border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  </div>
                ) : recentNotifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2 px-4">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      <Inbox className="h-6 w-6 opacity-40" />
                    </div>
                    <p className="text-sm font-medium text-foreground">No notifications yet</p>
                    <p className="text-xs text-center text-muted-foreground">You’re all caught up</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {recentNotifications.map((n: any) => {
                      const title = n.title || n.title_en || 'Notification';
                      const body = n.message || n.message_en || '';
                      const showBody = body && body.trim() !== title.trim();
                      return (
                        <div
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          className={cn(
                            'relative flex items-start gap-3 rounded-lg px-3 py-3 cursor-pointer transition-colors group',
                            'hover:bg-muted/70 active:bg-muted',
                            !n.isRead && 'bg-[#1D3461]/5 dark:bg-[#1D3461]/20',
                          )}
                          onClick={() => handleNotificationClick(n)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              void handleNotificationClick(n);
                            }
                          }}
                          data-testid={`notification-item-${n.id}`}
                        >
                          {!n.isRead && (
                            <span className="absolute left-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-[#1D3461]" aria-hidden />
                          )}
                          <div className={cn(
                            'shrink-0 h-9 w-9 rounded-lg flex items-center justify-center',
                            !n.isRead
                              ? 'bg-[#1D3461]/10 dark:bg-[#1D3461]/40 text-[#1D3461] dark:text-blue-300'
                              : 'bg-muted text-muted-foreground',
                          )}>
                            {getPriorityIcon(n)}
                          </div>
                          <div className="flex-1 min-w-0 space-y-1">
                            <p className={cn(
                              'text-sm leading-snug break-words',
                              !n.isRead ? 'font-semibold text-foreground' : 'font-medium text-foreground/85',
                            )}>
                              {title}
                            </p>
                            {showBody && (
                              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 break-words">
                                {body}
                              </p>
                            )}
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="text-[11px] text-muted-foreground tabular-nums">
                                {formatDistanceToNow(
                                  new Date(n.createdAt || n.created_at || Date.now()),
                                  { addSuffix: true },
                                )}
                              </span>
                              {(n.emailSent || n.email_sent) && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[#1D3461] dark:text-blue-300 font-medium">
                                  <Mail className="h-3 w-3" /> Email sent
                                </span>
                              )}
                            </div>
                          </div>
                          {!n.isRead && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                              onClick={e => { e.stopPropagation(); markNotificationAsRead?.(n.id); }}
                              title="Mark as read"
                              data-testid={`button-mark-read-${n.id}`}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </ScrollArea>
            <div className="border-t border-border/60 px-4 py-3 flex items-center justify-between gap-3 bg-muted/20">
              <span className="text-xs text-muted-foreground tabular-nums min-w-0 truncate">
                {unreadCount > 0
                  ? <span className="font-medium text-foreground">{unreadCount} unread</span>
                  : <span className="font-medium text-emerald-600 dark:text-emerald-400">All read</span>
                }
                {recentNotifications.length > 0 && (
                  <span className="text-muted-foreground/80"> · {recentNotifications.length} shown</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs px-2.5 shrink-0 font-medium text-[#1D3461] dark:text-blue-300 hover:bg-[#1D3461]/10"
                onClick={() => { navigate('/notifications'); setOpen(false); }}
                data-testid="link-view-all-notifications"
              >
                View all
                <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
