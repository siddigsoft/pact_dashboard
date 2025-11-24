
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, Menu, Bell } from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface MobileAppHeaderProps {
  toggleSidebar?: () => void;
  title?: string;
  showNotification?: boolean;
}

const MobileAppHeader = ({ 
  toggleSidebar, 
  title = "Field Operations",
  showNotification = true
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useUser();
  const isRoot = location.pathname === '/field-team';
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const hasNotifications = true; // This would be from a notification context in a real app

  return (
    <header className="px-4 h-16 flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600 shadow-md">
      <div className="flex items-center gap-2">
        {!isRoot ? (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate(-1)}
            className="h-9 w-9 text-white hover:bg-white/10"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        ) : (
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={toggleSidebar}
            className="h-9 w-9 text-white hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h1 className="text-lg font-semibold text-white truncate max-w-[180px]">
          {title}
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        {showNotification && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative h-9 w-9 text-white hover:bg-white/10" 
            onClick={() => navigate('/notifications')}
          >
            <Bell className="h-5 w-5" />
            {hasNotifications && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center bg-red-500">
                <span className="sr-only">New notifications</span>
              </Badge>
            )}
          </Button>
        )}
        
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full h-9 w-9 p-1 border border-white/30" 
          onClick={() => navigate('/profile')}
        >
          <Avatar className="h-full w-full">
            <AvatarImage src={currentUser?.avatar} alt={currentUser?.name || ''} />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-700 text-white">{currentUser?.name ? getInitials(currentUser.name) : "FO"}</AvatarFallback>
          </Avatar>
        </Button>
      </div>
    </header>
  );
};

export default MobileAppHeader;
