import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useUser } from '@/context/user/UserContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import ChatWindow from '@/components/chat/ChatWindow';
import { 
  ArrowLeft, 
  Search,
  Plus,
  MessageSquare,
  Users,
  Phone,
  Video,
  MoreHorizontal,
  Settings,
  Bell,
  X,
  Circle,
  CheckCheck
} from 'lucide-react';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const { toast } = useToast();
  const isMobile = viewMode === 'mobile';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const { chats, activeChat, setActiveChat } = useChat();
  const { initiateCall } = useCommunication();
  const { users } = useUser();

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  const handleSelectChat = (chatId: string) => {
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
      setActiveChat(chat);
      if (isMobile) {
        setActiveView('chat');
      }
    }
  };

  const handleBackToList = () => {
    setActiveView('list');
    setActiveChat(null);
  };

  const getTargetUser = () => {
    if (!activeChat || activeChat.type !== 'private') return null;
    const targetUserId = activeChat.participants.find(id => id !== currentUser?.id);
    if (!targetUserId) return null;
    return users.find(u => u.id === targetUserId);
  };

  const handleVoiceCall = () => {
    const targetUser = getTargetUser();
    if (!targetUser) {
      toast({
        title: 'Cannot call',
        description: activeChat?.type === 'group' ? 'Group calls are not supported yet' : 'Please select a chat first',
        variant: 'destructive',
      });
      return;
    }
    initiateCall(targetUser);
    navigate('/calls');
  };

  const handleVideoCall = () => {
    const targetUser = getTargetUser();
    if (!targetUser) {
      toast({
        title: 'Cannot call',
        description: activeChat?.type === 'group' ? 'Group calls are not supported yet' : 'Please select a chat first',
        variant: 'destructive',
      });
      return;
    }
    initiateCall(targetUser);
    navigate('/calls');
  };

  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // MOBILE VIEW
  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col bg-background" data-testid="chat-page">
        {activeView === 'list' ? (
          <div className="flex flex-col h-full">
            <header className="shrink-0 bg-foreground text-background px-4 py-4 safe-area-top">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => navigate('/dashboard')} 
                    className="p-2 -ml-2 rounded-full hover:bg-background/10 transition-colors"
                    data-testid="button-go-back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h1 className="text-xl font-bold tracking-tight">Messages</h1>
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    className="p-2 rounded-full hover:bg-background/10 transition-colors"
                    data-testid="button-notifications"
                  >
                    <Bell className="h-5 w-5" />
                  </button>
                  <button 
                    className="p-2 rounded-full hover:bg-background/10 transition-colors"
                    data-testid="button-new-message"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-background/50" />
                <input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-background/10 text-background placeholder:text-background/50 text-sm focus:outline-none focus:bg-background/20 transition-colors"
                  data-testid="input-search"
                />
              </div>
            </header>
            
            <ScrollArea className="flex-1 bg-background">
              {filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6">
                  <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
                    <MessageSquare className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <p className="text-foreground font-semibold text-lg">No messages yet</p>
                  <p className="text-muted-foreground text-sm mt-1 text-center">Start a new conversation with your team</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => handleSelectChat(chat.id)}
                      className="w-full px-4 py-4 flex items-center gap-4 hover:bg-muted/50 active:bg-muted transition-colors text-left"
                      data-testid={`chat-item-${chat.id}`}
                    >
                      <div className="relative">
                        <Avatar className="h-14 w-14">
                          <AvatarFallback className="bg-foreground text-background font-bold text-lg">
                            {chat.type === 'group' || chat.type === 'state-group' ? (
                              <Users className="h-6 w-6" />
                            ) : (
                              chat.name.charAt(0).toUpperCase()
                            )}
                          </AvatarFallback>
                        </Avatar>
                        {chat.type === 'private' && (
                          <div className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-foreground truncate">{chat.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {formatTime(chat.lastMessage?.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-sm text-muted-foreground truncate flex items-center gap-1">
                            {chat.lastMessage?.senderId === currentUser?.id && (
                              <CheckCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                            )}
                            {chat.lastMessage?.content || 'Start a conversation'}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="min-w-[24px] h-6 px-2 rounded-full bg-foreground text-background text-xs font-bold flex items-center justify-center shrink-0">
                              {chat.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <header className="shrink-0 bg-foreground text-background px-4 py-3 safe-area-top">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleBackToList} 
                    className="p-2 -ml-2 rounded-full hover:bg-background/10 transition-colors"
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  {activeChat && (
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-background text-foreground font-semibold text-sm">
                            {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                              <Users className="h-4 w-4" />
                            ) : (
                              activeChat.name.charAt(0).toUpperCase()
                            )}
                          </AvatarFallback>
                        </Avatar>
                        {activeChat.type === 'private' && (
                          <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-foreground" />
                        )}
                      </div>
                      <div>
                        <h2 className="font-semibold text-sm">{activeChat.name}</h2>
                        <p className="text-xs text-background/60">
                          {activeChat.type === 'private' ? 'Online' : `${activeChat.participants.length} members`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={handleVoiceCall}
                    className="p-2 rounded-full hover:bg-background/10 transition-colors"
                    data-testid="button-voice-call"
                  >
                    <Phone className="h-5 w-5" />
                  </button>
                  <button 
                    onClick={handleVideoCall}
                    className="p-2 rounded-full hover:bg-background/10 transition-colors"
                    data-testid="button-video-call"
                  >
                    <Video className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </header>
            <div className="flex-1 overflow-hidden bg-background">
              <ChatWindow />
            </div>
          </div>
        )}
      </div>
    );
  }

  // WEB VIEW - Full Screen Modern Layout
  return (
    <div className="h-screen w-screen flex bg-background" data-testid="chat-page">
      {/* Left Sidebar - Conversation List */}
      <div className="w-[380px] h-full border-r border-border flex flex-col shrink-0 bg-card">
        {/* Header */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-border bg-foreground text-background">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="p-2 rounded-full hover:bg-background/10 transition-colors" 
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-bold tracking-tight" data-testid="text-page-title">Messages</h1>
          </div>
          <div className="flex items-center gap-1">
            <button 
              onClick={() => navigate('/notifications')}
              className="p-2 rounded-full hover:bg-background/10 transition-colors" 
              data-testid="button-notifications"
            >
              <Bell className="h-5 w-5" />
            </button>
            <button 
              className="p-2 rounded-full hover:bg-background/10 transition-colors" 
              data-testid="button-new-message"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-11 pr-4 rounded-xl bg-muted text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              data-testid="input-search"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-background"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Conversations */}
        <ScrollArea className="flex-1">
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <MessageSquare className="h-10 w-10 text-muted-foreground" />
              </div>
              <p className="text-foreground font-semibold text-lg">No conversations</p>
              <p className="text-muted-foreground text-sm mt-1 text-center">Start messaging your team</p>
              <Button className="mt-4" size="sm" data-testid="button-start-chat">
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>
          ) : (
            <div className="px-2 py-1">
              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  className={`w-full px-3 py-3 flex items-center gap-4 rounded-xl transition-all mb-1 ${
                    activeChat?.id === chat.id 
                      ? 'bg-foreground text-background' 
                      : 'hover:bg-muted'
                  }`}
                  data-testid={`chat-item-${chat.id}`}
                >
                  <div className="relative">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className={`font-bold text-lg ${
                        activeChat?.id === chat.id 
                          ? 'bg-background text-foreground' 
                          : 'bg-foreground text-background'
                      }`}>
                        {chat.type === 'group' || chat.type === 'state-group' ? (
                          <Users className="h-5 w-5" />
                        ) : (
                          chat.name.charAt(0).toUpperCase()
                        )}
                      </AvatarFallback>
                    </Avatar>
                    {chat.type === 'private' && (
                      <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 ${
                        activeChat?.id === chat.id ? 'border-foreground' : 'border-card'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-semibold truncate ${
                        activeChat?.id === chat.id ? '' : 'text-foreground'
                      }`}>{chat.name}</span>
                      <span className={`text-xs shrink-0 ${
                        activeChat?.id === chat.id ? 'text-background/60' : 'text-muted-foreground'
                      }`}>
                        {formatTime(chat.lastMessage?.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className={`text-sm truncate flex items-center gap-1 ${
                        activeChat?.id === chat.id ? 'text-background/70' : 'text-muted-foreground'
                      }`}>
                        {chat.lastMessage?.senderId === currentUser?.id && (
                          <CheckCheck className={`h-3.5 w-3.5 shrink-0 ${
                            activeChat?.id === chat.id ? 'text-background/70' : 'text-primary'
                          }`} />
                        )}
                        {chat.lastMessage?.content || 'No messages yet'}
                      </p>
                      {chat.unreadCount > 0 && activeChat?.id !== chat.id && (
                        <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="flex-1 h-full flex flex-col bg-background">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-6 flex items-center justify-between border-b border-border bg-card shrink-0">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Avatar className="h-11 w-11">
                    <AvatarFallback className="bg-foreground text-background font-bold">
                      {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        activeChat.name.charAt(0).toUpperCase()
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {activeChat.type === 'private' && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-card" />
                  )}
                </div>
                <div>
                  <h2 className="font-semibold text-foreground">{activeChat.name}</h2>
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    {activeChat.type === 'private' ? (
                      <>
                        <Circle className="h-2 w-2 fill-green-500 text-green-500" />
                        <span className="text-green-600 dark:text-green-400">Active now</span>
                      </>
                    ) : (
                      `${activeChat.participants.length} members`
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleVoiceCall}
                  className="rounded-full hover:bg-muted"
                  data-testid="button-voice-call"
                >
                  <Phone className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={handleVideoCall}
                  className="rounded-full hover:bg-muted"
                  data-testid="button-video-call"
                >
                  <Video className="h-5 w-5 text-muted-foreground" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="rounded-full hover:bg-muted"
                  data-testid="button-more-options"
                >
                  <MoreHorizontal className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 overflow-hidden">
              <ChatWindow />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-muted/30">
            <div className="text-center max-w-md px-6">
              <div className="w-28 h-28 rounded-3xl bg-foreground flex items-center justify-center mx-auto mb-6 shadow-xl">
                <MessageSquare className="h-14 w-14 text-background" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">Welcome to Messages</h3>
              <p className="text-muted-foreground leading-relaxed">
                Select a conversation from the sidebar to start messaging, or create a new chat with your team members.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button variant="outline" onClick={() => navigate('/calls')} data-testid="button-go-calls">
                  <Phone className="h-4 w-4 mr-2" />
                  View Calls
                </Button>
                <Button data-testid="button-new-conversation">
                  <Plus className="h-4 w-4 mr-2" />
                  New Conversation
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
