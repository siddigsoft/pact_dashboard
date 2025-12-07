import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
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
  Filter,
  Search,
  Send,
  Plus,
  Phone,
  PhoneMissed,
  Zap,
  Mail,
  Megaphone,
  Settings,
  Star,
  Archive,
  RefreshCw
} from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek, parseISO } from 'date-fns';

const NOTIFICATION_CATEGORIES = [
  { id: 'all', label: 'All', icon: Bell, count: 0 },
  { id: 'urgent', label: 'Urgent', icon: AlertCircle, count: 0, color: 'text-red-600' },
  { id: 'messages', label: 'Messages', icon: MessageSquare, count: 0, color: 'text-blue-600' },
  { id: 'calls', label: 'Calls', icon: Phone, count: 0, color: 'text-green-600' },
  { id: 'tasks', label: 'Tasks', icon: CheckCircle, count: 0, color: 'text-purple-600' },
  { id: 'updates', label: 'Updates', icon: RefreshCw, count: 0, color: 'text-amber-600' },
];

const SEND_NOTIFICATION_TEMPLATES = [
  { 
    id: 1, 
    title: "Missed Call Follow-up", 
    message: "I tried calling you earlier. Please call back when available.",
    icon: PhoneMissed,
    color: 'bg-red-500/10 text-red-600'
  },
  { 
    id: 2, 
    title: "Quick Reminder", 
    message: "Just a friendly reminder about our scheduled meeting.",
    icon: Clock,
    color: 'bg-amber-500/10 text-amber-600'
  },
  { 
    id: 3, 
    title: "Action Required", 
    message: "Your input is needed on an urgent matter. Please respond.",
    icon: Zap,
    color: 'bg-orange-500/10 text-orange-600'
  },
  { 
    id: 4, 
    title: "Task Assignment", 
    message: "You have been assigned a new task. Please review the details.",
    icon: FileText,
    color: 'bg-blue-500/10 text-blue-600'
  },
  { 
    id: 5, 
    title: "Meeting Request", 
    message: "Would like to schedule a call to discuss project updates.",
    icon: Calendar,
    color: 'bg-purple-500/10 text-purple-600'
  },
  { 
    id: 6, 
    title: "Approval Needed", 
    message: "An item requires your approval. Please review at your earliest.",
    icon: CheckCircle,
    color: 'bg-green-500/10 text-green-600'
  },
];

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
  if (lowerTitle.includes('call') || lowerTitle.includes('missed')) {
    return <Phone className="h-4 w-4" />;
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
    return 'bg-green-500/25 text-green-700 dark:bg-green-500/30 dark:text-green-300';
  }
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('error') || lowerTitle.includes('rejected') || lowerTitle.includes('missed')) {
    return 'bg-red-500/25 text-red-700 dark:bg-red-500/30 dark:text-red-300';
  }
  if (lowerTitle.includes('warning') || lowerTitle.includes('pending')) {
    return 'bg-amber-500/25 text-amber-700 dark:bg-amber-500/30 dark:text-amber-300';
  }
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet')) {
    return 'bg-emerald-500/25 text-emerald-700 dark:bg-emerald-500/30 dark:text-emerald-300';
  }
  if (lowerTitle.includes('call')) {
    return 'bg-purple-500/25 text-purple-700 dark:bg-purple-500/30 dark:text-purple-300';
  }
  
  return 'bg-blue-500/25 text-blue-700 dark:bg-blue-500/30 dark:text-blue-300';
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
  const { notifications, markNotificationAsRead, clearAllNotifications, addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof SEND_NOTIFICATION_TEMPLATES[0] | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [customMessage, setCustomMessage] = useState('');

  const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
  
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;
    
    if (activeTab === 'unread') {
      filtered = filtered.filter(n => !n.isRead);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n => 
        n.title?.toLowerCase().includes(query) || 
        n.message?.toLowerCase().includes(query)
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => {
        const title = (n.title || '').toLowerCase();
        switch (selectedCategory) {
          case 'urgent':
            return title.includes('urgent') || title.includes('alert') || title.includes('error');
          case 'messages':
            return title.includes('message') || title.includes('chat');
          case 'calls':
            return title.includes('call') || title.includes('missed');
          case 'tasks':
            return title.includes('task') || title.includes('assigned') || title.includes('complete');
          case 'updates':
            return title.includes('update') || title.includes('change') || title.includes('new');
          default:
            return true;
        }
      });
    }
    
    return filtered;
  }, [notifications, activeTab, searchQuery, selectedCategory]);
  
  const groupedNotifications = useMemo(() => 
    groupNotificationsByDate(filteredNotifications), 
    [filteredNotifications]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notifications.length };
    notifications.forEach(n => {
      const title = (n.title || '').toLowerCase();
      if (title.includes('urgent') || title.includes('alert')) counts['urgent'] = (counts['urgent'] || 0) + 1;
      if (title.includes('message') || title.includes('chat')) counts['messages'] = (counts['messages'] || 0) + 1;
      if (title.includes('call')) counts['calls'] = (counts['calls'] || 0) + 1;
      if (title.includes('task') || title.includes('assigned')) counts['tasks'] = (counts['tasks'] || 0) + 1;
      if (title.includes('update')) counts['updates'] = (counts['updates'] || 0) + 1;
    });
    return counts;
  }, [notifications]);

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

  const handleSendNotification = () => {
    const title = customTitle || selectedTemplate?.title || '';
    const message = customMessage || selectedTemplate?.message || '';
    
    if (title && message) {
      addNotification({
        userId: 'demo-user',
        title,
        message,
        type: 'info',
      });
      setShowSendDialog(false);
      setSelectedTemplate(null);
      setCustomTitle('');
      setCustomMessage('');
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-3xl uber-font" data-testid="notifications-page">
      <div className="flex items-center gap-3 mb-4">
        <Button 
          variant="ghost" 
          size="icon"
          className="uber-icon-btn"
          onClick={() => navigate(-1)}
          data-testid="button-go-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h1 className="uber-heading text-xl" data-testid="text-page-title">Notifications</h1>
            {unreadCount > 0 && (
              <span className="uber-pill uber-pill-danger text-[10px]" data-testid="badge-unread">
                {unreadCount} new
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Stay updated on activities</p>
        </div>
        <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 h-8" data-testid="button-send-notification">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Send</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                Send Notification
              </DialogTitle>
              <DialogDescription>
                Choose a template or create a custom notification
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Templates</div>
                <div className="grid grid-cols-2 gap-2">
                  {SEND_NOTIFICATION_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        selectedTemplate?.id === template.id 
                          ? 'border-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => {
                        setSelectedTemplate(template);
                        setCustomTitle(template.title);
                        setCustomMessage(template.message);
                      }}
                      data-testid={`notification-template-${template.id}`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded-md ${template.color}`}>
                          <template.icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-xs truncate">{template.title}</div>
                          <div className="text-[10px] text-muted-foreground line-clamp-2">{template.message}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Title</label>
                  <Input
                    placeholder="Notification title..."
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="mt-1"
                    data-testid="input-notification-title"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Message</label>
                  <textarea
                    placeholder="Notification message..."
                    className="w-full min-h-[80px] mt-1 p-3 rounded-lg border bg-muted/50 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    data-testid="input-notification-message"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowSendDialog(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSendNotification}
                  disabled={!customTitle || !customMessage}
                  className="gap-2"
                  data-testid="button-confirm-send"
                >
                  <Send className="h-4 w-4" />
                  Send Notification
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-3 mb-3">
        {NOTIFICATION_CATEGORIES.map((category) => (
          <button
            key={category.id}
            className={`uber-pill gap-1.5 whitespace-nowrap shrink-0 ${selectedCategory === category.id ? 'uber-pill-dark' : 'uber-pill-light'}`}
            onClick={() => setSelectedCategory(category.id)}
            data-testid={`category-${category.id}`}
          >
            <category.icon className={`h-3 w-3 ${selectedCategory !== category.id ? category.color : ''}`} />
            {category.label}
            {categoryCounts[category.id] > 0 && (
              <span className="bg-white/20 dark:bg-black/20 px-1.5 py-0.5 rounded-full text-[9px] ml-1">
                {categoryCounts[category.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search notifications..."
            className="uber-search pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'unread')}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-7 px-2" data-testid="tab-all">
              All
            </TabsTrigger>
            <TabsTrigger value="unread" className="text-xs h-7 px-2" data-testid="tab-unread">
              Unread
              {unreadCount > 0 && (
                <Badge variant="destructive" className="h-4 ml-1 px-1 text-[9px]">
                  {unreadCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs text-muted-foreground">
          {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1.5">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={markAllAsRead} 
            disabled={unreadCount === 0}
            className="h-7 text-xs gap-1"
            data-testid="button-mark-all-read"
          >
            <CheckCheck className="h-3 w-3" />
            Mark all read
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearAll}
            className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
            data-testid="button-clear-all"
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </Button>
        </div>
      </div>

      {filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="font-medium text-muted-foreground">
              {searchQuery ? 'No matching notifications' : activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {searchQuery ? 'Try a different search term' : activeTab === 'unread' ? 'You\'re all caught up!' : 'Activities will appear here'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[calc(100vh-320px)]">
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
                                
                                <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                                    <MessageSquare className="h-3 w-3" />
                                    Reply
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                                    <Archive className="h-3 w-3" />
                                    Archive
                                  </Button>
                                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 px-2">
                                    <Star className="h-3 w-3" />
                                    Star
                                  </Button>
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

      <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t">
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5"
          onClick={() => navigate('/chat')}
          data-testid="button-go-to-messages"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Messages
        </Button>
        <Button 
          variant="outline" 
          size="sm" 
          className="gap-1.5"
          onClick={() => navigate('/calls')}
          data-testid="button-go-to-calls"
        >
          <Phone className="h-3.5 w-3.5" />
          Calls
        </Button>
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-1.5"
          data-testid="button-notification-settings"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Button>
      </div>
    </div>
  );
};

export default Notifications;
