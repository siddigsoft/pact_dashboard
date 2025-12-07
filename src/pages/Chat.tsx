
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MessageSquare } from 'lucide-react';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  return (
    <div className="container mx-auto p-4 max-w-6xl" data-testid="chat-page">
      <div className="flex items-center gap-3 mb-4">
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => navigate(-1)}
          data-testid="button-go-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <MessageSquare className="h-5 w-5 text-primary" />
            Messages
          </h1>
          <p className="text-xs text-muted-foreground">Chat with your team</p>
        </div>
      </div>
      
      <div className="flex h-[calc(100vh-12rem)] overflow-hidden rounded-lg border bg-card dark:bg-gray-900">
        <div className={`${isMobile ? 'w-full md:w-80' : 'w-80'} h-full border-r bg-card dark:bg-gray-900`}>
          <ChatSidebar />
        </div>
        <div className="flex-1 h-full overflow-hidden bg-muted/30 dark:bg-gray-950">
          <ChatWindow />
        </div>
      </div>
    </div>
  );
};

export default Chat;
