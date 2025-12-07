import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  CheckCheck, 
  Trash2, 
  Link as LinkIcon,
  ArrowLeft,
  Calendar,
  DollarSign,
  MapPin,
  Users,
  AlertCircle,
  CheckCircle,
  Info,
  MessageSquare,
  FileText,
  Clock,
  Filter
} from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek, parseISO } from 'date-fns';

const getNotificationIcon = (type?: string, title?: string) => {
  const lowerTitle = (title || '').toLowerCase();
  
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet') || lowerTitle.includes('cost') || lowerTitle.includes('budget')) {
    return <DollarSign className="h-4 w-4" />;
  }
  if (lowerTitle.includes('visit') || lowerTitle.includes('site') || lowerTitle.includes('location')) {
    return <MapPin className="h-4 w-4" />;
  }
  if (lowerTitle.includes('user') || lowerTitle.includes('team') || lowerTitle.includes('assigned')) {
    return <Users className="h-4 w-4" />;
  }
  if (lowerTitle.includes('message') || lowerTitle.includes('chat')) {
    return <MessageSquare className="h-4 w-4" />;
  }
  if (lowerTitle.includes('document') || lowerTitle.includes('file') || lowerTitle.includes('report')) {
    return <FileText className="h-4 w-4" />;
  }
  if (lowerTitle.includes('schedule') || lowerTitle.includes('calendar') || lowerTitle.includes('reminder')) {
    return <Calendar className="h-4 w-4" />;
  }
  if (lowerTitle.includes('approved') || lowerTitle.includes('success') || lowerTitle.includes('complete')) {
    return <CheckCircle className="h-4 w-4" />;
  }
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('warning') || lowerTitle.includes('error')) {
    return <AlertCircle className="h-4 w-4" />;
  }
  
  return <Info className="h-4 w-4" />;
};

const getNotificationColor = (title?: string) => {
  const lowerTitle = (title || '').toLowerCase();
  
  if (lowerTitle.includes('approved') || lowerTitle.includes('success') || lowerTitle.includes('complete')) {
    return 'bg-green-500/10 text-green-600 dark:text-green-400';
  }
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('error') || lowerTitle.includes('rejected')) {
    return 'bg-red-500/10 text-red-600 dark:text-red-400';
  }
  if (lowerTitle.includes('warning') || lowerTitle.includes('pending')) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400';
  }
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet')) {
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  }
  
  return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
};

const formatNotificationDate = (iso?: string) => {
  if (!iso) return '';
  try {
    const date = parseISO(iso);
    if (isToday(date)) {
      return format(date, 'h:mm a');
    } else if (isYesterday(date)) {
      return 'Yesterday ' + format(date, 'h:mm a');
    } else if (isThisWeek(date)) {
      return format(date, 'EEEE h:mm a');
    }
    return format(date, 'MMM d, h:mm a');
  } catch {
    return iso;
  }
};

const groupNotificationsByDate = (notifications: any[]) => {
  const groups: { [key: string]: any[] } = {
    'Today': [],
    'Yesterday': [],
    'This Week': [],
    'Earlier': []
  };
  
  notifications.forEach(n => {
    if (!n.createdAt) {
      groups['Earlier'].push(n);
      return;
    }
    
    try {
      const date = parseISO(n.createdAt);
      if (isToday(date)) {
        groups['Today'].push(n);
      } else if (isYesterday(date)) {
        groups['Yesterday'].push(n);
      } else if (isThisWeek(date)) {
        groups['This Week'].push(n);
      } else {
        groups['Earlier'].push(n);
      }
    } catch {
      groups['Earlier'].push(n);
    }
  });
  
  return groups;
};

const Notifications: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, markNotificationAsRead, clearAllNotifications } = useNotifications();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  
  const filteredNotifications = useMemo(() => {
    if (activeTab === 'unread') {
      return notifications.filter(n => !n.isRead);
    }
    return notifications;
  }, [notifications, activeTab]);
  
  const groupedNotifications = useMemo(() => 
    groupNotificationsByDate(filteredNotifications), 
    [filteredNotifications]
  );

  const handleOpen = async (id: string, link?: string) => {
    await markNotificationAsRead(id);
    if (link) navigate(link);
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.isRead);
    for (const n of unread) {
      markNotificationAsRead(n.id);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearAllNotifications();
    } catch (e) {
      console.warn('Failed to clear notifications', e);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-2xl" data-testid="notifications-page">
      <div className="flex items-center gap-3 mb-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          data-testid="button-go-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold" data-testid="text-page-title">Notifications</h1>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 text-[10px]" data-testid="badge-unread">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Stay updated on activities</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'unread')} className="flex-1">
          <TabsList className="h-9">
            <TabsTrigger value="all" className="text-xs gap-1.5" data-testid="tab-all">
              <Bell className="h-3.5 w-3.5" />
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs gap-1.5" data-testid="tab-unread">
              <Clock className="h-3.5 w-3.5" />
              Unread
              {unreadCount > 0 && (
                <Badge variant="secondary" className="h-4 ml-1 px-1 text-[10px]">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-1.5">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={markAllAsRead} 
            disabled={unreadCount === 0}
            className="h-9 text-xs gap-1.5"
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Mark all read</span>
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearAll}
            className="h-9 text-xs gap-1.5 text-destructive hover:text-destructive"
            data-testid="button-clear-all"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
        </div>
      </div>

      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground">
              {activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeTab === 'unread' ? 'You\'re all caught up!' : 'Activities will appear here'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-4 pb-4">
            {Object.entries(groupedNotifications).map(([dateGroup, items]) => {
              if (items.length === 0) return null;
              
              return (
                <div key={dateGroup}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {dateGroup}
                    </span>
                    <div className="flex-1 h-px bg-border" />
                    <Badge variant="secondary" className="h-4 text-[10px]">
                      {items.length}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1.5">
                    {items.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleOpen(n.id, n.link)}
                        className="w-full text-left group"
                        data-testid={`notification-${n.id}`}
                      >
                        <Card className={`transition-all ${
                          !n.isRead 
                            ? 'border-primary/30 bg-primary/5 dark:bg-primary/10' 
                            : 'hover:bg-muted/50'
                        }`}>
                          <CardContent className="py-3 px-4">
                            <div className="flex items-start gap-3">
                              <div className={`p-2 rounded-lg shrink-0 ${getNotificationColor(n.title)}`}>
                                {getNotificationIcon(n.type, n.title)}
                              </div>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-sm font-medium truncate ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {n.title}
                                      </span>
                                      {n.link && (
                                        <LinkIcon className="h-3 w-3 text-primary shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                      )}
                                    </div>
                                    {n.message && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                        {n.message}
                                      </p>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-2 shrink-0">
                                    {!n.isRead && (
                                      <div className="w-2 h-2 rounded-full bg-primary" />
                                    )}
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                      {formatNotificationDate(n.createdAt)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default Notifications;
