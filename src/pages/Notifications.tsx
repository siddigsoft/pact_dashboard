import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Search,
  Send,
  Plus,
  Phone,
  PhoneMissed,
  Zap,
  Megaphone,
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
  { id: 1, title: "Missed Call Follow-up", message: "I tried calling you earlier. Please call back when available.", icon: PhoneMissed, color: 'bg-red-500/10 text-red-600' },
  { id: 2, title: "Quick Reminder", message: "Just a friendly reminder about our scheduled meeting.", icon: Clock, color: 'bg-amber-500/10 text-amber-600' },
  { id: 3, title: "Action Required", message: "Your input is needed on an urgent matter. Please respond.", icon: Zap, color: 'bg-orange-500/10 text-orange-600' },
  { id: 4, title: "Task Assignment", message: "You have been assigned a new task. Please review the details.", icon: FileText, color: 'bg-blue-500/10 text-blue-600' },
  { id: 5, title: "Meeting Request", message: "Would like to schedule a call to discuss project updates.", icon: Calendar, color: 'bg-purple-500/10 text-purple-600' },
  { id: 6, title: "Approval Needed", message: "An item requires your approval. Please review at your earliest.", icon: CheckCircle, color: 'bg-green-500/10 text-green-600' },
];

const getNotificationIcon = (type?: string, title?: string) => {
  const lowerTitle = (title || '').toLowerCase();
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet') || lowerTitle.includes('cost') || lowerTitle.includes('budget')) return <DollarSign className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('visit') || lowerTitle.includes('site') || lowerTitle.includes('location')) return <MapPin className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('user') || lowerTitle.includes('team') || lowerTitle.includes('assigned')) return <Users className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('message') || lowerTitle.includes('chat')) return <MessageSquare className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('call') || lowerTitle.includes('missed')) return <Phone className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('document') || lowerTitle.includes('file') || lowerTitle.includes('report')) return <FileText className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('schedule') || lowerTitle.includes('calendar') || lowerTitle.includes('reminder')) return <Calendar className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('approved') || lowerTitle.includes('success') || lowerTitle.includes('complete')) return <CheckCircle className="h-3.5 w-3.5" />;
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('warning') || lowerTitle.includes('error')) return <AlertCircle className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
};

const getNotificationColor = (title?: string) => {
  const lowerTitle = (title || '').toLowerCase();
  if (lowerTitle.includes('approved') || lowerTitle.includes('success') || lowerTitle.includes('complete')) return 'bg-green-500/20 text-green-700 dark:text-green-400';
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('error') || lowerTitle.includes('rejected') || lowerTitle.includes('missed')) return 'bg-red-500/20 text-red-700 dark:text-red-400';
  if (lowerTitle.includes('warning') || lowerTitle.includes('pending')) return 'bg-amber-500/20 text-amber-700 dark:text-amber-400';
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet')) return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400';
  if (lowerTitle.includes('call')) return 'bg-purple-500/20 text-purple-700 dark:text-purple-400';
  return 'bg-blue-500/20 text-blue-700 dark:text-blue-400';
};

const formatNotificationDate = (iso?: string) => {
  if (!iso) return '';
  try {
    const date = parseISO(iso);
    if (isToday(date)) return format(date, 'h:mm a');
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return format(date, 'EEE');
    return format(date, 'MMM d');
  } catch { return iso; }
};

