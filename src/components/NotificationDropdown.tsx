import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, AlertCircle, CheckCircle2, Clock, Phone, MessageSquare } from 'lucide-react';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { isToday } from 'date-fns';
import { NotificationGroup } from './notification-center/NotificationGroup';
import { NotificationFilter } from './notification-center/NotificationFilter';
import { Notification } from '@/types';
import { useUser } from '@/context/user/UserContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { toast } from '@/hooks/toast';

interface NotificationDropdownProps {
  onClose: () => void;
}

const NotificationDropdown = ({ onClose }: NotificationDropdownProps) => {
  const { notifications, markNotificationAsRead, clearAllNotifications } = useNotifications();
  const navigate = useNavigate();
  const [activeFilter, setActiveFilter] = useState('all');
  const { users } = useUser();
  const { openChatForEntity, initiateCall } = useCommunication();
  const { siteVisits } = useSiteVisitContext();
  const { getUnreadMessagesCount } = useChat();
  const containerRef = useRef<HTMLDivElement>(null);

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

  const handleStartChat = (entityId: string, entityType: 'siteVisit' | 'mmpFile' | 'transaction' | 'chat') => {
    if (entityType === 'chat') {
      navigate('/chat');
    } else if (entityType === 'siteVisit' || entityType === 'mmpFile') {
      openChatForEntity(entityId, entityType);
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

  // Filter and group notifications
  const filteredNotifications = notifications.filter(notification => {
    if (activeFilter === 'unread') return !notification.isRead;
    if (activeFilter === 'today') return isToday(new Date(notification.createdAt));
    return true;
  });

  const urgentNotifications = filteredNotifications.filter(n => n.type === 'error');
  const warningNotifications = filteredNotifications.filter(n => n.type === 'warning');
  const infoNotifications = filteredNotifications.filter(n => 
    n.type === 'info' || n.type === 'success'
  );

  const counts = {
    all: notifications.length,
    unread: notifications.filter(n => !n.isRead).length,
    today: notifications.filter(n => isToday(new Date(n.createdAt))).length,
  };

  const renderActionButtons = (notification: Notification) => {
    if (notification.relatedEntityType === 'siteVisit') {
      return (
        <>
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
      );
    }
    
    return null;
  };

  return (
    <DropdownMenuContent 
      className="w-[420px] p-0 notification-dropdown shadow-xl border border-border rounded-xl overflow-hidden" 
      align="end"
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
              {(counts.unread > 0 || unreadMessages > 0) && (
                <p className="text-xs text-muted-foreground">
                  {counts.unread > 0 && `${counts.unread} unread`}
                  {counts.unread > 0 && unreadMessages > 0 && ' · '}
                  {unreadMessages > 0 && `${unreadMessages} new messages`}
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleMarkAllRead}
              disabled={counts.unread === 0}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleClearAll}
              disabled={counts.all === 0}
              data-testid="button-clear-all"
            >
              Clear all
            </Button>
          </div>
        </div>
      </div>
      
      {/* Filter tabs */}
      <NotificationFilter
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={counts}
      />
      
      {/* Notification list */}
      <ScrollArea className="h-[420px] bg-background">
        <div className="p-3 space-y-4">
          <NotificationGroup
            title="Urgent"
            icon={<AlertCircle className="h-4 w-4 text-red-500" />}
            notifications={urgentNotifications}
            onNotificationClick={handleNotificationClick}
            actionButtons={renderActionButtons}
            variant="urgent"
          />
          
          <NotificationGroup
            title="Warnings"
            icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
            notifications={warningNotifications}
            onNotificationClick={handleNotificationClick}
            actionButtons={renderActionButtons}
            variant="warning"
          />
          
          <NotificationGroup
            title="Information"
            icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
            notifications={infoNotifications}
            onNotificationClick={handleNotificationClick}
            actionButtons={renderActionButtons}
            variant="info"
          />

          {filteredNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="p-4 rounded-full bg-muted/50 mb-3">
                <Bell className="h-10 w-10 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                No notifications
              </p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                You're all caught up!
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </DropdownMenuContent>
  );
};

export default NotificationDropdown;
