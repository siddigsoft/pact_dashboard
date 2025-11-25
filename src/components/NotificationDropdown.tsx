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
      className="w-[380px] p-0 notification-dropdown shadow-lg border border-blue-100 dark:border-blue-800 rounded-xl overflow-hidden" 
      align="end"
      ref={containerRef}
    >
      <div className="flex items-center justify-between p-4 pb-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30">
        <DropdownMenuLabel className="text-base p-0 flex items-center gap-1 text-blue-800 dark:text-blue-300">
          <Bell className="h-4 w-4" />
          Notifications
          {unreadMessages > 0 && (
            <span className="bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200 text-xs rounded-full px-2 py-0.5 ml-2">
              +{unreadMessages} messages
            </span>
          )}
        </DropdownMenuLabel>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleMarkAllRead} 
            className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100/50"
          >
            <CheckCheck className="h-3 w-3 mr-1" />
            Mark all read
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleClearAll} 
            className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-100/50"
          >
            Clear all
          </Button>
        </div>
      </div>
      
      <NotificationFilter
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        counts={counts}
      />
      
      <DropdownMenuSeparator className="bg-blue-100 dark:bg-blue-800/30" />
      
      <ScrollArea className="h-[400px] bg-white dark:bg-slate-900">
        <div className="p-2 space-y-3">
          <NotificationGroup
            title="Urgent"
            icon={<AlertCircle className="h-4 w-4 text-red-500" />}
            notifications={urgentNotifications}
            actionButtons={renderActionButtons}
          />
          
          <NotificationGroup
            title="Warnings"
            icon={<AlertCircle className="h-4 w-4 text-amber-500" />}
            notifications={warningNotifications}
            actionButtons={renderActionButtons}
          />
          
          <NotificationGroup
            title="Information"
            icon={<CheckCircle2 className="h-4 w-4 text-blue-500" />}
            notifications={infoNotifications}
            actionButtons={renderActionButtons}
          />

          {filteredNotifications.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-12 w-12 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                No notifications to display
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </DropdownMenuContent>
  );
};

export default NotificationDropdown;
