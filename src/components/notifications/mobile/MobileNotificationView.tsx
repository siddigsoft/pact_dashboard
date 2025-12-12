/**
 * Mobile Notification View Component
 * Touch-optimized WhatsApp/Telegram-style notifications for Capacitor mobile
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Bell, Check, Trash2, X, ChevronDown } from 'lucide-react';
import { NotificationData } from '@/theme/notifications-theme';
import { NotificationListItem, NotificationEmptyState } from '../shared/NotificationListItem';
import { UnreadBadge } from '../shared/NotificationBubble';
import { useNotificationAnimation } from '@/hooks/notifications/useNotificationAnimation';
import { useNotificationSound } from '@/hooks/notifications/useNotificationSound';
import { formatPopupTime } from '@/utils/notifications/formatTimestamp';

interface MobileNotificationViewProps {
  notifications: NotificationData[];
  locale?: 'en' | 'ar';
  soundEnabled?: boolean;
  hapticsEnabled?: boolean;
  onNotificationClick?: (notification: NotificationData) => void;
  onMarkAsRead?: (id: string) => void;
  onMarkAllAsRead?: () => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
}

export function MobileNotificationView({
  notifications,
  locale = 'en',
  soundEnabled = true,
  hapticsEnabled = true,
  onNotificationClick,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
  onClearAll,
  className,
}: MobileNotificationViewProps) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const previousNotificationIdsRef = useRef<Set<string> | null>(null);
  const isInitializedRef = useRef(false);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const {
    notifications: animatedPopups,
    show: showPopup,
    dismiss: dismissPopup,
  } = useNotificationAnimation<NotificationData>({
    direction: 'top',
    autoHideDuration: 4000,
  });

  const { playSoundForId } = useNotificationSound({
    enabled: soundEnabled,
  });

  const triggerHaptics = useCallback(async () => {
    if (!hapticsEnabled) return;
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: ImpactStyle.Medium });
    } catch {
      // Haptics not available (web or missing plugin)
    }
  }, [hapticsEnabled]);

  // Detect new notifications and trigger popup, sound, haptics (skip initial render)
  useEffect(() => {
    const currentIds = new Set(notifications.map(n => n.id));
    
    // On first render, just initialize the ref without triggering popups/sounds
    if (!isInitializedRef.current) {
      previousNotificationIdsRef.current = currentIds;
      isInitializedRef.current = true;
      return;
    }
    
    const previousIds = previousNotificationIdsRef.current || new Set();
    
    // Find new notifications (IDs in current but not in previous)
    const newNotifications = notifications.filter(n => !previousIds.has(n.id) && !n.isRead);
    
    if (newNotifications.length > 0 && !isSheetOpen) {
      // Show popup for each new notification
      newNotifications.forEach(notification => {
        showPopup(notification.id, notification);
        playSoundForId(notification.id);
      });
      // Trigger haptics once for all new notifications
      triggerHaptics();
    }
    
    previousNotificationIdsRef.current = currentIds;
  }, [notifications, isSheetOpen, showPopup, playSoundForId, triggerHaptics]);

  const handleNotificationClick = useCallback((notification: NotificationData) => {
    if (!notification.isRead) {
      onMarkAsRead?.(notification.id);
    }
    setIsSheetOpen(false);
    onNotificationClick?.(notification);
  }, [onMarkAsRead, onNotificationClick]);

  const handlePopupClick = useCallback((notification: NotificationData) => {
    dismissPopup(notification.id);
    handleNotificationClick(notification);
  }, [dismissPopup, handleNotificationClick]);

  const handleSwipeDismiss = useCallback((id: string) => {
    dismissPopup(id);
    onDelete?.(id);
  }, [dismissPopup, onDelete]);

  return (
    <>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn('relative', className)}
            data-testid="button-mobile-notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1">
                <UnreadBadge count={unreadCount} />
              </span>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl px-0">
          <SheetHeader className="px-4 pb-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg font-semibold">
                  {locale === 'ar' ? 'الإشعارات' : 'Notifications'}
                </SheetTitle>
                <UnreadBadge count={unreadCount} />
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && onMarkAllAsRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onMarkAllAsRead}
                    data-testid="button-mobile-mark-all-read"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                {notifications.length > 0 && onClearAll && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClearAll}
                    data-testid="button-mobile-clear-all"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center justify-center pt-1">
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </div>
          </SheetHeader>
          <ScrollArea className="flex-1 h-[calc(80vh-80px)]">
            <div className="notification-list py-2">
              {notifications.length === 0 ? (
                <NotificationEmptyState locale={locale} />
              ) : (
                notifications.map((notification) => (
                  <NotificationListItem
                    key={notification.id}
                    notification={notification}
                    locale={locale}
                    onClick={() => handleNotificationClick(notification)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {animatedPopups.length > 0 && (
        <div
          className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none"
          style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 0.5rem)' }}
        >
          <div className="flex flex-col gap-2 px-3">
            {animatedPopups.map((animatedNotif) => (
              <MobilePopupNotification
                key={animatedNotif.id}
                notification={animatedNotif.data}
                animationClass={animatedNotif.className}
                locale={locale}
                onClick={() => handlePopupClick(animatedNotif.data)}
                onDismiss={() => dismissPopup(animatedNotif.id)}
                onSwipeDismiss={() => handleSwipeDismiss(animatedNotif.id)}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface MobilePopupNotificationProps {
  notification: NotificationData;
  animationClass: string;
  locale: 'en' | 'ar';
  onClick: () => void;
  onDismiss: () => void;
  onSwipeDismiss: () => void;
}

function MobilePopupNotification({
  notification,
  animationClass,
  locale,
  onClick,
  onDismiss,
}: MobilePopupNotificationProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchDelta, setTouchDelta] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const delta = e.touches[0].clientY - touchStart;
    if (delta < 0) {
      setTouchDelta(delta);
    }
  };

  const handleTouchEnd = () => {
    if (touchDelta < -50) {
      onDismiss();
    }
    setTouchStart(null);
    setTouchDelta(0);
    setIsDragging(false);
  };

  return (
    <div
      className={cn(
        'pointer-events-auto',
        'notification-popup',
        'touch-pan-y',
        animationClass
      )}
      style={{
        transform: touchDelta < 0 ? `translateY(${touchDelta}px)` : undefined,
        opacity: touchDelta < 0 ? 1 + touchDelta / 100 : 1,
        transition: isDragging ? 'none' : 'transform 200ms ease, opacity 200ms ease',
      }}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      data-testid={`mobile-popup-${notification.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="notification-avatar flex-shrink-0">
          {notification.avatarUrl ? (
            <img
              src={notification.avatarUrl}
              alt=""
              className="w-full h-full object-cover rounded-full"
            />
          ) : (
            <span className="text-sm font-medium">
              {notification.avatarInitials || notification.title.slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-sm truncate">{notification.title}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatPopupTime(notification.timestamp, locale)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">
            {notification.body}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 -mr-2"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          data-testid={`button-dismiss-mobile-${notification.id}`}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex justify-center mt-1">
        <div className="w-8 h-1 bg-muted-foreground/30 rounded-full" />
      </div>
    </div>
  );
}

export default MobileNotificationView;
