import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Phone, MessageCircle, Video, User, Search, Loader2, Globe, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useGlobalPresence, type PresenceSource } from '@/context/presence/GlobalPresenceContext';
import { useUser } from '@/context/user/UserContext';
import { useCall } from '@/context/communications/CallContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useProfilesByIds } from '@/hooks/useUserDirectory';
import { displayNameFromProfile } from '@/services/userDirectory';

interface OnlineUsersPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface OnlineUserInfo {
  id: string;
  name: string;
  avatar?: string;
  role: string;
  sources: PresenceSource[];
}

function SourceBadge({ source }: { source: PresenceSource }) {
  const isWeb = source === 'web';
  const Icon = isWeb ? Globe : Smartphone;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        isWeb
          ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400'
          : 'bg-violet-500/10 text-violet-700 dark:text-violet-400'
      )}
      data-testid={`badge-source-${source}`}
    >
      <Icon className="h-3 w-3" />
      {isWeb ? 'Web' : 'Mobile'}
    </span>
  );
}

export function OnlineUsersPanel({ isOpen, onClose }: OnlineUsersPanelProps) {
  const { onlineUserIds, webUserIds, mobileUserIds, getUserSources } = useGlobalPresence();
  const { currentUser } = useUser();
  const { initiateCall } = useCall();
  const { createChat, setActiveChat } = useChat();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');

  const otherUserIds = useMemo(
    () => (isOpen ? onlineUserIds.filter((id) => id !== currentUser?.id) : []),
    [isOpen, onlineUserIds, currentUser?.id]
  );

  const webCount = useMemo(
    () => webUserIds.filter((id) => id !== currentUser?.id).length,
    [webUserIds, currentUser?.id]
  );

  const mobileCount = useMemo(
    () => mobileUserIds.filter((id) => id !== currentUser?.id).length,
    [mobileUserIds, currentUser?.id]
  );

  const { data: profiles = [], isLoading } = useProfilesByIds(otherUserIds, isOpen && otherUserIds.length > 0);

  const onlineUsers = useMemo((): OnlineUserInfo[] => {
    return profiles.map((p) => ({
      id: p.id,
      name: displayNameFromProfile(p),
      avatar: p.avatar_url || undefined,
      role: p.role || 'user',
      sources: getUserSources(p.id),
    }));
  }, [profiles, getUserSources]);

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
      // Partial user — CallContext only needs identity fields for outbound calls
    } as Parameters<typeof initiateCall>[0]);
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
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative">
                  <User className="h-5 w-5" />
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold">Online Now</h2>
                    <Badge variant="secondary">{filteredUsers.length}</Badge>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1" data-testid="count-web-online">
                      <Globe className="h-3 w-3" />
                      {webCount} web
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1" data-testid="count-mobile-online">
                      <Smartphone className="h-3 w-3" />
                      {mobileCount} mobile
                    </span>
                  </div>
                </div>
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
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs text-muted-foreground capitalize truncate">
                            {user.role.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {user.sources.map((source) => (
                            <SourceBadge key={source} source={source} />
                          ))}
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
                Web and mobile users are shown when they have the app open
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
