
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { MessageSquare, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const ChatIndicatorWidget: React.FC = () => {
  const { chats, setActiveChat } = useChat();
  const navigate = useNavigate();
  
  // Get the 3 most recent chats
  const recentChats = [...chats]
    .sort((a, b) => new Date(b.lastMessage?.timestamp || b.createdAt).getTime() - 
                    new Date(a.lastMessage?.timestamp || a.createdAt).getTime())
    .slice(0, 3);
  
  // Count total unread
  const totalUnread = chats.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);
  
  const handleChatClick = (chat: typeof chats[0]) => {
    setActiveChat(chat);
    navigate('/chat');
  };
  
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">Messages</CardTitle>
          {totalUnread > 0 && (
            <span className="bg-primary text-white text-xs rounded-full px-2 py-0.5">
              {totalUnread} new
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {recentChats.length > 0 ? (
          <div className="space-y-3">
            {recentChats.map((chat) => (
              <div 
                key={chat.id}
                className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer"
                onClick={() => handleChatClick(chat)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    chat.type === 'private' ? 'bg-primary/20' : 'bg-secondary/20'
                  }`}>
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">
                      {chat.name}
                      {chat.unreadCount > 0 && (
                        <span className="ml-2 bg-primary text-white text-xs rounded-full px-1.5 py-0.5">
                          {chat.unreadCount}
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">
                      {chat.lastMessage?.content || `${chat.participants.length} participants`}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(
                    new Date(chat.lastMessage?.timestamp || chat.createdAt),
                    { addSuffix: true }
                  )}
                </p>
              </div>
            ))}
            
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full mt-2"
              onClick={() => navigate('/chat')}
            >
              View All Messages
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No recent messages</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={() => navigate('/chat')}
            >
              Start a conversation
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ChatIndicatorWidget;
