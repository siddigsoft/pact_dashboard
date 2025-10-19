
import React, { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { 
  MessageSquare, 
  Phone, 
  Bell, 
  Users, 
  Search, 
  ArrowLeft,
  MapPin
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useNavigate } from 'react-router-dom';
import ChatWindow from '@/components/chat/ChatWindow';
import { Chat } from '@/types';

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
}

const ChatItem: React.FC<ChatItemProps> = ({ chat, isActive, onClick }) => {
  return (
    <div 
      className={`p-3 rounded-md cursor-pointer transition-colors ${
        isActive 
          ? 'bg-primary/10 border-l-4 border-primary' 
          : 'hover:bg-muted'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {chat.type === 'private' ? (
            <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary">
              {chat.name.charAt(0).toUpperCase()}
            </div>
          ) : chat.type === 'state-group' ? (
            <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-500">
              <MapPin size={18} />
            </div>
          ) : (
            <div className="w-10 h-10 bg-secondary/20 rounded-full flex items-center justify-center text-secondary">
              <Users size={18} />
            </div>
          )}
          
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <h3 className="font-medium text-sm line-clamp-1">{chat.name}</h3>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(chat.createdAt).toLocaleDateString()}
              </span>
            </div>
            
            {chat.lastMessage ? (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {chat.lastMessage.content}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground italic mt-0.5">
                No messages yet
              </p>
            )}
            
            <div className="flex justify-between items-center mt-1">
              {chat.relatedEntityType && (
                <span className="text-xs bg-accent text-accent-foreground rounded-sm px-1.5 py-0.5">
                  {chat.relatedEntityType === 'mmpFile' ? 'MMP' : 
                   chat.relatedEntityType === 'siteVisit' ? 'Site Visit' : 
                   chat.relatedEntityType === 'project' ? 'Project' : 'Chat'}
                </span>
              )}
              
              {chat.unreadCount > 0 && (
                <Badge className="ml-auto">
                  {chat.unreadCount}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CommunicationPanel = () => {
  const { chats, setActiveChat, activeChat, getUnreadMessagesCount } = useChat();
  const { notifications } = useNotifications();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [showChatView, setShowChatView] = useState(false);

  const unreadCount = getUnreadMessagesCount();
  const unreadNotifications = notifications.filter(n => !n.isRead).length;

  const filteredChats = searchQuery 
    ? chats.filter(chat => 
        chat.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  const handleChatSelect = (chat: Chat) => {
    setActiveChat(chat);
    setShowChatView(true);
  };

  const handleBackToList = () => {
    setShowChatView(false);
    setActiveChat(null);
  };

  const handleOpenCalls = () => {
    navigate('/calls');
  };

  useEffect(() => {
    if (activeChat) {
      setShowChatView(true);
    }
  }, [activeChat]);

  if (showChatView && activeChat) {
    return (
      <div className="flex flex-col h-full">
        <div className="py-2 px-3 border-b flex items-center">
          <Button variant="ghost" size="sm" onClick={handleBackToList} className="mr-2">
            <ArrowLeft size={18} />
          </Button>
          <span className="font-medium">{activeChat.name}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <ChatWindow />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Tabs defaultValue="chats" className="w-full h-full flex flex-col">
        <div className="border-b px-2">
          <TabsList className="w-full grid grid-cols-3 h-12">
            <TabsTrigger value="chats" className="relative">
              <MessageSquare className="h-4 w-4 mr-1" />
              <span>Chats</span>
              {unreadCount > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="calls">
              <Phone className="h-4 w-4 mr-1" />
              <span>Calls</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="relative">
              <Bell className="h-4 w-4 mr-1" />
              <span>Alerts</span>
              {unreadNotifications > 0 && (
                <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="py-2 px-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search communications..."
              className="pl-9 bg-background"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <TabsContent value="chats" className="mt-0 h-full">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {filteredChats.map(chat => (
                  <Card 
                    key={chat.id} 
                    className={`p-3 cursor-pointer hover:bg-accent transition-colors ${chat.unreadCount > 0 ? 'border-l-4 border-l-primary' : ''}`}
                    onClick={() => handleChatSelect(chat)}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 mt-0.5">
                        <div className={`${chat.type === 'group' ? 'bg-secondary/20' : 'bg-primary/20'} w-full h-full rounded-full flex items-center justify-center`}>
                          {chat.type === 'group' ? <Users size={16} /> : chat.name.charAt(0).toUpperCase()}
                        </div>
                      </Avatar>
                      
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h3 className="font-medium text-sm line-clamp-1">{chat.name}</h3>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(chat.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        
                        {chat.lastMessage ? (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                            {chat.lastMessage.content}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground italic mt-0.5">
                            No messages yet
                          </p>
                        )}
                        
                        <div className="flex justify-between items-center mt-1">
                          {chat.relatedEntityType && (
                            <span className="text-xs bg-accent text-accent-foreground rounded-sm px-1.5 py-0.5">
                              {chat.relatedEntityType === 'mmpFile' ? 'MMP' : 
                               chat.relatedEntityType === 'siteVisit' ? 'Site Visit' : 
                               chat.relatedEntityType === 'project' ? 'Project' : 'Chat'}
                            </span>
                          )}
                          
                          {chat.unreadCount > 0 && (
                            <Badge className="ml-auto">
                              {chat.unreadCount}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
                
                {filteredChats.length === 0 && (
                  <div className="py-8 text-center">
                    <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground mt-2">No chats found</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-3 border-t bg-background">
              <Button className="w-full" onClick={() => navigate('/chat')}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Open Full Chat
              </Button>
            </div>
          </TabsContent>
          
          <TabsContent value="calls" className="mt-0 h-full">
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <div className="bg-primary/10 rounded-full p-6">
                <Phone className="h-12 w-12 text-primary" />
              </div>
              <h3 className="text-xl font-medium mt-6">In-App Calling</h3>
              <p className="text-muted-foreground max-w-sm mt-2">
                Initiate voice calls directly to team members and site coordinators without leaving the app
              </p>
              <Button className="mt-6" onClick={handleOpenCalls}>
                Open Call Center
              </Button>
              <p className="text-xs text-muted-foreground mt-4">
                Calls are recorded and stored for audit purposes
              </p>
            </div>
          </TabsContent>
          
          <TabsContent value="notifications" className="mt-0 h-full">
            <ScrollArea className="h-full">
              <div className="p-3 space-y-2">
                {notifications.slice(0, 10).map(notification => (
                  <Card 
                    key={notification.id}
                    className={`p-3 border-l-4 ${
                      notification.type === 'error' ? 'border-l-destructive' :
                      notification.type === 'warning' ? 'border-l-amber-500' :
                      notification.type === 'success' ? 'border-l-green-500' :
                      'border-l-blue-500'
                    } ${notification.isRead ? 'opacity-75' : ''}`}
                  >
                    <div className="flex flex-col">
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium text-sm">{notification.title}</h4>
                        <span className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs mt-1">{notification.message}</p>
                      {notification.link && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          className="mt-1 h-auto p-0 justify-start text-xs"
                          onClick={() => navigate(notification.link!)}
                        >
                          View details
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
                
                {notifications.length === 0 && (
                  <div className="py-8 text-center">
                    <Bell className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p className="text-muted-foreground mt-2">No notifications</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            
            <div className="p-3 border-t bg-background">
              <Button variant="outline" className="w-full" onClick={() => navigate('/notifications')}>
                View All Notifications
              </Button>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default CommunicationPanel;
