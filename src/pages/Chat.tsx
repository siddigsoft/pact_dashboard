import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  Search,
  MoreVertical,
  Edit,
  Users
} from 'lucide-react';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'chat'>('list');

  const prefilledMessage = searchParams.get('message');
  const targetUserId = searchParams.get('userId');

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (prefilledMessage && targetUserId) {
      console.log('Pre-filled message for user:', targetUserId, prefilledMessage);
    }
  }, [prefilledMessage, targetUserId]);

  return (
    <div className="h-screen flex flex-col bg-background" data-testid="chat-page">
      <header className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-full hover:bg-muted transition-colors"
              data-testid="button-go-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-semibold" data-testid="text-page-title">
                Messages
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              size="icon" 
              variant="ghost"
              data-testid="button-new-message"
            >
              <Edit className="h-5 w-5" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost"
              data-testid="button-more-options"
            >
              <MoreVertical className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-10 pr-4 rounded-full bg-muted/50 border-0 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              data-testid="input-search"
            />
          </div>
        </div>

        {isMobile && (
          <div className="flex border-t border-border/30">
            <button
              onClick={() => setActiveView('list')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeView === 'list' 
                  ? 'text-foreground border-b-2 border-foreground' 
                  : 'text-muted-foreground'
              }`}
              data-testid="tab-conversations"
            >
              Conversations
            </button>
            <button
              onClick={() => setActiveView('chat')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                activeView === 'chat' 
                  ? 'text-foreground border-b-2 border-foreground' 
                  : 'text-muted-foreground'
              }`}
              data-testid="tab-active-chat"
            >
              Active Chat
            </button>
          </div>
        )}
      </header>

      <div className="flex-1 flex overflow-hidden">
        {isMobile ? (
          activeView === 'list' ? (
            <div className="w-full h-full">
              <ChatSidebar />
            </div>
          ) : (
            <div className="w-full h-full">
              <ChatWindow />
            </div>
          )
        ) : (
          <>
            <div className="w-80 h-full border-r border-border/30 shrink-0">
              <ChatSidebar />
            </div>
            <div className="flex-1 h-full">
              <ChatWindow />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Chat;
