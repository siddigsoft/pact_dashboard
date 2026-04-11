import { type FC, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import {
  Bell,
  CheckCheck,
  Trash2,
  Link as LinkIcon,
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
  { id: 'urgent', label: 'Urgent', icon: AlertCircle, count: 0, color: 'text-red-500' },
  { id: 'assignments', label: 'Assignments', icon: MapPin, count: 0, color: 'text-cyan-500' },
  { id: 'financial', label: 'Financial', icon: DollarSign, count: 0, color: 'text-emerald-500' },
  { id: 'approvals', label: 'Approvals', icon: CheckCircle, count: 0, color: 'text-green-500' },
  { id: 'broadcast', label: 'Broadcasts', icon: Megaphone, count: 0, color: 'text-amber-500' },
  { id: 'account', label: 'Account', icon: Users, count: 0, color: 'text-orange-500' },
  { id: 'system', label: 'System', icon: RefreshCw, count: 0, color: 'text-slate-500' },
  { id: 'messages', label: 'Messages', icon: MessageSquare, count: 0, color: 'text-blue-500' },
  { id: 'calls', label: 'Calls', icon: Phone, count: 0, color: 'text-purple-500' },
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
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet') || lowerTitle.includes('cost') || lowerTitle.includes('budget')) return <DollarSign className="h-4 w-4" />;
  if (lowerTitle.includes('visit') || lowerTitle.includes('site') || lowerTitle.includes('location')) return <MapPin className="h-4 w-4" />;
  if (lowerTitle.includes('user') || lowerTitle.includes('team') || lowerTitle.includes('assigned')) return <Users className="h-4 w-4" />;
  if (lowerTitle.includes('message') || lowerTitle.includes('chat')) return <MessageSquare className="h-4 w-4" />;
  if (lowerTitle.includes('call') || lowerTitle.includes('missed')) return <Phone className="h-4 w-4" />;
  if (lowerTitle.includes('document') || lowerTitle.includes('file') || lowerTitle.includes('report')) return <FileText className="h-4 w-4" />;
  if (lowerTitle.includes('schedule') || lowerTitle.includes('calendar') || lowerTitle.includes('reminder')) return <Calendar className="h-4 w-4" />;
  if (lowerTitle.includes('approved') || lowerTitle.includes('success') || lowerTitle.includes('complete')) return <CheckCircle className="h-4 w-4" />;
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('warning') || lowerTitle.includes('error')) return <AlertCircle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
};

