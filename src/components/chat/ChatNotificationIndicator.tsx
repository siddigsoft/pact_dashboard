
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Button } from '@/components/ui/button';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { MessageSquare } from 'lucide-react';

interface ChatNotificationIndicatorProps {
  variant?: 'nav' | 'mobile';
}

const ChatNotificationIndicator: React.FC<ChatNotificationIndicatorProps> = ({ 
  variant = 'nav' 
}) => {
  const { getUnreadMessagesCount } = useChat();
  const navigate = useNavigate();
  const unreadCount = getUnreadMessagesCount();
  
  const handleClick = () => {
    navigate('/chat');
  };
  
  if (variant === 'mobile') {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={handleClick}
      >
        <MessageSquare size={22} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full h-5 w-5 flex items-center justify-center text-xs">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </Button>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={handleClick}
          >
            <MessageSquare size={20} />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-white rounded-full h-5 w-5 flex items-center justify-center text-xs">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {unreadCount > 0 
              ? `${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`
              : 'Messages'
            }
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default ChatNotificationIndicator;