const groupNotificationsByDate = (notifications: any[]) => {
  const groups: { [key: string]: any[] } = { 'Today': [], 'Yesterday': [], 'This Week': [], 'Earlier': [] };
  notifications.forEach(n => {
    if (!n.createdAt) { groups['Earlier'].push(n); return; }
    try {
      const date = parseISO(n.createdAt);
      if (isToday(date)) groups['Today'].push(n);
      else if (isYesterday(date)) groups['Yesterday'].push(n);
      else if (isThisWeek(date)) groups['This Week'].push(n);
      else groups['Earlier'].push(n);
    } catch { groups['Earlier'].push(n); }
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
    if (activeTab === 'unread') filtered = filtered.filter(n => !n.isRead);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n => n.title?.toLowerCase().includes(query) || n.message?.toLowerCase().includes(query));
    }
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(n => {
        const title = (n.title || '').toLowerCase();
        switch (selectedCategory) {
          case 'urgent': return title.includes('urgent') || title.includes('alert') || title.includes('error');
          case 'messages': return title.includes('message') || title.includes('chat');
          case 'calls': return title.includes('call') || title.includes('missed');
          case 'tasks': return title.includes('task') || title.includes('assigned') || title.includes('complete');
          case 'updates': return title.includes('update') || title.includes('change') || title.includes('new');
          default: return true;
        }
      });
    }
    return filtered;
  }, [notifications, activeTab, searchQuery, selectedCategory]);
  
  const groupedNotifications = useMemo(() => groupNotificationsByDate(filteredNotifications), [filteredNotifications]);

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
    for (const n of unread) markNotificationAsRead(n.id);
  };

  const handleClearAll = async () => {
    try { await clearAllNotifications(); } catch (e) { console.warn('Failed to clear notifications', e); }
  };

  const handleSendNotification = () => {
    const title = customTitle || selectedTemplate?.title || '';
    const message = customMessage || selectedTemplate?.message || '';
    if (title && message) {
      addNotification({ userId: 'demo-user', title, message, type: 'info' });
      setShowSendDialog(false);
      setSelectedTemplate(null);
      setCustomTitle('');
      setCustomMessage('');
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full flex flex-col bg-white dark:bg-black overflow-hidden" data-testid="notifications-page">
      {/* Compact Header */}
      <div className="shrink-0 bg-black px-4 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white" data-testid="text-page-title">Notifications</h1>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-white/60">Stay updated</span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold" data-testid="badge-unread">
                    {unreadCount} new
                  </span>
                )}
              </div>
            </div>
          </div>
          <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
            <DialogTrigger asChild>
              <button className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-colors" data-testid="button-send-notification">
                <Plus className="h-4 w-4 text-black" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-base font-bold">
                  <Megaphone className="h-4 w-4" />
                  Send Notification
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Choose a template or create custom
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <div>
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Templates</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SEND_NOTIFICATION_TEMPLATES.map((template) => (
                      <button
                        key={template.id}
                        className={`text-left p-2 rounded-lg border transition-colors ${
                          selectedTemplate?.id === template.id ? 'border-black dark:border-white bg-gray-50 dark:bg-gray-900' : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'
                        }`}
                        onClick={() => { setSelectedTemplate(template); setCustomTitle(template.title); setCustomMessage(template.message); }}
                        data-testid={`notification-template-${template.id}`}
                      >
                        <div className="flex items-start gap-1.5">
                          <div className={`p-1 rounded ${template.color}`}>
                            <template.icon className="h-3 w-3" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-[10px] truncate text-black dark:text-white">{template.title}</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Title</label>
                    <input
                      placeholder="Notification title..."
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full h-8 mt-1 px-2 rounded-lg bg-gray-100 dark:bg-gray-900 text-sm focus:outline-none"
                      data-testid="input-notification-title"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Message</label>
                    <textarea
                      placeholder="Notification message..."
                      className="w-full min-h-[60px] mt-1 p-2 rounded-lg bg-gray-100 dark:bg-gray-900 text-xs resize-none focus:outline-none"
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      data-testid="input-notification-message"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setShowSendDialog(false)} className="h-8 px-3 rounded-full border border-gray-200 dark:border-gray-800 text-xs font-medium">
                    Cancel
                  </button>
                  <button 
                    onClick={handleSendNotification}
                    disabled={!customTitle || !customMessage}
                    className="h-8 px-3 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-semibold disabled:opacity-50 flex items-center gap-1"
                    data-testid="button-confirm-send"
                  >
                    <Send className="h-3 w-3" />
                    Send
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex-1 overflow-auto overflow-x-hidden p-3 space-y-2">
        {/* Category Pills - Compact */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {NOTIFICATION_CATEGORIES.map((category) => (
            <button
              key={category.id}
              className={`px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 flex items-center gap-1 transition-colors ${
                selectedCategory === category.id 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400'
              }`}
              onClick={() => setSelectedCategory(category.id)}
              data-testid={`category-${category.id}`}
            >
              <category.icon className={`h-3 w-3 ${selectedCategory !== category.id ? category.color : ''}`} />
              {category.label}
              {categoryCounts[category.id] > 0 && (
                <span className={`px-1 py-0.5 rounded-full text-[9px] ${
                  selectedCategory === category.id ? 'bg-white/20 dark:bg-black/20' : 'bg-gray-200 dark:bg-gray-800'
                }`}>
                  {categoryCounts[category.id]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search - Compact */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search notifications..."
            className="w-full h-9 pl-9 pr-3 rounded-xl bg-gray-100 dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 text-sm font-medium focus:outline-none"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {/* Tabs - Compact */}
        <div className="flex w-full max-w-full overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-900 p-0.5">
          <button 
            className={`flex-1 min-w-0 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors ${
              activeTab === 'all' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('all')}
            data-testid="tab-all"
          >
            All
          </button>
          <button 
            className={`flex-1 min-w-0 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1 ${
              activeTab === 'unread' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
            }`}
            onClick={() => setActiveTab('unread')}
            data-testid="tab-unread"
          >
            Unread
            {unreadCount > 0 && (
              <span className={`px-1 py-0.5 rounded-full text-[9px] font-bold ${
                activeTab === 'unread' ? 'bg-white/20 dark:bg-black/20' : 'bg-red-500 text-white'
              }`}>{unreadCount}</span>
            )}
          </button>
        </div>

        {/* Actions Row - Compact */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-1">
            <button 
              onClick={markAllAsRead} 
              disabled={unreadCount === 0}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-900 disabled:opacity-50 transition-colors"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <button 
              onClick={handleClearAll}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
              data-testid="button-clear-all"
            >
              <Trash2 className="h-4 w-4 text-red-500" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mx-auto mb-4">
              <Bell className="h-8 w-8 text-gray-400" />
            </div>
            <p className="font-semibold text-black dark:text-white text-sm">
              {searchQuery ? 'No matching notifications' : activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {searchQuery ? 'Try a different search' : activeTab === 'unread' ? "You're all caught up!" : 'Activities will appear here'}
            </p>
          </div>
        ) : (
          <ScrollArea className="flex-1 overflow-x-hidden">
            <div className="space-y-3 pb-4">
              {Object.entries(groupedNotifications).map(([dateGroup, items]) => {
                if (items.length === 0) return null;
                return (
                  <div key={dateGroup}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{dateGroup}</span>
                      <span className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-900 text-[9px] font-medium text-gray-500">{items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleOpen(n.id, n.link)}
                          className={`w-full text-left p-2.5 rounded-xl transition-colors ${
                            !n.isRead ? 'bg-gray-50 dark:bg-gray-900/50' : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                          }`}
                          data-testid={`notification-${n.id}`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={`p-1.5 rounded-lg shrink-0 ${getNotificationColor(n.title)}`}>
                              {getNotificationIcon(n.type, n.title)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className={`font-semibold text-xs truncate ${!n.isRead ? 'text-black dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                      {n.title}
                                    </span>
                                    {n.link && <LinkIcon className="h-2.5 w-2.5 text-blue-500 shrink-0" />}
                                  </div>
                                  {n.message && (
                                    <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-1">{n.message}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {!n.isRead && <div className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white" />}
                                  <span className="text-[10px] text-gray-400">{formatNotificationDate(n.createdAt)}</span>
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
      </div>
    </div>
  );
};

export default Notifications;
