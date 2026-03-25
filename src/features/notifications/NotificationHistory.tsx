import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/features/notifications/context/NotificationContext';
import { useNavigate } from 'react-router-dom';
import { Notification } from '@/types';
import { format, isToday, isYesterday, isThisWeek, isThisMonth, subDays } from 'date-fns';
import { Bell, Search, Download, Filter, Clock, AlertCircle, AlertTriangle, CheckCircle2, Info, ChevronRight, Calendar, X, Eye, EyeOff, Trash2 } from 'lucide-react';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

const ITEMS_PER_PAGE = 25;

export default function NotificationHistory() {
  const { notifications, markNotificationAsRead, clearAllNotifications } = useNotifications();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [dateRange, setDateRange] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredNotifications = useMemo(() => {
    let filtered = [...notifications];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q)
      );
    }

    if (categoryFilter !== 'all') {
      filtered = filtered.filter(n => n.category === categoryFilter || n.relatedEntityType === categoryFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(n => n.type === typeFilter);
    }

    if (readFilter === 'unread') {
      filtered = filtered.filter(n => !n.isRead);
    } else if (readFilter === 'read') {
      filtered = filtered.filter(n => n.isRead);
    }

    if (dateRange !== 'all') {
      const now = new Date();
      let cutoff: Date;
      switch (dateRange) {
        case 'today': cutoff = subDays(now, 1); break;
        case 'week': cutoff = subDays(now, 7); break;
        case 'month': cutoff = subDays(now, 30); break;
        case '3months': cutoff = subDays(now, 90); break;
        default: cutoff = new Date(0);
      }
      filtered = filtered.filter(n => new Date(n.createdAt) >= cutoff);
    }

    return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications, searchQuery, categoryFilter, typeFilter, readFilter, dateRange]);

  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  const paginatedNotifications = filteredNotifications.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      error: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
      success: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
      info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300',
    };
    return <Badge className={`text-[10px] ${colors[type] || colors.info}`}>{type}</Badge>;
  };

  const exportNotifications = () => {
    const csv = [
      ['Date', 'Title', 'Message', 'Type', 'Category', 'Priority', 'Read'].join(','),
      ...filteredNotifications.map(n => [
        format(new Date(n.createdAt), 'yyyy-MM-dd HH:mm'),
        `"${n.title.replace(/"/g, '""')}"`,
        `"${n.message.replace(/"/g, '""')}"`,
        n.type,
        n.category || '',
        n.priority || '',
        n.isRead ? 'Yes' : 'No',
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `notifications-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stats = useMemo(() => ({
    total: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    urgent: notifications.filter(n => n.type === 'error' || n.priority === 'urgent').length,
    today: notifications.filter(n => isToday(new Date(n.createdAt))).length,
  }), [notifications]);

  return (
    <div className="space-y-6 p-6" data-testid="notification-history-page">
      <PageInfoBanner
        title="Notification History"
        description="View and manage all your past notifications"
        descriptionAr="عرض وإدارة جميع إشعاراتك السابقة"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, icon: Bell, color: 'text-blue-600' },
          { label: 'Unread', value: stats.unread, icon: EyeOff, color: 'text-red-600' },
          { label: 'Urgent', value: stats.urgent, icon: AlertCircle, color: 'text-amber-600' },
          { label: 'Today', value: stats.today, icon: Calendar, color: 'text-green-600' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                <stat.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
            <Button variant="outline" size="sm" onClick={exportNotifications} data-testid="button-export">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative lg:col-span-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="pl-8"
                data-testid="input-history-search"
              />
            </div>
            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-category-filter">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="financial">Financial</SelectItem>
                <SelectItem value="approvals">Approvals</SelectItem>
                <SelectItem value="assignments">Assignments</SelectItem>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="wallet">Wallet</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="error">Urgent</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Select value={readFilter} onValueChange={(v) => { setReadFilter(v); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-read-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={(v) => { setDateRange(v); setCurrentPage(1); }}>
              <SelectTrigger data-testid="select-date-range">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="3months">Last 3 Months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {paginatedNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Bell className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No notifications found</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Try adjusting your filters</p>
              </div>
            ) : (
              paginatedNotifications.map(notification => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                    !notification.isRead ? 'bg-primary/5' : ''
                  }`}
                  onClick={() => {
                    markNotificationAsRead(notification.id);
                    if (notification.link) navigate(notification.link);
                  }}
                  data-testid={`notification-row-${notification.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {getNotificationIcon(notification.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm font-medium ${!notification.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {notification.title}
                          </h4>
                          {!notification.isRead && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {getTypeBadge(notification.type)}
                          {notification.priority && notification.priority !== 'normal' && (
                            <Badge variant="outline" className="text-[10px]">{notification.priority}</Badge>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{notification.message}</p>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(notification.createdAt), 'MMM d, yyyy HH:mm')}
                        </span>
                        {notification.category && (
                          <Badge variant="secondary" className="text-[10px]">{notification.category}</Badge>
                        )}
                        {notification.link && (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)} of {filteredNotifications.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
