
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ChatSidebar from '@/components/chat/ChatSidebar';
import ChatWindow from '@/components/chat/ChatWindow';
//import ChatTestComponent from '@/components/chat/ChatTestComponent';
import { useAppContext } from '@/context/AppContext';
import { useViewMode } from '@/context/ViewModeContext';

const Chat: React.FC = () => {
  const { currentUser } = useAppContext();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const isMobile = viewMode === 'mobile';

  // Handle authentication
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  return (
    <div className="container mx-auto p-0 h-[calc(100vh-10rem)]">
      <div className="flex h-full overflow-hidden rounded-lg shadow-sm border bg-white">
        {/* Sidebar (hidden on mobile when a chat is active) */}
        <div className={`${isMobile ? 'w-full md:w-80' : 'w-80'} h-full border-r`}>
          <ChatSidebar />
        </div>

        {/* Chat Window (shown on all screens) */}
        <div className="flex-1 h-full overflow-hidden">
          <ChatWindow />
        </div>
      </div>
      
      {/* Test Component (for development only) */}
      {/* <div className="mt-4">
        <ChatTestComponent />
      </div> */}
    </div>
  );
};

export default Chat;
