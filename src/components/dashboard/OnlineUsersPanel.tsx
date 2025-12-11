import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, MessageCircle, Video, User, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useGlobalPresence } from '@/context/presence/GlobalPresenceContext';
import { useUser } from '@/context/user/UserContext';
import { useCall } from '@/context/communications/CallContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface OnlineUsersPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OnlineUserInfo {
  id: string;
  name: string;
  avatar?: string;
  role: string;
}

export function OnlineUsersPanel({ isOpen, onClose }: OnlineUsersPanelProps) {
  const { onlineUserIds } = useGlobalPresence();
  const { currentUser } = useUser();
  const { initiateCall } = useCall();
  const { createChat, setActiveChat } = useChat();
  const navigate = useNavigate();
  
  const [onlineUsers, setOnlineUsers] = useState<OnlineUserInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Load user details for online users
  useEffect(() => {
    if (!isOpen || onlineUserIds.length === 0) {
      setOnlineUsers([]);
      return;
    }

    const loadOnlineUsers = async () => {
      setIsLoading(true);
      try {
        // Filter out current user from the list
        const otherUserIds = onlineUserIds.filter(id => id !== currentUser?.id);
        
        if (otherUserIds.length === 0) {
          setOnlineUsers([]);
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, role')
          .in('id', otherUserIds);

        if (error) throw error;

        setOnlineUsers(
          (data || []).map(u => ({
            id: u.id,
            name: u.full_name || 'Unknown User',
            avatar: u.avatar_url || undefined,
            role: u.role || 'user',
          }))
        );
      } catch (error) {
        console.error('[OnlineUsers] Failed to load users:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadOnlineUsers();
  }, [isOpen, onlineUserIds, currentUser?.id]);

  const filteredUsers = onlineUsers.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCall = (user: OnlineUserInfo) => {
    initiateCall({
      id: user.id,
      name: user.name,
      fullName: user.name,
      avatar: user.avatar,
    } as any);
    navigate('/calls');
    onClose();
  };

  const handleMessage = async (user: OnlineUserInfo) => {
    try {
      const chat = await createChat([user.id]);
      if (chat) {
        setActiveChat(chat);
        navigate('/chat');
        onClose();
      }
    } catch (error) {
      console.error('[OnlineUsers] Failed to start chat:', error);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-background border-l border-border shadow-xl flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <User className="h-5 w-5" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                </div>
                <h2 className="text-lg font-semibold">Online Now</h2>
                <Badge variant="secondary">{filteredUsers.length}</Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                data-testid="button-close-online-panel"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search online users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                  data-testid="input-search-online-users"
                />
              </div>
            </div>

            {/* User List */}
            <ScrollArea className="flex-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                  <User className="h-12 w-12 text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">
                    {onlineUsers.length === 0 
                      ? 'No other users online right now'
                      : 'No users match your search'}
                  </p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {filteredUsers.map((user) => (
                    <div
                      key={user.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg",
                        "hover:bg-muted/50 transition-colors"
                      )}
                      data-testid={`online-user-${user.id}`}
                    >
                      {/* Avatar with online indicator */}
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatar} alt={user.name} />
                          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-background" />
                      </div>

                      {/* User Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground capitalize truncate">
                          {user.role.replace(/_/g, ' ')}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleMessage(user)}
                          title="Send Message"
                          data-testid={`button-message-${user.id}`}
                        >
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCall(user)}
                          title="Voice Call"
                          data-testid={`button-call-${user.id}`}
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCall(user)}
                          title="Video Call"
                          data-testid={`button-video-${user.id}`}
                        >
                          <Video className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Footer hint */}
            <div className="p-3 border-t border-border bg-muted/30">
              <p className="text-xs text-muted-foreground text-center">
                Users are shown as online when they have the app open
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
