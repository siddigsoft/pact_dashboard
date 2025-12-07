
import React, { useState } from 'react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Chat } from '@/types/chat';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/user/UserContext';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Users, 
  MessageSquare, 
  Plus, 
  Calendar,
  MapPin,
  File,
  Image,
  Mic,
  Paperclip
} from 'lucide-react';

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  onClick: () => void;
}

const ChatItem: React.FC<ChatItemProps> = ({ chat, isActive, onClick }) => {
  const getLastMessageIcon = () => {
    if (!chat.lastMessage) return null;
    switch (chat.lastMessage.contentType) {
      case 'image': return <Image className="h-3 w-3" />;
      case 'file': return <Paperclip className="h-3 w-3" />;
      case 'location': return <MapPin className="h-3 w-3" />;
      case 'audio': return <Mic className="h-3 w-3" />;
      default: return null;
    }
  };

  const getLastMessageText = () => {
    if (!chat.lastMessage?.content) {
      return chat.type === 'private' ? 'No messages yet' : `${chat.participants.length} participants`;
    }
    switch (chat.lastMessage.contentType) {
      case 'image': return 'Photo';
      case 'file': return 'File';
      case 'location': return 'Location';
      case 'audio': return 'Voice message';
      default: return chat.lastMessage.content;
    }
  };

  return (
    <button 
      className={`w-full p-3 rounded-lg text-left transition-all ${
        isActive 
          ? 'bg-primary/10 dark:bg-primary/20' 
          : 'hover:bg-muted/50 dark:hover:bg-gray-800'
      }`}
      onClick={onClick}
      data-testid={`chat-item-${chat.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          {chat.type === 'private' ? (
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-medium">
                {chat.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : chat.type === 'state-group' ? (
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                <MapPin className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <Users className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
          )}
          {chat.type === 'private' && (
            <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`font-medium text-sm truncate ${
              chat.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'
            }`}>
              {chat.name}
            </h3>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              {formatDistanceToNow(new Date(chat.lastMessage?.timestamp || chat.createdAt), { 
                addSuffix: false 
              })}
            </span>
          </div>

          {chat.relatedEntityType && (
            <div className="flex items-center text-[10px] text-muted-foreground mt-0.5">
              {chat.relatedEntityType === 'mmpFile' && <File className="h-2.5 w-2.5 mr-1" />}
              {chat.relatedEntityType === 'siteVisit' && <MapPin className="h-2.5 w-2.5 mr-1" />}
              {chat.relatedEntityType === 'project' && <Calendar className="h-2.5 w-2.5 mr-1" />}
              <span>
                {chat.relatedEntityType === 'mmpFile' && 'MMP File'}
                {chat.relatedEntityType === 'siteVisit' && 'Site Visit'}
                {chat.relatedEntityType === 'project' && 'Project'}
              </span>
            </div>
          )}
          
          <div className="flex items-center justify-between mt-1">
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {getLastMessageIcon()}
              <span className="truncate">{getLastMessageText()}</span>
            </p>
            {chat.unreadCount > 0 && (
              <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px] font-semibold">
                {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </button>
  );
};

const ChatSidebar: React.FC = () => {
  const { chats, activeChat, setActiveChat, createChat } = useChat();
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const { currentUser, users } = useUser();
  const availableUsers = users.filter(u => u.id !== currentUser?.id);
  const filteredUsersList = userSearch 
    ? availableUsers.filter(u => (u.fullName || u.name || u.username || '').toLowerCase().includes(userSearch.toLowerCase()))
    : availableUsers;

  const handleStartChatWith = async (userId: string, displayName: string) => {
    try {
      const chat = await createChat([userId], displayName, 'private');
      if (chat) {
        setActiveChat(chat);
        setIsNewChatOpen(false);
        setUserSearch('');
      }
    } catch (error) {
      console.error('Error starting chat:', error);
    }
  };
  
  const filteredChats = searchQuery 
    ? chats.filter(chat => 
        chat.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  const unreadCount = chats.reduce((acc, chat) => acc + (chat.unreadCount || 0), 0);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-3 border-b bg-card dark:bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold" data-testid="text-messages-title">Messages</h2>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 text-[10px]" data-testid="badge-unread-count">
                {unreadCount}
              </Badge>
            )}
          </div>
          <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" data-testid="button-new-chat">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Message</DialogTitle>
                <DialogDescription>Select someone to start a conversation</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    className="pl-9"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    data-testid="input-search-users"
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="space-y-1">
                    {filteredUsersList.map(u => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted dark:hover:bg-gray-800 text-left transition-colors"
                        onClick={() => handleStartChatWith(u.id, u.fullName || u.name || u.username || 'Chat')}
                        data-testid={`user-item-${u.id}`}
                      >
                        <div className="relative">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white text-sm">
                              {(u.fullName || u.name || u.username || 'U').charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-background" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {u.fullName || u.name || u.username || 'User'}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {u.role || 'Team Member'}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filteredUsersList.length === 0 && (
                      <div className="py-8 text-center">
                        <Users className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-sm text-muted-foreground">No contacts found</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="relative">
          <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-9 h-8 text-sm bg-muted/50 dark:bg-gray-800 border-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-chats"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {filteredChats.length > 0 ? (
            filteredChats.map(chat => (
              <ChatItem 
                key={chat.id}
                chat={chat}
                isActive={activeChat?.id === chat.id}
                onClick={() => setActiveChat(chat)}
              />
            ))
          ) : (
            <div className="py-12 text-center">
              <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                {searchQuery ? 'No chats found' : 'No conversations yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {searchQuery ? 'Try a different search' : 'Start a new message to begin'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;
