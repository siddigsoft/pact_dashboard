import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Search,
  Edit,
  MessageSquare,
  Users,
  ChevronRight,
  MoreVertical,
  Phone,
  Video
} from 'lucide-react';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');
  const { chats, activeChat, setActiveChat } = useChat();

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

  const filteredChats = chats.filter(chat => 
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // MOBILE VIEW
  if (isMobile) {
    return (
      <div className="h-[100dvh] flex flex-col bg-white dark:bg-black" data-testid="chat-page">
        {activeView === 'list' ? (
          <div className="flex flex-col h-full">
            <header className="shrink-0 bg-black text-white px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => navigate('/dashboard')} className="p-2 -ml-2 rounded-full hover:bg-white/10">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h1 className="text-xl font-semibold">Messages</h1>
                </div>
                <button className="p-2 rounded-full hover:bg-white/10">
                  <Edit className="h-5 w-5" />
                </button>
              </div>
            </header>
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-900">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-full bg-gray-100 dark:bg-gray-900 text-sm focus:outline-none"
                />
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="divide-y divide-gray-100 dark:divide-gray-900">
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900 text-left"
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black font-semibold">
                        {chat.type === 'group' ? <Users className="h-5 w-5" /> : chat.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium truncate">{chat.name}</span>
                        <span className="text-xs text-gray-400">{chat.lastMessage?.timestamp ? new Date(chat.lastMessage.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}</span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">{chat.lastMessage?.content || 'No messages'}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <header className="shrink-0 bg-black text-white px-4 py-3">
              <div className="flex items-center gap-3">
                <button onClick={handleBackToList} className="p-2 -ml-2 rounded-full hover:bg-white/10">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {activeChat && (
                  <div className="flex items-center gap-3 flex-1">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="bg-white text-black font-semibold text-sm">
                        {activeChat.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h2 className="font-semibold">{activeChat.name}</h2>
                      <p className="text-xs text-gray-400">Online</p>
                    </div>
                  </div>
                )}
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

  // WEB VIEW - Full Screen Layout
  return (
    <div className="h-screen w-screen flex bg-white dark:bg-black" data-testid="chat-page">
      {/* Left Sidebar - Conversation List */}
      <div className="w-[360px] h-full border-r border-gray-200 dark:border-gray-800 flex flex-col shrink-0">
        {/* Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-black text-white">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')} className="p-2 -ml-2 rounded-full hover:bg-white/10" data-testid="button-go-back">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold" data-testid="text-page-title">Messages</h1>
          </div>
          <button className="p-2 rounded-full hover:bg-white/10" data-testid="button-new-message">
            <Edit className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-900">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search messages"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-11 pr-4 rounded-full bg-gray-100 dark:bg-gray-900 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-black/10"
              data-testid="input-search"
            />
          </div>
        </div>

        {/* Conversations */}
        <ScrollArea className="flex-1">
          <div className="py-2">
            {filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-4">
                  <MessageSquare className="h-8 w-8 text-gray-400" />
                </div>
                <p className="text-gray-500 font-medium">No messages yet</p>
                <p className="text-gray-400 text-sm mt-1">Start a conversation</p>
              </div>
            ) : (
              filteredChats.map((chat) => (
                <button
                  key={chat.id}
                  onClick={() => handleSelectChat(chat.id)}
                  className={`w-full px-4 py-3 flex items-center gap-4 transition-colors ${
                    activeChat?.id === chat.id 
                      ? 'bg-gray-100 dark:bg-gray-900' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                  }`}
                  data-testid={`chat-item-${chat.id}`}
                >
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black font-bold text-lg">
                      {chat.type === 'group' || chat.type === 'state-group' ? (
                        <Users className="h-5 w-5" />
                      ) : (
                        chat.name.charAt(0).toUpperCase()
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-black dark:text-white truncate">{chat.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">
                        {chat.lastMessage?.timestamp ? new Date(chat.lastMessage.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-sm text-gray-500 truncate">{chat.lastMessage?.content || 'No messages yet'}</p>
                      {chat.unreadCount > 0 && (
                        <span className="min-w-[22px] h-[22px] px-2 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center">
                          {chat.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right Panel - Chat Window */}
      <div className="flex-1 h-full flex flex-col bg-gray-50 dark:bg-gray-950">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="h-16 px-6 flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black shrink-0">
              <div className="flex items-center gap-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black font-bold">
                    {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                      <Users className="h-5 w-5" />
                    ) : (
                      activeChat.name.charAt(0).toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold text-black dark:text-white">{activeChat.name}</h2>
                  <p className="text-xs text-gray-500">
                    {activeChat.type === 'private' ? 'Online' : `${activeChat.participants.length} members`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <Phone className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <Video className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </button>
                <button className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <MoreVertical className="h-5 w-5 text-gray-600 dark:text-gray-400" />
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
            <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-6">
              <MessageSquare className="h-12 w-12 text-gray-400" />
            </div>
            <h3 className="text-2xl font-bold text-black dark:text-white mb-2">Your Messages</h3>
            <p className="text-gray-500">Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
