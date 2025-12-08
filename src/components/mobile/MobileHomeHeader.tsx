import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Bell, Power } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { MobileDrawerMenu } from './MobileDrawerMenu';

interface MobileHomeHeaderProps {
  className?: string;
  notificationCount?: number;
  onLogout?: () => void;
  logoText?: string;
}

export function MobileHomeHeader({ 
  className, 
  notificationCount = 0,
  onLogout,
  logoText = 'PACT'
}: MobileHomeHeaderProps) {
  const navigate = useNavigate();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleMenuPress = () => {
    hapticPresets.buttonPress();
    setIsDrawerOpen(true);
  };

  const handleNotificationPress = () => {
    hapticPresets.buttonPress();
    navigate('/notifications');
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-40 safe-area-top",
          "bg-black dark:bg-white",
          className
        )}
        data-testid="mobile-home-header"
      >
        <div className="flex items-center justify-between h-14 px-2">
          {/* Left - Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleMenuPress}
            className="text-white dark:text-black"
            data-testid="button-menu"
          >
            <Menu className="w-6 h-6" />
          </Button>

          {/* Center - Logo */}
          <div className="flex items-center justify-center">
            <span className="text-lg font-bold text-white dark:text-black tracking-wide">
              {logoText}
            </span>
          </div>

          {/* Right - Actions */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleNotificationPress}
              className="relative text-white dark:text-black"
              data-testid="button-notifications"
            >
              <Bell className="w-5 h-5" />
              {notificationCount > 0 && (
                <Badge 
                  className={cn(
                    "absolute -top-1 -right-1 h-5 min-w-[20px] p-0 flex items-center justify-center",
                    "bg-red-500 text-white text-[10px] font-bold rounded-full"
                  )}
                >
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              className="text-white dark:text-black"
              data-testid="button-power"
            >
              <Power className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Drawer Menu */}
      <MobileDrawerMenu 
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        onLogout={onLogout}
      />
    </>
  );
}

export default MobileHomeHeader;
