import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useCommunication } from '@/context/communications/CommunicationContext';
import { useUser } from '@/context/user/UserContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Sparkles,
  Clock
} from 'lucide-react';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const { toast } = useToast();
  const isMobile = viewMode === 'mobile';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const [activeTab, setActiveTab] = useState<'contacts' | 'conversations'>('conversations');
  const { chats, activeChat, setActiveChat, createChat, isLoading } = useChat();
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

  const handleStartChatWithUser = async (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    const userName = user.fullName || user.name || user.username || user.email || 'Unknown User';
    
    const chat = await createChat([userId], userName, 'private');
    if (chat) {
      setActiveChat(chat);
      setActiveTab('conversations');
      if (isMobile) {
        setActiveView('chat');
      }
      toast({
        title: 'Chat started',
        description: `You can now message ${userName}`,
      });
    }
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

  const filteredUsers = users.filter(user => 
    user.id !== currentUser?.id &&
    (user.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
     user.fullName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     user.role?.toLowerCase().includes(searchQuery.toLowerCase()) ||
     user.email?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getInitials = (name: string) => 
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

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

  // MOBILE VIEW - Compact Uber Style
  if (isMobile) {
    return (
      <div className="h-full flex flex-col bg-white dark:bg-black" data-testid="chat-page">
        {activeView === 'list' ? (
          <div className="flex flex-col h-full">
            {/* Compact Header */}
            <header className="shrink-0 bg-black px-3 pt-6 pb-3">
              <div className="flex items-center justify-between mb-2">
                <button 
                  onClick={() => navigate('/dashboard')} 
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                  data-testid="button-go-back"
                >
                  <ArrowLeft className="h-4 w-4 text-white" />
                </button>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={() => navigate('/notifications')}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                  >
                    <Bell className="h-4 w-4 text-white" />
                  </button>
                  <button 
                    onClick={() => setActiveTab('contacts')}
                    className="w-8 h-8 rounded-full bg-white flex items-center justify-center"
                    data-testid="button-new-chat"
                  >
                    <Plus className="h-4 w-4 text-black" />
                  </button>
                </div>
              </div>
              <h1 className="text-xl font-bold text-white tracking-tight">Messages</h1>
              <p className="text-white/60 text-xs">
                {activeTab === 'conversations' ? `${filteredChats.length} conversations` : `${filteredUsers.length} contacts`}
              </p>
            </header>
            
            {/* Search */}
            <div className="px-3 py-2 bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={activeTab === 'conversations' ? "Search messages" : "Search contacts"}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-gray-100 dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 text-sm font-medium focus:outline-none"
                  data-testid="input-search"
                />
              </div>
            </div>

            {/* Tabs */}
            <div className="px-3 py-2 bg-white dark:bg-black">
              <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900 p-0.5">
                <button 
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'contacts' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveTab('contacts')}
                  data-testid="tab-contacts"
                >
                  <Users className="h-3.5 w-3.5" />
                  Contacts
                </button>
                <button 
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                    activeTab === 'conversations' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
                  }`}
                  onClick={() => setActiveTab('conversations')}
                  data-testid="tab-conversations"
                >
                  <Clock className="h-3.5 w-3.5" />
                  Chats
                </button>
              </div>
            </div>
            
            {/* Content based on active tab */}
            <ScrollArea className="flex-1 bg-white dark:bg-black">
              {activeTab === 'contacts' ? (
                /* Contact List */
                filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6">
                    <div className="w-16 h-16 rounded-full bg-black dark:bg-white flex items-center justify-center mb-4">
                      <Users className="h-8 w-8 text-white dark:text-black" />
                    </div>
                    <p className="text-black dark:text-white font-semibold text-base">No contacts found</p>
                    <p className="text-gray-500 text-center text-sm mt-1">Try a different search term</p>
                  </div>
                ) : (
                  <div className="space-y-0.5 p-2">
                    {filteredUsers.map((user) => {
                      const userName = user.fullName || user.name || user.username || user.email || 'Unknown';
                      return (
                        <button
                          key={user.id}
                          onClick={() => handleStartChatWithUser(user.id)}
                          disabled={isLoading}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors disabled:opacity-50"
                          data-testid={`contact-${user.id}`}
                        >
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={user.avatar} alt={userName} />
                            <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-sm font-bold">
                              {getInitials(userName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 text-left">
                            <span className="font-semibold text-sm text-black dark:text-white truncate block">{userName}</span>
                            <span className="text-xs text-gray-500 truncate block">{user.role || 'Team Member'}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center">
                              <MessageSquare className="h-4 w-4 text-white dark:text-black" />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Chat List */
                filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6">
                    <div className="w-16 h-16 rounded-full bg-black dark:bg-white flex items-center justify-center mb-4">
                      <MessageSquare className="h-8 w-8 text-white dark:text-black" />
                    </div>
                    <p className="text-black dark:text-white font-semibold text-base">No messages</p>
                    <p className="text-gray-500 text-center text-sm mt-1">Start a conversation with your team</p>
                    <button 
                      onClick={() => setActiveTab('contacts')}
                      className="mt-4 h-9 px-4 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-sm flex items-center gap-1.5"
                      data-testid="button-new-message"
                    >
                      <Plus className="h-4 w-4" />
                      New Message
                    </button>
                  </div>
                ) : (
                  <div>
                    {filteredChats.map((chat) => (
                      <button
                        key={chat.id}
                        onClick={() => handleSelectChat(chat.id)}
                        className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 active:bg-gray-100 dark:active:bg-gray-900 transition-colors border-b border-gray-50 dark:border-gray-900"
                        data-testid={`chat-item-${chat.id}`}
                      >
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-black dark:bg-white flex items-center justify-center">
                            {chat.type === 'group' || chat.type === 'state-group' ? (
                              <Users className="h-4 w-4 text-white dark:text-black" />
                            ) : (
                              <span className="text-base font-bold text-white dark:text-black">
                                {chat.name.charAt(0).toUpperCase()}
                              </span>
                            )}
                          </div>
                          {chat.type === 'private' && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-black" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-black dark:text-white text-sm truncate">{chat.name}</span>
                            <span className="text-xs text-gray-400 font-medium shrink-0">
                              {formatTime(chat.lastMessage?.timestamp)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <p className="text-gray-500 truncate text-xs flex items-center gap-1">
                              {chat.lastMessage?.senderId === currentUser?.id && (
                                <CheckCheck className="h-3 w-3 text-black dark:text-white shrink-0" />
                              )}
                              {chat.lastMessage?.content || 'Start chatting'}
                            </p>
                            {chat.unreadCount > 0 && (
                              <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center">
                                {chat.unreadCount}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              )}
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-col h-full bg-white dark:bg-black">
            {/* Chat Header */}
            <header className="shrink-0 bg-black px-3 py-2.5 safe-area-top">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleBackToList} 
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="h-4 w-4 text-white" />
                  </button>
                  {activeChat && (
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                        {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                          <Users className="h-4 w-4 text-black" />
                        ) : (
                          <span className="text-sm font-bold text-black">
                            {activeChat.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <h2 className="font-semibold text-white text-sm">{activeChat.name}</h2>
                        <p className="text-[10px] text-green-400 font-medium">Active now</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button 
                    onClick={handleVoiceCall}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-voice-call"
                  >
                    <Phone className="h-4 w-4 text-white" />
                  </button>
                  <button 
                    onClick={handleVideoCall}
                    className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
                    data-testid="button-video-call"
                  >
                    <Video className="h-4 w-4 text-white" />
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

  // WEB VIEW - Compact Uber Style
  return (
    <div className="h-full w-full flex bg-white dark:bg-black rounded-lg overflow-hidden" data-testid="chat-page">
      {/* Left Sidebar - Narrower */}
      <div className="w-[320px] h-full flex flex-col shrink-0 border-r border-gray-100 dark:border-gray-900">
        {/* Header */}
        <div className="bg-black px-4 pt-4 pb-3">
          <div className="flex items-center justify-between mb-2">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors" 
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-4 w-4 text-white" />
            </button>
            <div className="flex items-center gap-1.5">
              <button 
                onClick={() => navigate('/notifications')}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <Bell className="h-4 w-4 text-white" />
              </button>
              <button 
                onClick={() => setActiveTab('contacts')}
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:bg-gray-100 transition-colors"
                data-testid="button-new-chat"
              >
                <Plus className="h-4 w-4 text-black" />
              </button>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight" data-testid="text-page-title">Messages</h1>
          <p className="text-white/50 text-sm">
            {activeTab === 'conversations' ? `${filteredChats.length} conversations` : `${filteredUsers.length} contacts`}
          </p>
        </div>

        {/* Search */}
        <div className="p-3 bg-white dark:bg-black">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'conversations' ? "Search messages" : "Search contacts"}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-9 rounded-xl bg-gray-100 dark:bg-gray-900 text-black dark:text-white placeholder:text-gray-500 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white transition-all"
              data-testid="input-search"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
              >
                <X className="h-3 w-3 text-gray-600 dark:text-gray-300" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-3 pb-3 bg-white dark:bg-black">
          <div className="flex rounded-xl bg-gray-100 dark:bg-gray-900 p-0.5">
            <button 
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'contacts' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
              }`}
              onClick={() => setActiveTab('contacts')}
              data-testid="tab-contacts"
            >
              <Users className="h-3.5 w-3.5" />
              Contacts
            </button>
            <button 
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                activeTab === 'conversations' ? 'bg-black dark:bg-white text-white dark:text-black' : 'text-gray-600 dark:text-gray-400'
              }`}
              onClick={() => setActiveTab('conversations')}
              data-testid="tab-conversations"
            >
              <Clock className="h-3.5 w-3.5" />
              Chats
            </button>
          </div>
        </div>

        {/* Content based on active tab */}
        <ScrollArea className="flex-1 bg-white dark:bg-black">
          {activeTab === 'contacts' ? (
            /* Contact List */
            filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <div className="w-16 h-16 rounded-full bg-black dark:bg-white flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-white dark:text-black" />
                </div>
                <p className="text-black dark:text-white font-semibold text-base">No contacts found</p>
                <p className="text-gray-500 text-center text-sm mt-1">Try a different search term</p>
              </div>
            ) : (
              <div className="space-y-0.5 py-1">
                {filteredUsers.map((user) => {
                  const userName = user.fullName || user.name || user.username || user.email || 'Unknown';
                  return (
                    <button
                      key={user.id}
                      onClick={() => handleStartChatWithUser(user.id)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors disabled:opacity-50"
                      data-testid={`contact-${user.id}`}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={user.avatar} alt={userName} />
                        <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black text-sm font-bold">
                          {getInitials(userName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 text-left">
                        <span className="font-semibold text-sm text-black dark:text-white truncate block">{userName}</span>
                        <span className="text-xs text-gray-500 truncate block">{user.role || 'Team Member'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center">
                          <MessageSquare className="h-4 w-4 text-white dark:text-black" />
                        </div>
                        <div 
                          className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetUser = users.find(u => u.id === user.id);
                            if (targetUser) {
                              initiateCall(targetUser);
                              navigate('/calls');
                            }
                          }}
                        >
                          <Phone className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : (
            /* Chat List */
            filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6">
                <div className="w-16 h-16 rounded-full bg-black dark:bg-white flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-white dark:text-black" />
                </div>
                <p className="text-black dark:text-white font-semibold text-base">No messages yet</p>
                <p className="text-gray-500 text-center text-sm mt-1">Your conversations will appear here</p>
                <button 
                  onClick={() => setActiveTab('contacts')}
                  className="mt-4 h-9 px-4 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-sm hover:opacity-90 transition-opacity flex items-center gap-1.5"
                  data-testid="button-new-message"
                >
                  <Plus className="h-4 w-4" />
                  New Message
                </button>
              </div>
            ) : (
              <div className="py-1">
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    className={`w-full px-3 py-2.5 flex items-center gap-3 transition-all ${
                      activeChat?.id === chat.id 
                        ? 'bg-black dark:bg-white' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                    }`}
                    data-testid={`chat-item-${chat.id}`}
                  >
                    <div className="relative">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                        activeChat?.id === chat.id 
                          ? 'bg-white dark:bg-black' 
                          : 'bg-black dark:bg-white'
                      }`}>
                        {chat.type === 'group' || chat.type === 'state-group' ? (
                          <Users className={`h-4 w-4 ${activeChat?.id === chat.id ? 'text-black dark:text-white' : 'text-white dark:text-black'}`} />
                        ) : (
                          <span className={`text-base font-bold ${activeChat?.id === chat.id ? 'text-black dark:text-white' : 'text-white dark:text-black'}`}>
                            {chat.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {chat.type === 'private' && (
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 ${
                          activeChat?.id === chat.id ? 'border-black dark:border-white' : 'border-white dark:border-black'
                        }`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold text-sm truncate ${
                          activeChat?.id === chat.id ? 'text-white dark:text-black' : 'text-black dark:text-white'
                        }`}>{chat.name}</span>
                        <span className={`text-xs font-medium shrink-0 ${
                          activeChat?.id === chat.id ? 'text-white/60 dark:text-black/60' : 'text-gray-400'
                        }`}>
                          {formatTime(chat.lastMessage?.timestamp)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className={`truncate text-xs flex items-center gap-1 ${
                          activeChat?.id === chat.id ? 'text-white/70 dark:text-black/70' : 'text-gray-500'
                        }`}>
                          {chat.lastMessage?.senderId === currentUser?.id && (
                            <CheckCheck className={`h-3 w-3 shrink-0 ${
                              activeChat?.id === chat.id ? 'text-white/70 dark:text-black/70' : 'text-black dark:text-white'
                            }`} />
                          )}
                          {chat.lastMessage?.content || 'Start a conversation'}
                        </p>
                        {chat.unreadCount > 0 && activeChat?.id !== chat.id && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold flex items-center justify-center">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )
          )}
        </ScrollArea>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="flex-1 h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        {activeChat ? (
          <>
            {/* Chat Header - Compact */}
            <div className="h-14 px-4 flex items-center justify-between bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900 shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-9 h-9 rounded-full bg-black dark:bg-white flex items-center justify-center">
                    {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                      <Users className="h-4 w-4 text-white dark:text-black" />
                    ) : (
                      <span className="text-sm font-bold text-white dark:text-black">
                        {activeChat.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  {activeChat.type === 'private' && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white dark:border-black" />
                  )}
                </div>
                <div>
                  <h2 className="font-semibold text-sm text-black dark:text-white">{activeChat.name}</h2>
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    {activeChat.type === 'private' ? 'Active now' : `${activeChat.participants.length} members`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button 
                  onClick={handleVoiceCall}
                  className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  data-testid="button-voice-call"
                >
                  <Phone className="h-4 w-4 text-black dark:text-white" />
                </button>
                <button 
                  onClick={handleVideoCall}
                  className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  data-testid="button-video-call"
                >
                  <Video className="h-4 w-4 text-black dark:text-white" />
                </button>
                <button 
                  className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                  data-testid="button-more-options"
                >
                  <MoreVertical className="h-4 w-4 text-black dark:text-white" />
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
            <div className="text-center max-w-md px-6">
              <div className="w-20 h-20 rounded-full bg-black dark:bg-white flex items-center justify-center mx-auto mb-6">
                <Sparkles className="h-10 w-10 text-white dark:text-black" />
              </div>
              <h3 className="text-2xl font-bold text-black dark:text-white tracking-tight">Start messaging</h3>
              <p className="text-gray-500 text-sm mt-2 leading-relaxed">
                Select a conversation from the sidebar or choose a contact to start chatting
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <button 
                  onClick={() => setActiveTab('contacts')}
                  className="h-10 px-5 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-sm flex items-center gap-1.5"
                  data-testid="button-browse-contacts"
                >
                  <Users className="h-4 w-4" />
                  Browse Contacts
                </button>
                <button 
                  onClick={() => navigate('/calls')}
                  className="h-10 px-5 rounded-full border-2 border-black dark:border-white text-black dark:text-white font-semibold text-sm hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors flex items-center gap-1.5"
                  data-testid="button-go-calls"
                >
                  <Phone className="h-4 w-4" />
                  View Calls
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
