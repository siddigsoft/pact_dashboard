
import React, { useState } from 'react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Chat } from '@/types/chat';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/user/UserContext';
import { formatDistanceToNow } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Avatar } from '@/components/ui/avatar';
import { 
  Search, 
  Users, 
  MessageSquare, 
  Plus, 
  Calendar,
  MapPin,
  File
} from 'lucide-react';

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
            <div className="flex items-center justify-between">
              <h3 className={`font-medium text-sm ${chat.unreadCount > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>
                {chat.name}
              </h3>
              {chat.unreadCount > 0 && (
                <span className="bg-primary text-white text-xs rounded-full px-2 py-0.5 ml-2">
                  {chat.unreadCount}
                </span>
              )}
            </div>

            {chat.relatedEntityType && (
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                {chat.relatedEntityType === 'mmpFile' && <File size={12} className="mr-1" />}
                {chat.relatedEntityType === 'siteVisit' && <MapPin size={12} className="mr-1" />}
                {chat.relatedEntityType === 'project' && <Calendar size={12} className="mr-1" />}
                <span>
                  {chat.relatedEntityType === 'mmpFile' && 'MMP File'}
                  {chat.relatedEntityType === 'siteVisit' && 'Site Visit'}
                  {chat.relatedEntityType === 'project' && 'Project'}
                </span>
              </div>
            )}
            
            <p className="text-xs text-muted-foreground mt-1 truncate max-w-[200px]">
              {chat.lastMessage?.content 
                ? (chat.lastMessage.contentType === 'image' 
                    ? '📷 Image' 
                    : chat.lastMessage.contentType === 'file' 
                    ? '📎 File' 
                    : chat.lastMessage.contentType === 'location'
                    ? '📍 Location'
                    : chat.lastMessage.contentType === 'audio'
                    ? '🎤 Audio'
                    : chat.lastMessage.content)
                : (chat.type === 'private' 
                    ? 'No messages yet' 
                    : `${chat.participants.length} participants`)}
            </p>
          </div>
        </div>
        
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {formatDistanceToNow(new Date(chat.lastMessage?.timestamp || chat.createdAt), { 
            addSuffix: true,
            includeSeconds: true
          })}
        </div>
      </div>
    </div>
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
      // Error is already handled in createChat with toast
    }
  };
  
  const filteredChats = searchQuery 
    ? chats.filter(chat => 
        chat.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : chats;

  return (
    <div className="w-full h-full flex flex-col border-r">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-4">Messages</h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search chats..."
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="outline" className="h-10 w-10">
                <Plus size={18} />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Start a new chat</DialogTitle>
                <DialogDescription>Select a user to start a conversation</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    className="pl-8"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
                <ScrollArea className="h-64">
                  <div className="space-y-1">
                    {filteredUsersList.map(u => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-3 p-2 rounded-md hover:bg-muted text-left"
                        onClick={() => handleStartChatWith(u.id, u.fullName || u.name || u.username || 'Chat')}
                      >
                        <Avatar className="h-8 w-8">
                          <div className="bg-primary/20 w-full h-full rounded-full flex items-center justify-center text-primary">
                            {(u.fullName || u.name || u.username || 'U').charAt(0).toUpperCase()}
                          </div>
                        </Avatar>
                        <div className="flex-1">
                          <div className="text-sm font-medium">
                            {u.fullName || u.name || u.username || 'User'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {u.role || ''}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filteredUsersList.length === 0 && (
                      <div className="text-sm text-muted-foreground p-3">No users found</div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </DialogContent>
          </Dialog>
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
            <div className="py-8 text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground mt-2">
                {searchQuery ? 'No chats found' : 'No chats yet'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default ChatSidebar;
