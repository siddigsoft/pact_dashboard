import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useUser } from '@/context/user/UserContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  MoreVertical,
  Bell,
  X,
  Check,
  CheckCheck,
  Sparkles
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
        description: activeChat?.type === 'group' ? 'Group calls coming soon' : 'Select a chat first',
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
        description: activeChat?.type === 'group' ? 'Group calls coming soon' : 'Select a chat first',
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
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  // MOBILE VIEW - Uber Style
  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col bg-white dark:bg-black" data-testid="chat-page">
        {activeView === 'list' ? (
          <div className="flex flex-col h-full">
            {/* Uber-style Header */}
            <header className="shrink-0 bg-black px-4 pt-12 pb-6">
              <div className="flex items-center justify-between mb-6">
                <button 
                  onClick={() => navigate('/dashboard')} 
                  className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                  data-testid="button-go-back"
                >
                  <ArrowLeft className="h-5 w-5 text-white" />
                </button>
                <div className="flex items-center gap-2">
                  <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                    <Bell className="h-5 w-5 text-white" />
                  </button>
                  <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                    <Plus className="h-5 w-5 text-black" />
                  </button>
                </div>
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">Messages</h1>
              <p className="text-white/60 text-sm mt-1">{filteredChats.length} conversations</p>
            </header>
            
            {/* Search */}
            <div className="px-4 py-4 bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search messages"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 rounded-2xl bg-gray-100 dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 text-base font-medium focus:outline-none"
                  data-testid="input-search"
                />
              </div>
            </div>
            
            {/* Chat List */}
            <ScrollArea className="flex-1 bg-white dark:bg-black">
              {filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-8">
                  <div className="w-24 h-24 rounded-full bg-black dark:bg-white flex items-center justify-center mb-6">
                    <MessageSquare className="h-12 w-12 text-white dark:text-black" />
                  </div>
                  <p className="text-black dark:text-white font-bold text-xl">No messages</p>
                  <p className="text-gray-500 text-center mt-2">Start a conversation with your team</p>
                </div>
              ) : (
                <div>
                  {filteredChats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => handleSelectChat(chat.id)}
                      className="w-full px-4 py-4 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 active:bg-gray-100 dark:active:bg-gray-900 transition-colors border-b border-gray-50 dark:border-gray-900"
                      data-testid={`chat-item-${chat.id}`}
                    >
                      <div className="relative">
                        <div className="w-14 h-14 rounded-full bg-black dark:bg-white flex items-center justify-center">
                          {chat.type === 'group' || chat.type === 'state-group' ? (
                            <Users className="h-6 w-6 text-white dark:text-black" />
                          ) : (
                            <span className="text-xl font-bold text-white dark:text-black">
                              {chat.name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        {chat.type === 'private' && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-[3px] border-white dark:border-black" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-black dark:text-white text-base truncate">{chat.name}</span>
                          <span className="text-sm text-gray-400 font-medium shrink-0">
                            {formatTime(chat.lastMessage?.timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-gray-500 truncate text-sm flex items-center gap-1.5">
                            {chat.lastMessage?.senderId === currentUser?.id && (
                              <CheckCheck className="h-4 w-4 text-black dark:text-white shrink-0" />
                            )}
                            {chat.lastMessage?.content || 'Start chatting'}
                          </p>
                          {chat.unreadCount > 0 && (
                            <span className="min-w-[24px] h-6 px-2 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center">
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
          <div className="flex flex-col h-full bg-white dark:bg-black">
            {/* Chat Header */}
            <header className="shrink-0 bg-black px-4 py-4 safe-area-top">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={handleBackToList} 
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="h-5 w-5 text-white" />
                  </button>
                  {activeChat && (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center">
                        {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                          <Users className="h-5 w-5 text-black" />
                        ) : (
                          <span className="text-base font-bold text-black">
                            {activeChat.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <h2 className="font-bold text-white">{activeChat.name}</h2>
                        <p className="text-xs text-green-400 font-medium">Active now</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleVoiceCall}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-voice-call"
                  >
                    <Phone className="h-5 w-5 text-white" />
                  </button>
                  <button 
                    onClick={handleVideoCall}
                    className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-video-call"
                  >
                    <Video className="h-5 w-5 text-white" />
                  </button>
                </div>
              </div>
            </header>
            <div className="flex-1 overflow-hidden">
              <ChatWindow />
            </div>
          </div>
        )}
      </div>
    );
  }

  // WEB VIEW - Uber Style Full Screen
  return (
    <div className="h-screen w-screen flex bg-white dark:bg-black" data-testid="chat-page">
      {/* Left Sidebar */}
      <div className="w-[400px] h-full flex flex-col shrink-0 border-r border-gray-100 dark:border-gray-900">
        {/* Header */}
        <div className="bg-black px-6 pt-6 pb-8">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" 
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-5 w-5 text-white" />
            </button>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => navigate('/notifications')}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <Bell className="h-5 w-5 text-white" />
              </button>
              <button className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-colors">
                <Plus className="h-5 w-5 text-black" />
              </button>
            </div>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight" data-testid="text-page-title">Messages</h1>
          <p className="text-white/50 mt-2">{filteredChats.length} active conversations</p>
        </div>

        {/* Search */}
        <div className="p-4 bg-white dark:bg-black">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-12 pl-12 pr-12 rounded-2xl bg-gray-100 dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 text-base font-medium focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
              data-testid="input-search"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                <X className="h-3 w-3 text-gray-600 dark:text-gray-300" />
              </button>
            )}
          </div>
        </div>

        {/* Chat List */}
        <ScrollArea className="flex-1 bg-white dark:bg-black">
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 px-8">
              <div className="w-28 h-28 rounded-full bg-black dark:bg-white flex items-center justify-center mb-6">
                <MessageSquare className="h-14 w-14 text-white dark:text-black" />
              </div>
              <p className="text-black dark:text-white font-bold text-xl">No messages yet</p>
              <p className="text-gray-500 text-center mt-2">Your conversations will appear here</p>
              <button className="mt-6 h-12 px-6 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold hover:opacity-90 transition-opacity flex items-center gap-2">
                <Plus className="h-5 w-5" />
                New Message
              </button>
            </div>
          ) : (
            <div className="py-2">
              {filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  className={`w-full px-4 py-4 flex items-center gap-4 transition-all ${
                    activeChat?.id === chat.id 
                      ? 'bg-black dark:bg-white' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                  }`}
                  data-testid={`chat-item-${chat.id}`}
                >
                  <div className="relative">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      activeChat?.id === chat.id 
                        ? 'bg-white dark:bg-black' 
                        : 'bg-black dark:bg-white'
                    }`}>
                      {chat.type === 'group' || chat.type === 'state-group' ? (
                        <Users className={`h-6 w-6 ${activeChat?.id === chat.id ? 'text-black dark:text-white' : 'text-white dark:text-black'}`} />
                      ) : (
                        <span className={`text-xl font-bold ${activeChat?.id === chat.id ? 'text-black dark:text-white' : 'text-white dark:text-black'}`}>
                          {chat.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    {chat.type === 'private' && (
                      <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-[3px] ${
                        activeChat?.id === chat.id ? 'border-black dark:border-white' : 'border-white dark:border-black'
                      }`} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold text-base truncate ${
                        activeChat?.id === chat.id ? 'text-white dark:text-black' : 'text-black dark:text-white'
                      }`}>{chat.name}</span>
                      <span className={`text-sm font-medium shrink-0 ${
                        activeChat?.id === chat.id ? 'text-white/60 dark:text-black/60' : 'text-gray-400'
                      }`}>
                        {formatTime(chat.lastMessage?.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className={`truncate text-sm flex items-center gap-1.5 ${
                        activeChat?.id === chat.id ? 'text-white/70 dark:text-black/70' : 'text-gray-500'
                      }`}>
                        {chat.lastMessage?.senderId === currentUser?.id && (
                          <CheckCheck className={`h-4 w-4 shrink-0 ${
                            activeChat?.id === chat.id ? 'text-white/70 dark:text-black/70' : 'text-black dark:text-white'
                          }`} />
                        )}
                        {chat.lastMessage?.content || 'Start a conversation'}
                      </p>
                      {chat.unreadCount > 0 && activeChat?.id !== chat.id && (
                        <span className="min-w-[24px] h-6 px-2 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center">
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
      <div className="flex-1 h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="h-20 px-8 flex items-center justify-between bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900 shrink-0">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-full bg-black dark:bg-white flex items-center justify-center">
                    {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                      <Users className="h-6 w-6 text-white dark:text-black" />
                    ) : (
                      <span className="text-lg font-bold text-white dark:text-black">
                        {activeChat.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {activeChat.type === 'private' && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-[3px] border-white dark:border-black" />
                  )}
                </div>
                <div>
                  <h2 className="font-bold text-lg text-black dark:text-white">{activeChat.name}</h2>
                  <p className="text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    {activeChat.type === 'private' ? 'Active now' : `${activeChat.participants.length} members`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleVoiceCall}
                  className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  data-testid="button-voice-call"
                >
                  <Phone className="h-5 w-5 text-black dark:text-white" />
                </button>
                <button 
                  onClick={handleVideoCall}
                  className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  data-testid="button-video-call"
                >
                  <Video className="h-5 w-5 text-black dark:text-white" />
                </button>
                <button 
                  className="w-11 h-11 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  data-testid="button-more-options"
                >
                  <MoreVertical className="h-5 w-5 text-black dark:text-white" />
                </button>
              </div>
            </div>
            
            {/* Messages Area */}
            <div className="flex-1 overflow-hidden">
              <ChatWindow />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="text-center max-w-lg px-8">
              <div className="w-32 h-32 rounded-full bg-black dark:bg-white flex items-center justify-center mx-auto mb-8">
                <Sparkles className="h-16 w-16 text-white dark:text-black" />
              </div>
              <h3 className="text-4xl font-black text-black dark:text-white tracking-tight">Start messaging</h3>
              <p className="text-gray-500 text-lg mt-4 leading-relaxed">
                Select a conversation from the sidebar to continue chatting with your team
              </p>
              <div className="flex items-center justify-center gap-4 mt-10">
                <button 
                  onClick={() => navigate('/calls')}
                  className="h-14 px-8 rounded-full border-2 border-black dark:border-white text-black dark:text-white font-bold hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors flex items-center gap-2"
                  data-testid="button-go-calls"
                >
                  <Phone className="h-5 w-5" />
                  View Calls
                </button>
                <button 
                  className="h-14 px-8 rounded-full bg-black dark:bg-white text-white dark:text-black font-bold hover:opacity-90 transition-opacity flex items-center gap-2"
                  data-testid="button-new-conversation"
                >
                  <Plus className="h-5 w-5" />
                  New Chat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
