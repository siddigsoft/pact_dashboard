import { useState, useEffect, useCallback } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { formatDistanceToNow } from 'date-fns';

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
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const [directUnreadCount, setDirectUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<string>('actions');

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
      setDirectUnreadCount(0);
    } finally {
      setLoadingNotifs(false);
    }
  }, [notifications, markNotificationAsRead, markAllNotificationsAsRead]);

  const { currentUser } = useAppContext();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();

  const isSupervisor = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
  const isAdmin = isSuperAdmin || hasAnyRole(['admin', 'Admin', 'super_admin']);
  const isFOM = hasAnyRole(['fom', 'FOM', 'Field Operation Manager (FOM)']);

  const fetchPendingActions = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoadingActions(true);
    const actions: PendingAction[] = [];

    try {
      if (isSupervisor && currentUser?.hubId) {
        const { count: costCount } = await supabase
          .from('operational_cost_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('hub_id', currentUser.hubId)
          .eq('tier1_status', 'pending')
          .neq('submitted_by', currentUser.id);
        if ((costCount || 0) > 0) {
          actions.push({
            id: 'cost-tier1',
            label: 'Cost submissions awaiting your approval',
            count: costCount!,
            url: '/finance/operational-costs?tab=approvals',
            icon: <ClipboardCheck className="h-4 w-4 text-amber-500" />,
            urgency: 'high',
          });
        }

        const { count: dpCount } = await supabase
          .from('down_payment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('hub_id', currentUser.hubId)
          .eq('status', 'pending_supervisor');
        if ((dpCount || 0) > 0) {
          actions.push({
            id: 'dp-supervisor',
            label: 'Down-payment requests awaiting approval',
            count: dpCount!,
            url: '/finance/down-payments?tab=pending',
            icon: <CreditCard className="h-4 w-4 text-blue-500" />,
            urgency: 'high',
          });
        }
      }

      if (isAdmin) {
        const { count: userCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if ((userCount || 0) > 0) {
          actions.push({
            id: 'pending-users',
            label: 'New user registrations awaiting approval',
            count: userCount!,
            url: '/users?tab=pending-approvals',
            icon: <UserCheck className="h-4 w-4 text-purple-500" />,
            urgency: 'high',
          });
        }

        const { count: costT2 } = await supabase
          .from('operational_cost_submissions')
          .select('id', { count: 'exact', head: true })
          .eq('tier2_status', 'pending')
          .eq('tier1_status', 'approved');
        if ((costT2 || 0) > 0) {
          actions.push({
            id: 'cost-tier2',
            label: 'Cost submissions pending final approval',
            count: costT2!,
            url: '/finance/operational-costs?tab=approvals',
            icon: <ClipboardCheck className="h-4 w-4 text-orange-500" />,
            urgency: 'normal',
          });
        }

        const { count: dpAdmin } = await supabase
          .from('down_payment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending_admin');
        if ((dpAdmin || 0) > 0) {
          actions.push({
            id: 'dp-admin',
            label: 'Down-payment requests pending admin review',
            count: dpAdmin!,
            url: '/finance/down-payments?tab=pending',
            icon: <CreditCard className="h-4 w-4 text-red-500" />,
            urgency: 'high',
          });
        }
      }

      if (isFOM) {
        const { count: verifyCount } = await supabase
          .from('mmp_site_entries')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'verified');
        if ((verifyCount || 0) > 0) {
          actions.push({
            id: 'site-verify',
            label: 'Verified sites awaiting MMP approval',
            count: verifyCount!,
            url: '/mmp?tab=verified',
            icon: <FileText className="h-4 w-4 text-green-500" />,
            urgency: 'normal',
          });
        }
      }
    } catch (err) {
      console.warn('[NavbarNotificationBell] fetchPendingActions error:', err);
    } finally {
      setLoadingActions(false);
      setPendingActions(actions);
    }
  }, [currentUser?.id, currentUser?.hubId, isSupervisor, isAdmin, isFOM]);

  useEffect(() => {
    const initialDelay = setTimeout(fetchPendingActions, 3_000);
    const interval = setInterval(fetchPendingActions, 5 * 60_000);
    return () => { clearTimeout(initialDelay); clearInterval(interval); };
  }, [fetchPendingActions]);

  useEffect(() => {
    if (!currentUser?.id) return;
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', currentUser.id)
      .eq('is_read', false)
      .then(({ count }) => setDirectUnreadCount(count || 0));
  }, [currentUser?.id, open]);

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
  const unreadCount = Math.max(contextUnreadCount, directUnreadCount);

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
    const link = n.link || n.action_url;
    if (link) {
      navigate(link.startsWith('/') ? link : `/${link}`);
      setOpen(false);
    }
  };

  const displayBadge = totalBadge > 99 ? '99+' : totalBadge;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          data-testid="button-notification-bell"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {totalBadge > 0 && (
            <span className={cn(
              "absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] px-0.5 items-center justify-center rounded-full text-[9px] font-bold text-white leading-none",
              hasUrgent ? "bg-red-500 animate-pulse" : "bg-primary"
            )}>
              {displayBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        collisionPadding={12}
        className="w-[420px] max-w-[calc(100vw-24px)] p-0 shadow-2xl border border-border/60 rounded-xl overflow-hidden"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gradient-to-r from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <span className="font-semibold text-sm leading-none">Notifications</span>
              {totalBadge > 0 && (
                <span className="ml-2 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  {displayBadge}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => fetchPendingActions()}
              title="Refresh"
              data-testid="button-refresh-notifications"
            >
              <RefreshCw className={cn("h-3 w-3", loadingActions && "animate-spin")} />
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
                disabled={loadingNotifs}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(false)}
              data-testid="button-close-notifications"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────── */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b px-3 h-9 bg-gray-50/80 dark:bg-gray-900/60 gap-1">
            <TabsTrigger
              value="actions"
              className="text-xs h-7 px-3 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm rounded-md relative"
              data-testid="tab-pending-actions"
            >
              <ClipboardCheck className="h-3 w-3 mr-1.5 opacity-70" />
              Actions
              {pendingActionsCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {pendingActionsCount > 99 ? '99+' : pendingActionsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="notifications"
              className="text-xs h-7 px-3 data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm rounded-md relative"
              data-testid="tab-notifications"
            >
              <Bell className="h-3 w-3 mr-1.5 opacity-70" />
              Inbox
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-blue-500 text-white text-[9px] font-bold">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Pending Actions Tab ──────────────────────────────────── */}
          <TabsContent value="actions" className="m-0 flex flex-col">
            <ScrollArea className="h-[min(360px,calc(100vh-220px))]">
              {loadingActions ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading actions…</p>
                </div>
              ) : pendingActions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <div className="h-12 w-12 rounded-full bg-green-50 dark:bg-green-900/20 flex items-center justify-center">
                    <Check className="h-6 w-6 text-green-500" />
                  </div>
                  <p className="text-sm font-medium text-foreground">All caught up!</p>
                  <p className="text-xs opacity-60">No pending actions right now</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {pendingActions.map(action => (
                    <button
                      key={action.id}
                      className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/60 active:bg-muted transition-colors text-left group"
                      onClick={() => { navigate(action.url); setOpen(false); }}
                      data-testid={`action-item-${action.id}`}
                    >
                      <div className={cn(
                        "flex-shrink-0 h-9 w-9 rounded-xl flex items-center justify-center",
                        action.urgency === 'high'
                          ? "bg-red-50 dark:bg-red-900/20 ring-1 ring-red-200 dark:ring-red-800"
                          : "bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-200 dark:ring-amber-800"
                      )}>
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {action.label}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn(
                            "inline-flex items-center justify-center h-4 min-w-[16px] px-1.5 rounded-full text-[10px] font-bold text-white",
                            action.urgency === 'high' ? "bg-red-500" : "bg-amber-500"
                          )}>
                            {action.count}
                          </span>
                          <span className={cn(
                            "text-xs font-medium",
                            action.urgency === 'high' ? "text-red-500" : "text-amber-500"
                          )}>
                            {action.count === 1 ? 'item' : 'items'} pending
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ── Notifications Tab ────────────────────────────────────── */}
          <TabsContent value="notifications" className="m-0 flex flex-col">
            <ScrollArea className="h-[min(360px,calc(100vh-220px))]">
              {loadingNotifs ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground">Loading…</p>
                </div>
              ) : recentNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Inbox className="h-6 w-6 opacity-40" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No notifications yet</p>
                  <p className="text-xs opacity-60">You're all caught up</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentNotifications.map((n: any) => (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-muted/60 active:bg-muted/80 transition-colors cursor-pointer group",
                        !n.isRead && "bg-blue-50/60 dark:bg-blue-900/10 border-l-2 border-l-blue-400"
                      )}
                      onClick={() => handleNotificationClick(n)}
                      data-testid={`notification-item-${n.id}`}
                    >
                      <div className="flex-shrink-0 mt-1">
                        <div className={cn(
                          "h-7 w-7 rounded-lg flex items-center justify-center",
                          !n.isRead ? "bg-blue-50 dark:bg-blue-900/30" : "bg-muted"
                        )}>
                          {getPriorityIcon(n)}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm leading-snug line-clamp-1",
                            !n.isRead ? "font-semibold text-foreground" : "font-medium text-foreground/80"
                          )}>
                            {n.title || n.title_en || n.message || 'Notification'}
                          </p>
                          {!n.isRead && (
                            <span className="flex-shrink-0 h-2 w-2 rounded-full bg-blue-500 mt-1" />
                          )}
                        </div>
                        {(n.message || n.message_en) && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                            {n.message || n.message_en}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-muted-foreground/70">
                            {formatDistanceToNow(
                              new Date(n.createdAt || n.created_at || Date.now()),
                              { addSuffix: true }
                            )}
                          </span>
                          {(n.emailSent || n.email_sent) && (
                            <span className="flex items-center gap-0.5 text-[10px] text-blue-500 font-medium">
                              <Mail className="h-2.5 w-2.5" /> Email sent
                            </span>
                          )}
                        </div>
                      </div>
                      {!n.isRead && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 opacity-0 group-hover:opacity-100 transition-all mt-0.5"
                          onClick={e => { e.stopPropagation(); markNotificationAsRead?.(n.id); }}
                          title="Mark as read"
                          data-testid={`button-mark-read-${n.id}`}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            {/* Footer */}
            <div className="border-t px-4 py-2 flex items-center justify-between bg-gray-50/80 dark:bg-gray-900/60">
              <span className="text-[11px] text-muted-foreground">
                {unreadCount > 0
                  ? <span className="font-medium text-blue-600 dark:text-blue-400">{unreadCount} unread</span>
                  : <span className="text-green-600 dark:text-green-400 font-medium">All read</span>
                }
                {recentNotifications.length > 0 && (
                  <span className="ml-1 text-muted-foreground/60">· {recentNotifications.length} shown</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[11px] px-2 text-primary hover:text-primary hover:bg-primary/10 font-medium"
                onClick={() => { navigate('/notifications'); setOpen(false); }}
                data-testid="link-view-all-notifications"
              >
                View all
                <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
