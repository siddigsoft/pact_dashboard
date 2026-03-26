import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, CheckCheck, AlertCircle, CheckCircle2, Clock, Phone, MessageSquare, Search, Calendar, X, ChevronRight, Wifi, WifiOff, Loader2, XCircle, Shield, Pin, PinOff, AlarmClock, Moon, Volume2, VolumeX, History, Settings, BarChart3 } from 'lucide-react';
import { useNotifications } from '@/features/notifications/context/NotificationContext';
import { useCommunication } from '@/features/calls/context/CommunicationContext';
import { useChat } from '@/features/chat/context/ChatContextSupabase';
import { isToday, isYesterday, isThisWeek, format } from 'date-fns';
import { NotificationGroup } from '@/components/notification-center/NotificationGroup';
import { NotificationFilter } from '@/components/notification-center/NotificationFilter';
import { Notification } from '@/types';
import { useUser } from '@/features/user/context/UserContext';
import { useSiteVisitContext } from '@/features/siteVisit/context/SiteVisitContext';
import { toast } from '@/hooks/toast';
import { useNotificationReceipts } from '@/features/notifications/hooks/use-notification-receipts';
import { useNotificationSnooze } from '@/features/notifications/hooks/use-notification-snooze';
import { useNotificationPin } from '@/features/notifications/hooks/use-notification-pin';
import { useDoNotDisturb } from '@/features/calls/hooks/use-do-not-disturb';
import { useNotificationSound } from '@/features/notifications/hooks/use-notification-sound';

interface NotificationDropdownProps {
  onClose: () => void;
}

