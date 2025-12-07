import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
  ChevronRight
} from 'lucide-react';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const [searchParams] = useSearchParams();
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

  return (
    <div className="h-[100dvh] flex flex-col bg-white dark:bg-black" data-testid="chat-page">
      {/* Mobile List View */}
      {isMobile && activeView === 'list' && (
        <div className="flex flex-col h-full">
          {/* Header */}
          <header className="shrink-0 bg-black text-white px-4 py-4 safe-area-top">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => navigate('/dashboard')}
                  className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
                  data-testid="button-go-back"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h1 className="text-xl font-semibold" data-testid="text-page-title">
                  Messages
                </h1>
              </div>
              <button 
                className="p-2 rounded-full hover:bg-white/10 transition-colors"
                data-testid="button-new-message"
              >
                <Edit className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* Search */}
          <div className="px-4 py-3 bg-white dark:bg-black border-b border-gray-100 dark:border-gray-900">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-full bg-gray-100 dark:bg-gray-900 text-sm placeholder:text-gray-400 focus:outline-none"
                data-testid="input-search"
              />
            </div>
          </div>

          {/* Chat List */}
          <ScrollArea className="flex-1">
            <div className="divide-y divide-gray-100 dark:divide-gray-900">
              {filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-4">
                    <MessageSquare className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 text-center">No messages yet</p>
                  <p className="text-gray-400 text-sm text-center mt-1">Start a conversation with your team</p>
                </div>
              ) : (
                filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors text-left"
                    data-testid={`chat-item-${chat.id}`}
                  >
                    <Avatar className="h-12 w-12 shrink-0">
                      <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black font-semibold">
                        {chat.type === 'group' || chat.type === 'state-group' ? (
                          <Users className="h-5 w-5" />
                        ) : (
                          chat.name.charAt(0).toUpperCase()
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-black dark:text-white truncate">
                          {chat.name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0">
                          {chat.lastMessage?.timestamp 
                            ? new Date(chat.lastMessage.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                            : ''
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-sm text-gray-500 truncate">
                          {chat.lastMessage?.content || 'No messages yet'}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-medium flex items-center justify-center">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Mobile Chat View */}
      {isMobile && activeView === 'chat' && (
        <div className="flex flex-col h-full">
          {/* Chat Header */}
          <header className="shrink-0 bg-black text-white px-4 py-3 safe-area-top">
            <div className="flex items-center gap-3">
              <button 
                onClick={handleBackToList}
                className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
                data-testid="button-back-to-list"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {activeChat && (
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-white text-black font-semibold text-sm">
                      {activeChat.type === 'group' || activeChat.type === 'state-group' ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        activeChat.name.charAt(0).toUpperCase()
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <h2 className="font-semibold truncate">{activeChat.name}</h2>
                    <p className="text-xs text-gray-400">
                      {activeChat.type === 'private' ? 'Online' : `${activeChat.participants.length} members`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </header>
          
          {/* Chat Content */}
          <div className="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-950">
            <ChatWindow />
          </div>
        </div>
      )}

      {/* Desktop View */}
      {!isMobile && (
        <div className="flex h-full">
          {/* Sidebar */}
          <div className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col bg-white dark:bg-black shrink-0">
            {/* Header */}
            <header className="shrink-0 bg-black text-white px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => navigate('/dashboard')}
                    className="p-2 -ml-2 rounded-full hover:bg-white/10 transition-colors"
                    data-testid="button-go-back"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <h1 className="text-xl font-semibold" data-testid="text-page-title">
                    Messages
                  </h1>
                </div>
                <button 
                  className="p-2 rounded-full hover:bg-white/10 transition-colors"
                  data-testid="button-new-message"
                >
                  <Edit className="h-5 w-5" />
                </button>
              </div>
            </header>

            {/* Search */}
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-900">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-full bg-gray-100 dark:bg-gray-900 text-sm placeholder:text-gray-400 focus:outline-none"
                  data-testid="input-search-desktop"
                />
              </div>
            </div>

            {/* Chat List */}
            <ScrollArea className="flex-1">
              <div className="divide-y divide-gray-100 dark:divide-gray-900">
                {filteredChats.map((chat) => (
                  <button
                    key={chat.id}
                    onClick={() => handleSelectChat(chat.id)}
                    className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left ${
                      activeChat?.id === chat.id 
                        ? 'bg-gray-100 dark:bg-gray-900' 
                        : 'hover:bg-gray-50 dark:hover:bg-gray-900/50'
                    }`}
                    data-testid={`chat-item-${chat.id}`}
                  >
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black font-semibold">
                        {chat.type === 'group' || chat.type === 'state-group' ? (
                          <Users className="h-5 w-5" />
                        ) : (
                          chat.name.charAt(0).toUpperCase()
                        )}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-black dark:text-white truncate text-sm">
                          {chat.name}
                        </span>
                        <span className="text-[11px] text-gray-400 shrink-0">
                          {chat.lastMessage?.timestamp 
                            ? new Date(chat.lastMessage.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
                            : ''
                          }
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-gray-500 truncate">
                          {chat.lastMessage?.content || 'No messages yet'}
                        </p>
                        {chat.unreadCount > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-medium flex items-center justify-center">
                            {chat.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Chat Window */}
          <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-950">
            {activeChat ? (
              <>
                {/* Chat Header */}
                <header className="shrink-0 bg-white dark:bg-black border-b border-gray-200 dark:border-gray-800 px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-black dark:bg-white text-white dark:text-black font-semibold">
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
                </header>
                
                {/* Messages */}
                <div className="flex-1 overflow-hidden">
                  <ChatWindow />
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-900 flex items-center justify-center mb-4">
                  <MessageSquare className="h-10 w-10 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-black dark:text-white mb-1">Your messages</h3>
                <p className="text-gray-500 text-sm">Select a conversation to start messaging</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Chat;
