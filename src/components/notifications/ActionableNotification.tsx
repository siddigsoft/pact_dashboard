import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  MessageSquare, 
  Phone, 
  MapPin, 
  Bell, 
  Mail,
  FileText,
  AlertTriangle,
  CheckCircle,
  Info,
  Wallet
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import notificationSoundService from '@/services/NotificationSoundService';

export type NotificationType = 
  | 'message' 
  | 'call' 
  | 'email' 
  | 'site-update' 
  | 'approval' 
  | 'alert' 
  | 'success' 
  | 'info'
  | 'wallet';

export interface ActionableNotificationData {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  entityId?: string;
  entityType?: string;
  senderName?: string;
  senderAvatar?: string;
  link?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
}

interface ActionableNotificationProps {
  notification: ActionableNotificationData;
  onOpen: (notification: ActionableNotificationData) => void;
  onDismiss: (id: string) => void;
  autoHideDuration?: number;
}

const typeIcons: Record<NotificationType, typeof MessageSquare> = {
  message: MessageSquare,
  call: Phone,
  email: Mail,
  'site-update': MapPin,
  approval: FileText,
  alert: AlertTriangle,
  success: CheckCircle,
  info: Info,
  wallet: Wallet,
};

const typeColors: Record<NotificationType, string> = {
  message: 'bg-blue-500',
  call: 'bg-green-500',
  email: 'bg-purple-500',
  'site-update': 'bg-orange-500',
  approval: 'bg-amber-500',
  alert: 'bg-red-500',
  success: 'bg-emerald-500',
  info: 'bg-sky-500',
  wallet: 'bg-teal-500',
};

const priorityStyles: Record<string, string> = {
  low: 'border-l-4 border-l-gray-400',
  normal: 'border-l-4 border-l-blue-400',
  high: 'border-l-4 border-l-orange-400',
  urgent: 'border-l-4 border-l-red-500 animate-pulse',
};

export function ActionableNotification({
  notification,
  onOpen,
  onDismiss,
  autoHideDuration = 8000,
}: ActionableNotificationProps) {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    const interval = 50;
    const decrement = (interval / autoHideDuration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          onDismiss(notification.id);
          return 0;
        }
        return prev - decrement;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [autoHideDuration, isPaused, notification.id, onDismiss]);

  const Icon = typeIcons[notification.type] || Bell;
  const iconBgColor = typeColors[notification.type] || 'bg-gray-500';
  const priorityStyle = priorityStyles[notification.priority || 'normal'];

  const handleOpen = () => {
    onOpen(notification);
    onDismiss(notification.id);
  };

  const handleDismiss = () => {
    onDismiss(notification.id);
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className={cn(
        "relative w-full max-w-sm bg-background border rounded-lg shadow-lg overflow-hidden",
        priorityStyle
      )}
      data-testid={`notification-${notification.id}`}
    >
      {/* Progress bar */}
      <div 
        className="absolute top-0 left-0 h-1 bg-primary/30 transition-all duration-100"
        style={{ width: `${progress}%` }}
      />

      {/* Close button */}
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors"
        data-testid="button-dismiss-notification"
      >
        <X className="h-4 w-4 text-muted-foreground" />
      </button>

      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white",
            iconBgColor
          )}>
            <Icon className="h-5 w-5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 pr-6">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold text-sm truncate">{notification.title}</h4>
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatTime(notification.timestamp)}
              </span>
            </div>
            
            {notification.senderName && (
              <p className="text-xs text-muted-foreground">
                From: {notification.senderName}
              </p>
            )}
            
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {notification.message}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            data-testid="button-notification-ok"
          >
            OK
          </Button>
          <Button
            size="sm"
            onClick={handleOpen}
            data-testid="button-notification-open"
          >
            Open
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

// Notification Container Component
interface NotificationContainerProps {
  notifications: ActionableNotificationData[];
  onOpen: (notification: ActionableNotificationData) => void;
  onDismiss: (id: string) => void;
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center';
}

export function NotificationContainer({
  notifications,
  onOpen,
  onDismiss,
  position = 'top-right',
}: NotificationContainerProps) {
  const positionClasses: Record<string, string> = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-center': 'top-4 left-1/2 -translate-x-1/2',
  };

  return (
    <div 
      className={cn(
        "fixed z-[100] flex flex-col gap-2 pointer-events-none",
        positionClasses[position]
      )}
    >
      <AnimatePresence mode="popLayout">
        {notifications.map((notification) => (
          <div key={notification.id} className="pointer-events-auto">
            <ActionableNotification
              notification={notification}
              onOpen={onOpen}
              onDismiss={onDismiss}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ActionableNotification;
