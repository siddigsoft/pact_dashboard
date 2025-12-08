import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Phone,
  PhoneIncoming,
  MessageSquare,
  X,
  User,
  Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useViewMode } from '@/context/ViewModeContext';

export type NotificationType = 'call' | 'message' | 'general';

interface PushNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: {
    chatId?: string;
    callerId?: string;
    callerName?: string;
    callerAvatar?: string;
    url?: string;
  };
  timestamp: Date;
}

interface MobilePushNotificationOverlayProps {
  className?: string;
}

export function MobilePushNotificationOverlay({ className }: MobilePushNotificationOverlayProps) {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [currentNotification, setCurrentNotification] = useState<PushNotification | null>(null);
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile' || Capacitor.isNativePlatform();

  useEffect(() => {
    const handleNativeNotification = (event: CustomEvent) => {
      const { title, body, data } = event.detail;
      
      const notificationType: NotificationType = 
        data?.type === 'call' || data?.type === 'incoming_call' ? 'call' :
        data?.type === 'message' || data?.type === 'chat' ? 'message' : 'general';
      
      const notification: PushNotification = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: notificationType,
        title,
        body,
        data,
        timestamp: new Date(),
      };
      
      setNotifications(prev => [...prev, notification]);
      setCurrentNotification(notification);
      
      if (hapticPresets && typeof hapticPresets.notification === 'function') {
        hapticPresets.notification();
      }
    };

    const handleNotificationAction = (event: CustomEvent) => {
      const { url, data } = event.detail;
      if (url) {
        navigate(url);
      } else if (data?.chatId) {
        navigate('/chat');
      } else if (data?.type === 'call') {
        navigate('/calls');
      }
    };

    window.addEventListener('native-notification-received', handleNativeNotification as EventListener);
    window.addEventListener('native-notification-action', handleNotificationAction as EventListener);

    return () => {
      window.removeEventListener('native-notification-received', handleNativeNotification as EventListener);
      window.removeEventListener('native-notification-action', handleNotificationAction as EventListener);
    };
  }, [navigate]);

  useEffect(() => {
    if (currentNotification) {
      const timer = setTimeout(() => {
        dismissNotification(currentNotification.id);
      }, currentNotification.type === 'call' ? 30000 : 5000);
      
      return () => clearTimeout(timer);
    }
  }, [currentNotification]);

  const dismissNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (currentNotification?.id === id) {
      const remaining = notifications.filter(n => n.id !== id);
      setCurrentNotification(remaining.length > 0 ? remaining[remaining.length - 1] : null);
    }
  }, [currentNotification, notifications]);

  const handleAction = useCallback((notification: PushNotification, action: 'accept' | 'decline' | 'view') => {
    hapticPresets.buttonPress();
    
    if (action === 'decline') {
      dismissNotification(notification.id);
      return;
    }

    if (notification.type === 'call') {
      navigate('/calls');
    } else if (notification.type === 'message') {
      navigate('/chat');
    } else if (notification.data?.url) {
      navigate(notification.data.url);
    } else {
      navigate('/notifications');
    }
    
    dismissNotification(notification.id);
  }, [navigate, dismissNotification]);

  if (!isMobile || !currentNotification) return null;

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'call':
        return <PhoneIncoming className="w-6 h-6" />;
      case 'message':
        return <MessageSquare className="w-6 h-6" />;
      default:
        return <Bell className="w-6 h-6" />;
    }
  };

  const getNotificationColor = (type: NotificationType) => {
    switch (type) {
      case 'call':
        return 'from-green-500 to-green-600';
      case 'message':
        return 'from-black to-gray-900 dark:from-white dark:to-gray-100';
      default:
        return 'from-black to-gray-900 dark:from-white dark:to-gray-100';
    }
  };

  return (
    <AnimatePresence>
      {currentNotification && (
        <motion.div
          key={currentNotification.id}
          initial={{ opacity: 0, y: -100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            "fixed top-0 left-0 right-0 z-[9999] safe-area-pt",
            className
          )}
          data-testid="push-notification-overlay"
        >
          <div className="p-3 pt-2">
            <div 
              className={cn(
                "rounded-2xl overflow-hidden shadow-2xl",
                "bg-gradient-to-br",
                getNotificationColor(currentNotification.type)
              )}
            >
              <div className="p-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
                    currentNotification.type === 'call' 
                      ? "bg-white/20" 
                      : "bg-white/10 dark:bg-black/10"
                  )}>
                    {currentNotification.data?.callerAvatar ? (
                      <img 
                        src={currentNotification.data.callerAvatar} 
                        alt="" 
                        className="w-full h-full rounded-full object-cover" 
                      />
                    ) : (
                      <div className={cn(
                        currentNotification.type === 'call' 
                          ? "text-white" 
                          : "text-white dark:text-black"
                      )}>
                        {getNotificationIcon(currentNotification.type)}
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn(
                        "font-semibold text-base truncate",
                        currentNotification.type === 'call' 
                          ? "text-white" 
                          : "text-white dark:text-black"
                      )}>
                        {currentNotification.title}
                      </p>
                      <button
                        onClick={() => dismissNotification(currentNotification.id)}
                        className={cn(
                          "p-1 rounded-full",
                          currentNotification.type === 'call' 
                            ? "text-white/60 hover:text-white hover:bg-white/10" 
                            : "text-white/60 dark:text-black/60 hover:text-white dark:hover:text-black hover:bg-white/10 dark:hover:bg-black/10"
                        )}
                        data-testid="button-dismiss-notification"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <p className={cn(
                      "text-sm mt-0.5 line-clamp-2",
                      currentNotification.type === 'call' 
                        ? "text-white/80" 
                        : "text-white/70 dark:text-black/70"
                    )}>
                      {currentNotification.body}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-4">
                  {currentNotification.type === 'call' ? (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => handleAction(currentNotification, 'decline')}
                        className="flex-1 h-12 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-white border-0"
                        data-testid="button-decline-call"
                      >
                        <X className="w-5 h-5 mr-2" />
                        Decline
                      </Button>
                      <Button
                        onClick={() => handleAction(currentNotification, 'accept')}
                        className="flex-1 h-12 rounded-xl bg-white text-green-600 hover:bg-white/90 border-0"
                        data-testid="button-accept-call"
                      >
                        <Phone className="w-5 h-5 mr-2" />
                        Accept
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        onClick={() => dismissNotification(currentNotification.id)}
                        className={cn(
                          "flex-1 h-11 rounded-xl border-0",
                          "bg-white/10 dark:bg-black/10 text-white dark:text-black",
                          "hover:bg-white/20 dark:hover:bg-black/20"
                        )}
                        data-testid="button-dismiss-message"
                      >
                        Dismiss
                      </Button>
                      <Button
                        onClick={() => handleAction(currentNotification, 'view')}
                        className={cn(
                          "flex-1 h-11 rounded-xl border-0",
                          "bg-white dark:bg-black text-black dark:text-white",
                          "hover:bg-white/90 dark:hover:bg-black/90"
                        )}
                        data-testid="button-view-notification"
                      >
                        {currentNotification.type === 'message' ? 'Reply' : 'View'}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {currentNotification.type === 'call' && (
                <motion.div 
                  className="h-1 bg-white/30"
                  initial={{ scaleX: 1 }}
                  animate={{ scaleX: 0 }}
                  transition={{ duration: 30, ease: 'linear' }}
                  style={{ transformOrigin: 'left' }}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default MobilePushNotificationOverlay;
