import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CheckCheck, AlertTriangle, Clock, Mail, ChevronRight,
  ClipboardCheck, CreditCard, UserCheck, FileText, X, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useNotifications } from '@/features/notifications/context/NotificationContext';
import { useAppContext } from '@/shared/context/AppContext';
import { useAuthorization } from '@/features/auth/hooks/use-authorization';
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

  const { notifications, markNotificationAsRead, clearAllNotifications, getUnreadNotificationsCount } =
    useNotifications() as any;

  const markAllAsRead = useCallback(async () => {
    const unread = (notifications || []).filter((n: any) => !n.isRead);
    await Promise.all(unread.map((n: any) => markNotificationAsRead?.(n.id)));
  }, [notifications, markNotificationAsRead]);

  const { currentUser } = useAppContext();
  const { hasAnyRole, isSuperAdmin } = useAuthorization();

  const role = (currentUser?.role || '').toLowerCase();
  const isSupervisor = hasAnyRole(['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
  const isAdmin = isSuperAdmin || hasAnyRole(['admin', 'Admin', 'super_admin']);
  const isFOM = hasAnyRole(['fom', 'FOM', 'Field Operation Manager (FOM)']);

  const fetchPendingActions = useCallback(async () => {
    if (!currentUser?.id) return;
    setLoadingActions(true);
    const actions: PendingAction[] = [];

    try {
      // ── Supervisor: Tier-1 cost approvals ──────────────────────────────
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

      // ── Admin: pending user registrations ──────────────────────────────
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

        // Tier-2 cost approvals
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

        // Down-payments pending admin
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

      // ── FOM: pending site verifications ────────────────────────────────
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

  // Refresh pending actions when popover opens, and on a 60-second interval
  useEffect(() => {
    fetchPendingActions();
    const interval = setInterval(fetchPendingActions, 60_000);
    return () => clearInterval(interval);
  }, [fetchPendingActions]);

  const unreadCount: number = typeof getUnreadNotificationsCount === 'function'
    ? getUnreadNotificationsCount()
    : (notifications || []).filter((n: any) => !n.isRead).length;

  const pendingActionsCount = pendingActions.reduce((sum, a) => sum + a.count, 0);
  const totalBadge = unreadCount + pendingActionsCount;
  const hasUrgent = pendingActions.some(a => a.urgency === 'high') ||
    (notifications || []).some((n: any) => !n.isRead && n.priority === 'urgent');

  const recentNotifications = [...(notifications || [])]
    .sort((a: any, b: any) => new Date(b.createdAt || b.created_at || 0).getTime() -
      new Date(a.createdAt || a.created_at || 0).getTime())
    .slice(0, 20);

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
              "absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white leading-none",
              hasUrgent ? "bg-red-500 animate-pulse" : "bg-primary"
            )}>
              {totalBadge > 99 ? '99+' : totalBadge}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[400px] p-0 shadow-xl" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-white dark:bg-gray-950">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Notifications</span>
            {totalBadge > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                {totalBadge}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs px-2 text-muted-foreground"
                onClick={() => (markAllAsRead || (() => {}))()}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => setOpen(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        <Tabs defaultValue={pendingActionsCount > 0 ? 'actions' : 'notifications'} className="w-full">
          <TabsList className="w-full justify-start rounded-none border-b px-3 h-8 bg-gray-50 dark:bg-gray-900/50">
            <TabsTrigger value="actions" className="text-xs h-7 relative" data-testid="tab-pending-actions">
              Pending Actions
              {pendingActionsCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                  {pendingActionsCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="notifications" className="text-xs h-7 relative" data-testid="tab-notifications">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-primary text-white text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Pending Actions Tab ─────────────────────────────────── */}
          <TabsContent value="actions" className="m-0">
            <ScrollArea className="h-72">
              {loadingActions ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : pendingActions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Check className="h-8 w-8 mb-2 text-green-500 opacity-70" />
                  <p className="text-sm font-medium">All caught up!</p>
                  <p className="text-xs mt-1 opacity-70">No pending actions right now</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pendingActions.map(action => (
                    <button
                      key={action.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left group"
                      onClick={() => { navigate(action.url); setOpen(false); }}
                      data-testid={`action-item-${action.id}`}
                    >
                      <div className={cn(
                        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
                        action.urgency === 'high' ? "bg-red-50 dark:bg-red-900/20" : "bg-muted"
                      )}>
                        {action.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">
                          {action.label}
                        </p>
                        <p className={cn(
                          "text-xs mt-0.5 font-semibold",
                          action.urgency === 'high' ? "text-red-500" : "text-amber-500"
                        )}>
                          {action.count} item{action.count !== 1 ? 's' : ''} pending
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* ── Notifications Tab ───────────────────────────────────── */}
          <TabsContent value="notifications" className="m-0">
            <ScrollArea className="h-72">
              {recentNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Bell className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y">
                  {recentNotifications.map((n: any) => (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer",
                        !n.isRead && "bg-blue-50/50 dark:bg-blue-900/10"
                      )}
                      onClick={() => handleNotificationClick(n)}
                      data-testid={`notification-item-${n.id}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getPriorityIcon(n)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {!n.isRead && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <p className="text-sm font-medium truncate">
                            {n.title || n.title_en || n.message || 'Notification'}
                          </p>
                        </div>
                        {(n.message || n.message_en) && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {n.message || n.message_en}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(
                              new Date(n.createdAt || n.created_at || Date.now()),
                              { addSuffix: true }
                            )}
                          </span>
                          {(n.emailSent || n.email_sent) && (
                            <span className="flex items-center gap-0.5 text-[10px] text-blue-500">
                              <Mail className="h-2.5 w-2.5" /> Email sent
                            </span>
                          )}
                        </div>
                      </div>
                      {!n.isRead && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 flex-shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={e => { e.stopPropagation(); markNotificationAsRead?.(n.id); }}
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
            {/* Footer: link to full notification page */}
            <div className="border-t px-4 py-2 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
              <span className="text-xs text-muted-foreground">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All read'}
              </span>
              <Button
                variant="link"
                size="sm"
                className="h-6 text-xs px-0"
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
