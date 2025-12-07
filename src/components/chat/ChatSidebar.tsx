
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
      className={`w-full p-3 rounded-xl text-left transition-all duration-200 group ${
        isActive 
          ? 'bg-primary/10 dark:bg-primary/20 shadow-sm ring-1 ring-primary/20' 
          : 'hover:bg-muted/60 dark:hover:bg-gray-800/80'
      }`}
      onClick={onClick}
      data-testid={`chat-item-${chat.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="relative">
          {chat.type === 'private' ? (
            <Avatar className={`h-12 w-12 ring-2 ring-offset-2 ring-offset-background transition-all ${isActive ? 'ring-primary/30' : 'ring-transparent group-hover:ring-primary/20'}`}>
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold text-sm">
                {chat.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          ) : chat.type === 'state-group' ? (
            <Avatar className={`h-12 w-12 ring-2 ring-offset-2 ring-offset-background transition-all ${isActive ? 'ring-green-400/30' : 'ring-transparent group-hover:ring-green-400/20'}`}>
              <AvatarFallback className="bg-gradient-to-br from-green-500 to-green-600 text-white">
                <MapPin className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className={`h-12 w-12 ring-2 ring-offset-2 ring-offset-background transition-all ${isActive ? 'ring-purple-400/30' : 'ring-transparent group-hover:ring-purple-400/20'}`}>
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <Users className="h-5 w-5" />
              </AvatarFallback>
            </Avatar>
          )}
          {chat.type === 'private' && (
            <div className="absolute bottom-0.5 right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-background shadow-sm">
              <div className="w-full h-full rounded-full bg-green-400 animate-pulse" />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className={`font-semibold text-sm truncate transition-colors ${
              chat.unreadCount > 0 ? 'text-foreground' : isActive ? 'text-foreground' : 'text-foreground/80'
            }`}>
              {chat.name}
            </h3>
            <span className={`text-[10px] whitespace-nowrap ${chat.unreadCount > 0 ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
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
          
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <p className={`text-xs truncate flex items-center gap-1.5 ${chat.unreadCount > 0 ? 'text-foreground/70 font-medium' : 'text-muted-foreground'}`}>
              {getLastMessageIcon()}
              <span className="truncate">{getLastMessageText()}</span>
            </p>
            {chat.unreadCount > 0 && (
              <Badge variant="default" className="h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full shadow-sm">
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
      <div className="p-4 border-b bg-card/95 dark:bg-gray-900/95 backdrop-blur-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight" data-testid="text-messages-title">Messages</h2>
            {unreadCount > 0 && (
              <Badge variant="destructive" className="h-5 px-2 text-[10px] font-bold rounded-full shadow-sm" data-testid="badge-unread-count">
                {unreadCount}
              </Badge>
            )}
          </div>
          <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-9 w-9 rounded-full hover:bg-primary/10 transition-colors" data-testid="button-new-chat">
                <Plus className="h-5 w-5" />
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
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            className="pl-10 h-10 text-sm bg-muted/50 dark:bg-gray-800/80 border border-border/30 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-chats"
          />
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
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
            <div className="py-16 text-center px-4">
              <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary/40" />
              </div>
              <p className="text-sm font-semibold text-foreground/80">
                {searchQuery ? 'No chats found' : 'No conversations yet'}
              </p>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {searchQuery ? 'Try a different search term' : 'Start a new message to connect with your team'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;