const NotificationDropdown = ({ onClose }: NotificationDropdownProps) => {
  const { notifications, markNotificationAsRead, clearAllNotifications, realtimeStatus, lastRefresh } = useNotifications();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'priority' | 'date'>('priority');
  const { users } = useUser();
  const { openChatForEntity, initiateCall } = useCommunication();
  const { siteVisits } = useSiteVisitContext();
  const { getUnreadMessagesCount } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const { acknowledgeNotification } = useNotificationReceipts();
  const { snoozeNotification, isSnoozed, SNOOZE_OPTIONS, getSnoozedCount } = useNotificationSnooze();
  const { togglePin, isPinned } = useNotificationPin();
  const { isDND, toggleDND } = useDoNotDisturb();
  const { soundEnabled, toggleSound } = useNotificationSound();

  const unreadMessages = getUnreadMessagesCount();

  useEffect(() => {
    // Add focus effects for accessibility
    if (containerRef.current) {
      containerRef.current.setAttribute('tabIndex', '-1');
      containerRef.current.focus();
    }
  }, []);

  const handleNotificationClick = (notification: Notification) => {
    markNotificationAsRead(notification.id);
    
    // Handle different notification types
    if (notification.relatedEntityType === 'chat') {
      navigate('/chat');
    } else if (notification.link) {
      navigate(notification.link);
    }
    
    onClose();
  };

  const handleStartChat = (entityId: string, entityType: string) => {
    if (entityType === 'chat') {
      navigate('/chat');
    } else if (entityType === 'siteVisit' || entityType === 'mmpFile') {
      openChatForEntity(entityId, entityType as 'siteVisit' | 'mmpFile');
      navigate('/chat');
    } else {
      // Fallback to chat page for other entity types
      navigate('/chat');
    }
    onClose();
  };

  const handleStartCall = (entityId: string, entityType: string) => {
    if (entityType === 'siteVisit') {
      // Find the site visit
      const siteVisit = siteVisits.find(sv => sv.id === entityId);
      if (siteVisit && siteVisit.team?.coordinator) {
        // Find the coordinator
        const coordinator = users.find(u => u.id === siteVisit.team?.coordinator);
        if (coordinator) {
          initiateCall(coordinator);
          onClose();
          return;
        }
      }
    }
    
    // Fallback to calls page
    navigate('/calls');
    onClose();
  };

  const handleMarkAllRead = () => {
    notifications.forEach((notification) => {
      if (!notification.isRead) {
        markNotificationAsRead(notification.id);
      }
    });
  };

  const handleClearAll = async () => {
    try {
      const deletedCount = await clearAllNotifications();
      toast({
        title: 'Notifications cleared',
        description: `Successfully deleted ${deletedCount || notifications.length} notification${(deletedCount || notifications.length) !== 1 ? 's' : ''}`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Failed to clear notifications:', error);
      toast({
        title: 'Failed to clear notifications',
        description: error instanceof Error ? error.message : 'An error occurred while clearing notifications. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const matchesCategory = (n: Notification, category: string): boolean => {
    switch (category) {
      case 'financial':
        return ['financial', 'wallet'].includes(n.category || '') ||
          ['wallet', 'downPayment', 'costSubmission', 'retainer', 'recovery'].includes(n.relatedEntityType || '');
      case 'approvals':
        return n.category === 'approvals' || n.relatedEntityType === 'signature';
      case 'assignments':
        return n.category === 'assignments';
      case 'system':
        return ['system', 'team', 'account'].includes(n.category || '');
      case 'wallet':
        return n.relatedEntityType === 'wallet';
      default:
        return false;
    }
  };

  const categoryFilters = ['financial', 'approvals', 'assignments', 'system', 'wallet'];

  // Filter and group notifications — pinned first, snoozed excluded
  const filteredNotifications = useMemo(() => {
    let filtered = notifications.filter(n => !isSnoozed(n.id));
    
    if (activeFilter === 'unread') {
      filtered = filtered.filter(n => !n.isRead);
    } else if (activeFilter === 'today') {
      filtered = filtered.filter(n => isToday(new Date(n.createdAt)));
    } else if (activeFilter === 'pinned') {
      filtered = filtered.filter(n => isPinned(n.id));
    } else if (activeFilter === 'snoozed') {
      filtered = notifications.filter(n => isSnoozed(n.id));
    } else if (categoryFilters.includes(activeFilter)) {
      filtered = filtered.filter(n => matchesCategory(n, activeFilter));
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(n => 
        n.title.toLowerCase().includes(query) || 
        n.message.toLowerCase().includes(query)
      );
    }
    
    // Sort pinned to top
    if (activeFilter !== 'pinned' && activeFilter !== 'snoozed') {
      filtered.sort((a, b) => {
        const aPinned = isPinned(a.id) ? 1 : 0;
        const bPinned = isPinned(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    
    return filtered;
  }, [notifications, activeFilter, searchQuery, isSnoozed, isPinned]);

  const urgentNotifications = filteredNotifications.filter(n => n.type === 'error');
  const warningNotifications = filteredNotifications.filter(n => n.type === 'warning');
  const infoNotifications = filteredNotifications.filter(n => 
    n.type === 'info' || n.type === 'success' || !n.type // Include notifications without type
  );
  

  const dateGroupedNotifications = useMemo(() => {
    const today: Notification[] = [];
    const yesterday: Notification[] = [];
    const thisWeek: Notification[] = [];
    const older: Notification[] = [];

    filteredNotifications.forEach(n => {
      const date = new Date(n.createdAt);
      if (isToday(date)) {
        today.push(n);
      } else if (isYesterday(date)) {
        yesterday.push(n);
      } else if (isThisWeek(date)) {
        thisWeek.push(n);
      } else {
        older.push(n);
      }
    });

    return { today, yesterday, thisWeek, older };
  }, [filteredNotifications]);

  const counts = {
    all: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    today: notifications.filter(n => isToday(new Date(n.createdAt))).length,
    pinned: notifications.filter(n => isPinned(n.id)).length,
    snoozed: notifications.filter(n => isSnoozed(n.id)).length,
  };

  const categoryCounts = useMemo(() => ({
    financial: notifications.filter(n => matchesCategory(n, 'financial')).length,
    approvals: notifications.filter(n => matchesCategory(n, 'approvals')).length,
    assignments: notifications.filter(n => matchesCategory(n, 'assignments')).length,
    system: notifications.filter(n => matchesCategory(n, 'system')).length,
    wallet: notifications.filter(n => matchesCategory(n, 'wallet')).length,
  }), [notifications]);

  const renderAcknowledgeButton = (notification: Notification) => {
    if (!notification.isRead && (notification.priority === 'urgent' || notification.priority === 'high' || notification.type === 'error')) {
      return (
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
          onClick={(e) => {
            e.stopPropagation();
            acknowledgeNotification(notification.id);
          }}
          data-testid={`button-acknowledge-${notification.id}`}
        >
          <Shield className="h-3 w-3 mr-1" />
          Ack
        </Button>
      );
    }
    return null;
  };

  const renderActionButtons = (notification: Notification) => {
    if (notification.relatedEntityType === 'siteVisit') {
      return (
        <>
          {renderAcknowledgeButton(notification)}
          <Button 
            variant="outline" 
            size="sm" 
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              handleStartChat(notification.relatedEntityId!, notification.relatedEntityType!);
            }}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Chat
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              handleStartCall(notification.relatedEntityId!, notification.relatedEntityType!);
            }}
          >
            <Phone className="h-3 w-3 mr-1" />
            Call
          </Button>
        </>
      );
    }
    
    if (notification.relatedEntityType === 'mmpFile') {
      return (
        <>
          {renderAcknowledgeButton(notification)}
          <Button 
            variant="outline"
            size="sm"
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              handleStartChat(notification.relatedEntityId!, notification.relatedEntityType!);
            }}
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Discuss
          </Button>
        </>
      );
    }
    
    // SOS Alert action buttons - Call, Chat, View Location
    if (notification.title?.includes('SOS') || notification.title?.includes('EMERGENCY')) {
      const sosUserId = notification.relatedEntityId;
      const sosUser = sosUserId ? users.find(u => u.id === sosUserId) : null;
      
      return (
        <>
          {renderAcknowledgeButton(notification)}
          <Button 
            variant="destructive" 
            size="sm"
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              if (sosUser) {
                initiateCall(sosUser);
                onClose();
              } else {
                navigate('/calls');
                onClose();
              }
            }}
            data-testid="button-sos-call"
          >
            <Phone className="h-3 w-3 mr-1" />
            Call Now
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              navigate('/chat');
              onClose();
            }}
            data-testid="button-sos-chat"
          >
            <MessageSquare className="h-3 w-3 mr-1" />
            Chat
          </Button>
          {notification.link && (
            <Button 
              variant="outline" 
              size="sm"
              className="h-7"
              onClick={(e) => { 
                e.stopPropagation();
                navigate(notification.link!);
                onClose();
              }}
              data-testid="button-sos-location"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              View
            </Button>
          )}
        </>
      );
    }
    
    // Call-related notifications (Call Ended, Missed Call, etc.)
    if (notification.relatedEntityType === 'call' || 
        notification.title?.toLowerCase().includes('call') ||
        notification.message?.toLowerCase().includes('call')) {
      return (
        <>
          {renderAcknowledgeButton(notification)}
          <Button 
            variant="outline" 
            size="sm"
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              navigate('/calls');
              onClose();
            }}
            data-testid="button-view-calls"
          >
            <Phone className="h-3 w-3 mr-1" />
            View Calls
          </Button>
        </>
      );
    }
    
    const isApprovalType =
      notification.category === 'approvals' ||
      notification.relatedEntityType === 'downPayment' ||
      notification.relatedEntityType === 'costSubmission';

    if (isApprovalType && notification.link) {
      return (
        <>
          {renderAcknowledgeButton(notification)}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-green-600 border-green-300 dark:text-green-400 dark:border-green-700"
            onClick={(e) => {
              e.stopPropagation();
              navigate(notification.link!);
              onClose();
            }}
            data-testid={`button-approve-${notification.id}`}
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approve
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-red-600 border-red-300 dark:text-red-400 dark:border-red-700"
            onClick={(e) => {
              e.stopPropagation();
              navigate(notification.link!);
              onClose();
            }}
            data-testid={`button-reject-${notification.id}`}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </>
      );
    }

    if (notification.link) {
      return (
        <>
          {renderAcknowledgeButton(notification)}
          <Button 
            variant="outline" 
            size="sm"
            className="h-7"
            onClick={(e) => { 
              e.stopPropagation();
              navigate(notification.link!);
              onClose();
            }}
            data-testid="button-view-details"
          >
            <ChevronRight className="h-3 w-3 mr-1" />
            View Details
          </Button>
        </>
      );
    }
    
    return renderAcknowledgeButton(notification);
  };

  const renderSnoozePin = (notification: Notification) => (
    <div className="flex gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        title={isPinned(notification.id) ? 'Unpin' : 'Pin'}
        onClick={(e) => { e.stopPropagation(); togglePin(notification.id); }}
        data-testid={`button-pin-${notification.id}`}
      >
        {isPinned(notification.id) ? <PinOff className="h-3 w-3 text-primary" /> : <Pin className="h-3 w-3" />}
      </Button>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            title="Snooze"
            onClick={(e) => e.stopPropagation()}
            data-testid={`button-snooze-${notification.id}`}
          >
            <AlarmClock className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="end" side="left">
          {SNOOZE_OPTIONS.map(opt => (
            <Button
              key={opt.label}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={(e) => {
                e.stopPropagation();
                snoozeNotification(notification.id, opt.duration);
                toast({ title: 'Snoozed', description: `Notification snoozed for ${opt.label}` });
              }}
              data-testid={`snooze-option-${opt.label}`}
            >
              {opt.label}
            </Button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );

  return (
    <DropdownMenuContent 
      className="w-[420px] sm:w-[380px] md:w-[420px] p-0 notification-dropdown shadow-xl border border-border rounded-xl overflow-hidden max-w-[95vw] sm:max-w-[420px] z-[9999]" 
      align="end"
      side="bottom"
      sideOffset={8}
      ref={containerRef}
      data-testid="notification-dropdown"
    >
      {/* Header with gradient background */}
      <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DropdownMenuLabel className="text-base font-semibold p-0 text-foreground">
                Notifications
              </DropdownMenuLabel>
              <div className="flex items-center gap-2">
                {(counts.unread > 0 || unreadMessages > 0) && (
                  <p className="text-xs text-muted-foreground">
                    {counts.unread > 0 && `${counts.unread} unread`}
                    {counts.unread > 0 && unreadMessages > 0 && ' · '}
                    {unreadMessages > 0 && `${unreadMessages} new messages`}
                  </p>
                )}
                <div 
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    realtimeStatus === 'connected' 
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                      : realtimeStatus === 'connecting' 
                        ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                  }`}
                  title={lastRefresh ? `Last updated: ${format(lastRefresh, 'HH:mm:ss')}` : 'Connecting...'}
                  data-testid="realtime-status"
                >
                  {realtimeStatus === 'connected' ? (
                    <><Wifi className="h-2.5 w-2.5" /> Live</>
                  ) : realtimeStatus === 'connecting' ? (
                    <><Loader2 className="h-2.5 w-2.5 animate-spin" /> Connecting</>
                  ) : (
                    <><WifiOff className="h-2.5 w-2.5" /> Offline</>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={`h-7 w-7 ${isDND ? 'text-amber-500' : ''}`}
              onClick={toggleDND}
              title={isDND ? 'Disable Do Not Disturb' : 'Enable Do Not Disturb'}
              data-testid="button-toggle-dnd"
            >
              <Moon className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleSound}
              title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              data-testid="button-toggle-sound"
            >
              {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              className="h-7 w-7"
              onClick={handleMarkAllRead}
              disabled={counts.unread === 0}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-7 text-xs"
              onClick={handleClearAll}
              disabled={counts.all === 0}
              data-testid="button-clear-all"
            >
              Clear
            </Button>
          </div>
        </div>
        
        {/* Search and view toggle */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search notifications..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
              aria-label="Search notifications"
              data-testid="input-notification-search"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
                data-testid="button-clear-search"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex border rounded-md">
            <Button
              variant={viewMode === 'priority' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2 rounded-r-none"
              onClick={() => setViewMode('priority')}
              data-testid="button-view-priority"
            >
              <AlertCircle className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'date' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2 rounded-l-none"
              onClick={() => setViewMode('date')}
              data-testid="button-view-date"
            >
              <Calendar className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Filter tabs */}
      <NotificationFilter
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={counts}
        categoryCounts={categoryCounts}
      />
      
      {/* Notification list */}
      <ScrollArea className="h-[200px] sm:h-[220px] md:h-[200px] bg-background max-h-[40vh] sm:max-h-[45vh]">
        <div className="p-3 space-y-4">
          {viewMode === 'priority' ? (
            <>
              <NotificationGroup
                title="Urgent"
                icon={<AlertCircle className="h-4 w-4 text-red-500" />}
                notifications={urgentNotifications}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="urgent"
              />
              
              <NotificationGroup
                title="Warnings"
                icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
                notifications={warningNotifications}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="warning"
              />
              
              <NotificationGroup
                title="Information"
                icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
                notifications={infoNotifications}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="info"
              />
            </>
          ) : (
            <>
              <NotificationGroup
                title="Today"
                icon={<Calendar className="h-4 w-4 text-primary" />}
                notifications={dateGroupedNotifications.today}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="info"
              />
              
              <NotificationGroup
                title="Yesterday"
                icon={<Clock className="h-4 w-4 text-muted-foreground" />}
                notifications={dateGroupedNotifications.yesterday}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="info"
              />
              
              <NotificationGroup
                title="This Week"
                icon={<Calendar className="h-4 w-4 text-muted-foreground" />}
                notifications={dateGroupedNotifications.thisWeek}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="info"
              />
              
              <NotificationGroup
                title="Older"
                icon={<Clock className="h-4 w-4 text-muted-foreground/70" />}
                notifications={dateGroupedNotifications.older}
                onNotificationClick={handleNotificationClick}
                actionButtons={renderActionButtons}
                extraActions={renderSnoozePin}
                variant="info"
              />
            </>
          )}

          {filteredNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 rounded-full bg-muted/50 mb-3">
                <Bell className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {searchQuery ? 'No matching notifications' : 'No notifications'}
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {searchQuery ? 'Try a different search term' : "You're all caught up!"}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="border-t border-border bg-muted/30 px-3 py-2 flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => { navigate('/notification-history'); onClose(); }}
            data-testid="link-notification-history"
          >
            <History className="h-3 w-3 mr-1" />
            History
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => { navigate('/notification-preferences'); onClose(); }}
            data-testid="link-notification-preferences"
          >
            <Settings className="h-3 w-3 mr-1" />
            Settings
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => { navigate('/notification-analytics'); onClose(); }}
          data-testid="link-notification-analytics"
        >
          <BarChart3 className="h-3 w-3 mr-1" />
          Analytics
        </Button>
      </div>
    </DropdownMenuContent>
  );
};

export default NotificationDropdown;