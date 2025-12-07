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
    <div className="uber-page uber-font" data-testid="notifications-page">
      <div className="uber-page-content">
        <div className="uber-page-header uber-slide-in-down">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate(-1)}
              className="uber-icon-btn"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl uber-heading" data-testid="text-page-title">Notifications</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground uber-text">Stay updated on activities</span>
                {unreadCount > 0 && (
                  <span className="uber-pill uber-pill-danger text-[10px]" data-testid="badge-unread">
                    {unreadCount} new
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
              <DialogTrigger asChild>
                <button className="uber-icon-btn" data-testid="button-send-notification">
                  <Plus className="h-5 w-5" />
                </button>
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
        </div>

        <div className="flex gap-2 overflow-x-auto pb-3 mb-3 uber-slide-in-up uber-stagger-1">
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

        <div className="relative uber-slide-in-up uber-stagger-2">
          <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search notifications..."
            className="uber-search pl-12"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

        <div className="uber-tabs uber-slide-in-up uber-stagger-3">
          <button 
            className={`uber-tab flex-1 ${activeTab === 'all' ? 'uber-tab-active' : ''}`}
            onClick={() => setActiveTab('all')}
            data-testid="tab-all"
          >
            All
          </button>
          <button 
            className={`uber-tab flex-1 ${activeTab === 'unread' ? 'uber-tab-active' : ''}`}
            onClick={() => setActiveTab('unread')}
            data-testid="tab-unread"
          >
            Unread
            {unreadCount > 0 && (
              <span className="uber-pill uber-pill-danger ml-2 text-[10px]">{unreadCount}</span>
            )}
          </button>
        </div>

        <div className="uber-section-header uber-slide-in-up uber-stagger-4">
          <span className="text-xs text-muted-foreground uber-text">
            {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={markAllAsRead} 
              disabled={unreadCount === 0}
              className="uber-icon-btn p-2 disabled:opacity-50"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4" />
            </button>
            <button 
              onClick={handleClearAll}
              className="uber-icon-btn p-2 text-red-500"
              data-testid="button-clear-all"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {filteredNotifications.length === 0 ? (
          <div className="uber-card-elevated text-center py-12 uber-slide-in-up uber-stagger-5">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="uber-heading text-muted-foreground">
              {searchQuery ? 'No matching notifications' : activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-muted-foreground uber-text mt-1">
              {searchQuery ? 'Try a different search term' : activeTab === 'unread' ? 'You\'re all caught up!' : 'Activities will appear here'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[calc(100vh-400px)] uber-slide-in-up uber-stagger-5">
            <div className="space-y-4 pb-4">
              {Object.entries(groupedNotifications).map(([dateGroup, items]) => {
                if (items.length === 0) return null;
                
                return (
                  <div key={dateGroup}>
                    <div className="uber-section-header mb-2">
                      <span className="text-xs uber-heading text-muted-foreground uppercase tracking-wide">
                        {dateGroup}
                      </span>
                      <span className="uber-pill uber-pill-light text-[10px]">
                        {items.length}
                      </span>
                    </div>
                    
                    <div className="space-y-1.5">
                      {items.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleOpen(n.id, n.link)}
                          className={`uber-notification-card ${!n.isRead ? 'unread' : ''}`}
                          data-testid={`notification-${n.id}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl shrink-0 ${getNotificationColor(n.title)}`}>
                              {getNotificationIcon(n.type, n.title)}
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className={`uber-heading text-sm truncate ${!n.isRead ? 'text-foreground' : 'text-muted-foreground'}`}>
                                      {n.title}
                                    </span>
                                    {n.link && (
                                      <LinkIcon className="h-3 w-3 text-primary shrink-0" />
                                    )}
                                  </div>
                                  {n.message && (
                                    <p className="text-xs text-muted-foreground uber-text mt-0.5 line-clamp-2">
                                      {n.message}
                                    </p>
                                  )}
                                </div>
                                
                                <div className="flex items-center gap-2 shrink-0">
                                  {!n.isRead && (
                                    <div className="w-2 h-2 rounded-full bg-foreground" />
                                  )}
                                  <span className="text-[10px] text-muted-foreground uber-text whitespace-nowrap">
                                    {formatNotificationDate(n.createdAt)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t uber-slide-in-up uber-stagger-6">
          <button
            onClick={() => navigate('/chat')}
            className="uber-btn uber-btn-outline"
            data-testid="button-go-to-messages"
          >
            <MessageSquare className="h-4 w-4" />
            Messages
          </button>
          <button
            onClick={() => navigate('/calls')}
            className="uber-btn uber-btn-outline"
            data-testid="button-go-to-calls"
          >
            <Phone className="h-4 w-4" />
            Calls
          </button>
          <button
            className="uber-btn uber-btn-ghost"
            data-testid="button-notification-settings"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