const getNotificationColor = (title?: string) => {
  const lowerTitle = (title || '').toLowerCase();
  if (lowerTitle.includes('approved') || lowerTitle.includes('success') || lowerTitle.includes('complete')) return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
  if (lowerTitle.includes('urgent') || lowerTitle.includes('alert') || lowerTitle.includes('error') || lowerTitle.includes('rejected') || lowerTitle.includes('missed')) return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400';
  if (lowerTitle.includes('warning') || lowerTitle.includes('pending')) return 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400';
  if (lowerTitle.includes('payment') || lowerTitle.includes('wallet')) return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400';
  if (lowerTitle.includes('call')) return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
  return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
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

const Notifications: FC = () => {
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
        switch (selectedCategory) {
          case 'urgent':
            return n.priority === 'urgent' || n.priority === 'high';
          case 'messages':
          case 'calls':
          case 'assignments':
          case 'financial':
          case 'approvals':
          case 'broadcast':
          case 'account':
          case 'system':
            return (n.category || '').toLowerCase() === selectedCategory;
          default: return true;
        }
      });
    }
    return filtered;
  }, [notifications, activeTab, searchQuery, selectedCategory]);

  const groupedNotifications = useMemo(() => groupNotificationsByDate(filteredNotifications), [filteredNotifications]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: notifications.length };
    for (const n of notifications) {
      const cat = (n.category || '').toLowerCase();
      if (n.priority === 'urgent' || n.priority === 'high') {
        counts.urgent = (counts.urgent || 0) + 1;
      }
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    }
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
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950" data-testid="notifications-page">

      {/* Page Header */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white" data-testid="text-page-title">
              Notifications
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {unreadCount > 0 ? (
                <span><span className="text-blue-600 dark:text-blue-400 font-medium">{unreadCount} unread</span> · {notifications.length} total</span>
              ) : (
                <span>{notifications.length} notifications</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              data-testid="button-refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0}
              className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </button>
            <button
              onClick={handleClearAll}
              className="h-9 px-3 rounded-lg border border-red-200 dark:border-red-900 flex items-center gap-2 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              data-testid="button-clear-all"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear all
            </button>
            <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
              <DialogTrigger asChild>
                <button
                  className="h-9 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center gap-2 text-sm text-white font-medium transition-colors"
                  data-testid="button-send-notification"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Send
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
                            selectedTemplate?.id === template.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900'
                          }`}
                          onClick={() => { setSelectedTemplate(template); setCustomTitle(template.title); setCustomMessage(template.message); }}
                          data-testid={`notification-template-${template.id}`}
                        >
                          <div className="flex items-start gap-1.5">
                            <div className={`p-1 rounded ${template.color}`}>
                              <template.icon className="h-3 w-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-[10px] truncate text-gray-900 dark:text-white">{template.title}</div>
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
                        className="w-full h-8 mt-1 px-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        data-testid="input-notification-title"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Message</label>
                      <textarea
                        placeholder="Notification message..."
                        className="w-full min-h-[60px] mt-1 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={customMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        data-testid="input-notification-message"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button onClick={() => setShowSendDialog(false)} className="h-8 px-3 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={handleSendNotification}
                      disabled={!customTitle || !customMessage}
                      className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50 flex items-center gap-1 transition-colors"
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

        {/* Category Chips */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-0.5 scrollbar-hide">
          {NOTIFICATION_CATEGORIES.map((category) => {
            const count = categoryCounts[category.id] || 0;
            const isActive = selectedCategory === category.id;
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                data-testid={`category-${category.id}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                <category.icon className={`h-3 w-3 ${isActive ? '' : category.color}`} />
                {category.label}
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold leading-none ${
                    isActive ? 'bg-white/25 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar: search + tabs */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search notifications..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {/* All / Unread toggle */}
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setActiveTab('all')}
            data-testid="tab-all"
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab('unread')}
            data-testid="tab-unread"
            className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === 'unread'
                ? 'bg-blue-600 text-white'
                : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            Unread
            {unreadCount > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                activeTab === 'unread' ? 'bg-white/25 text-white' : 'bg-red-500 text-white'
              }`}>{unreadCount}</span>
            )}
          </button>
        </div>

        <span className="text-sm text-gray-400 ml-auto">
          {filteredNotifications.length} result{filteredNotifications.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Notifications list */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <Bell className="h-7 w-7 text-gray-400" />
            </div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {searchQuery ? 'No matching notifications' : activeTab === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {searchQuery ? 'Try a different search term' : activeTab === 'unread' ? "You're all caught up!" : 'Activities will appear here'}
            </p>
          </div>
        ) : (
          <div className="space-y-6 max-w-3xl">
            {Object.entries(groupedNotifications).map(([dateGroup, items]) => {
              if (items.length === 0) return null;
              return (
                <div key={dateGroup}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{dateGroup}</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-800" />
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>
                  <div className="space-y-1">
                    {items.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleOpen(n.id, n.link)}
                        data-testid={`notification-${n.id}`}
                        className={`w-full text-left p-4 rounded-xl border transition-all group ${
                          !n.isRead
                            ? 'bg-white dark:bg-gray-900 border-blue-100 dark:border-blue-900/40 shadow-sm'
                            : 'bg-white dark:bg-gray-900 border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg shrink-0 ${getNotificationColor(n.title)}`}>
                            {getNotificationIcon(n.type, n.title)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-semibold text-sm ${!n.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                                    {n.title}
                                  </span>
                                  {n.link && <LinkIcon className="h-3 w-3 text-blue-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />}
                                </div>
                                {n.message && (
                                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{n.message}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {!n.isRead && <div className="w-2 h-2 rounded-full bg-blue-500" />}
                                <span className="text-xs text-gray-400 whitespace-nowrap">{formatNotificationDate(n.createdAt)}</span>
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
        )}
      </div>
    </div>
  );
};

export default Notifications;
