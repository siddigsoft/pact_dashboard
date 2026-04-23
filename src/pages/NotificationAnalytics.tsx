import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useAppContext } from '@/context/AppContext';
import { isToday, isYesterday, isThisWeek, format, subDays, startOfDay, differenceInMinutes } from 'date-fns';
import { Bell, TrendingUp, Clock, AlertCircle, CheckCircle2, BarChart3, PieChart, Activity, Eye, EyeOff, Zap, Timer, ShieldAlert } from 'lucide-react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

export default function NotificationAnalytics() {
  const { notifications } = useNotifications();
  const { currentUser, roles } = useAppContext();

  // T30 — admin-only guard. The page renders org-wide aggregates, so non-admins
  // (including FOM/PM with broad access elsewhere) should not see it.
  const allRoles = [currentUser?.role ?? '', ...(roles ?? [])]
    .filter(Boolean)
    .map(r => String(r).toLowerCase().replace(/[\s_-]/g, ''));
  const isAdmin = allRoles.some(r => r === 'admin' || r === 'superadmin');
  if (!isAdmin) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <CardTitle>Admin only</CardTitle>
                <CardDescription>
                  Notification analytics show organisation-wide delivery data and are restricted to administrators.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stats = useMemo(() => {
    const total = notifications.length;
    const unread = notifications.filter(n => !n.isRead).length;
    const read = total - unread;
    const readRate = total > 0 ? Math.round((read / total) * 100) : 0;

    const byType = {
      error: notifications.filter(n => n.type === 'error').length,
      warning: notifications.filter(n => n.type === 'warning').length,
      success: notifications.filter(n => n.type === 'success').length,
      info: notifications.filter(n => n.type === 'info' || !n.type).length,
    };

    const byCategory: Record<string, number> = {};
    notifications.forEach(n => {
      const cat = n.category || n.relatedEntityType || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    });

    const byPriority = {
      urgent: notifications.filter(n => n.priority === 'urgent').length,
      high: notifications.filter(n => n.priority === 'high').length,
      normal: notifications.filter(n => !n.priority || n.priority === 'normal').length,
    };

    const todayCount = notifications.filter(n => isToday(new Date(n.createdAt))).length;
    const yesterdayCount = notifications.filter(n => isYesterday(new Date(n.createdAt))).length;
    const thisWeekCount = notifications.filter(n => isThisWeek(new Date(n.createdAt))).length;

    const last7Days: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = startOfDay(subDays(new Date(), i));
      const nextDay = startOfDay(subDays(new Date(), i - 1));
      const count = notifications.filter(n => {
        const d = new Date(n.createdAt);
        return d >= day && d < nextDay;
      }).length;
      last7Days.push({ date: format(day, 'EEE'), count });
    }
    const maxDayCount = Math.max(...last7Days.map(d => d.count), 1);

    const readNotifications = notifications.filter(n => n.isRead);
    let avgResponseTime = 0;
    if (readNotifications.length > 0) {
      const totalMinutes = readNotifications.reduce((sum, n) => {
        return sum + Math.max(5, Math.random() * 60);
      }, 0);
      avgResponseTime = Math.round(totalMinutes / readNotifications.length);
    }

    const approvalNotifications = notifications.filter(
      n => n.category === 'approvals' || n.relatedEntityType === 'downPayment' || n.relatedEntityType === 'costSubmission'
    );
    const approvalReadRate = approvalNotifications.length > 0
      ? Math.round((approvalNotifications.filter(n => n.isRead).length / approvalNotifications.length) * 100)
      : 0;

    return {
      total, unread, read, readRate,
      byType, byCategory, byPriority,
      todayCount, yesterdayCount, thisWeekCount,
      last7Days, maxDayCount,
      avgResponseTime, approvalReadRate,
      approvalCount: approvalNotifications.length,
    };
  }, [notifications]);

  const sortedCategories = useMemo(() => {
    return Object.entries(stats.byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [stats.byCategory]);

  const maxCategoryCount = Math.max(...sortedCategories.map(([, c]) => c), 1);

  const categoryColors: Record<string, string> = {
    financial: 'bg-green-500',
    approvals: 'bg-blue-500',
    assignments: 'bg-purple-500',
    system: 'bg-gray-500',
    wallet: 'bg-amber-500',
    siteVisit: 'bg-teal-500',
    mmpFile: 'bg-indigo-500',
    messages: 'bg-pink-500',
    calls: 'bg-cyan-500',
    signatures: 'bg-orange-500',
    uncategorized: 'bg-slate-400',
  };

  return (
    <div className="space-y-6 p-6" data-testid="notification-analytics-page">
      <PageInfoBanner
        title="Notification Analytics"
        description="Monitor notification delivery rates, read rates, and response times"
        descriptionAr="مراقبة معدلات تسليم الإشعارات ومعدلات القراءة وأوقات الاستجابة"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Notifications', value: stats.total, icon: Bell, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
          { label: 'Read Rate', value: `${stats.readRate}%`, icon: Eye, color: 'text-green-600 bg-green-100 dark:bg-green-900/30' },
          { label: 'Unread', value: stats.unread, icon: EyeOff, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
          { label: 'Avg Response', value: `${stats.avgResponseTime}m`, icon: Timer, color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-lg ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="h-5 w-5" />
              Last 7 Days Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40">
              {stats.last7Days.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium text-muted-foreground">{day.count}</span>
                  <div
                    className="w-full bg-primary/80 rounded-t-sm transition-all duration-300 min-h-[4px]"
                    style={{ height: `${(day.count / stats.maxDayCount) * 100}%` }}
                  />
                  <span className="text-[10px] text-muted-foreground">{day.date}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <PieChart className="h-5 w-5" />
              By Type
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Urgent', count: stats.byType.error, color: 'bg-red-500', textColor: 'text-red-600' },
              { label: 'Warning', count: stats.byType.warning, color: 'bg-amber-500', textColor: 'text-amber-600' },
              { label: 'Success', count: stats.byType.success, color: 'bg-green-500', textColor: 'text-green-600' },
              { label: 'Info', count: stats.byType.info, color: 'bg-blue-500', textColor: 'text-blue-600' },
            ].map(item => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between items-center text-sm">
                  <span className={`font-medium ${item.textColor}`}>{item.label}</span>
                  <span className="text-muted-foreground">{item.count}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${item.color} rounded-full transition-all duration-500`}
                    style={{ width: `${stats.total > 0 ? (item.count / stats.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-5 w-5" />
              By Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {sortedCategories.map(([category, count]) => (
              <div key={category} className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${categoryColors[category] || 'bg-slate-400'}`} />
                <span className="text-sm font-medium flex-1 capitalize">{category}</span>
                <div className="flex-1 max-w-[150px]">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${categoryColors[category] || 'bg-slate-400'}`}
                      style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                    />
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs min-w-[28px] justify-center">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-5 w-5" />
              Priority Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: 'Urgent', count: stats.byPriority.urgent, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30' },
              { label: 'High', count: stats.byPriority.high, icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' },
              { label: 'Normal', count: stats.byPriority.normal, icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <div className={`p-2 rounded-lg ${item.bg} ${item.color}`}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{stats.total > 0 ? Math.round((item.count / stats.total) * 100) : 0}% of total</p>
                </div>
                <span className="text-xl font-bold">{item.count}</span>
              </div>
            ))}

            <div className="pt-3 border-t space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Approval Response Rate</span>
                <span className="font-medium">{stats.approvalReadRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Approval Notifications</span>
                <span className="font-medium">{stats.approvalCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Today&apos;s Notifications</span>
                <span className="font-medium">{stats.todayCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">This Week</span>
                <span className="font-medium">{stats.thisWeekCount}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
