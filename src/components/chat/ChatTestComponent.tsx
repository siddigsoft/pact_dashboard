import React, { useState, useEffect } from 'react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useUser } from '@/context/user/UserContext';

const ChatTestComponent: React.FC = () => {
  const { 
    chats, 
    messages, 
    isLoading, 
    error, 
    createChat, 
    sendMessage, 
    getChatMessages,
    clearError
  } = useChat();
  const { currentUser } = useUser();
  const [testChatId, setTestChatId] = useState<string | null>(null);
  const [messageContent, setMessageContent] = useState('');

  // Create a test chat when component mounts
  useEffect(() => {
    const createTestChat = async () => {
      if (currentUser && chats.length === 0) {
        // Create a test chat with the current user
        const chat = await createChat([currentUser.id], 'Test Chat');
        if (chat) {
          setTestChatId(chat.id);
        }
      }
    };

    createTestChat();
  }, [currentUser, chats.length, createChat]);

  const handleSendMessage = async () => {
    if (testChatId && messageContent.trim()) {
      await sendMessage(testChatId, messageContent);
      setMessageContent('');
    }
  };

  const handleGetMessages = async () => {
    if (testChatId) {
      await getChatMessages(testChatId);
    }
  };

  return (
    <div className="p-4 border rounded-lg">
      <h2 className="text-xl font-bold mb-4">Chat Test Component</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p>{error}</p>
          <button 
            onClick={clearError}
            className="mt-2 bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-2 rounded"
          >
            Clear Error
          </button>
        </div>
      )}
      
      {isLoading && (
        <div className="bg-blue-100 border border-blue-400 text-blue-700 px-4 py-3 rounded mb-4">
          Loading...
        </div>
      )}
      
      <div className="mb-4">
        <h3 className="font-semibold">Chats:</h3>
        {chats.length > 0 ? (
          <ul>
            {chats.map(chat => (
              <li key={chat.id} className="border-b py-2">
                {chat.name} ({chat.id})
              </li>
            ))}
          </ul>
        ) : (
          <p>No chats yet</p>
        )}
      </div>
      
      <div className="mb-4">
        <h3 className="font-semibold">Messages:</h3>
        {testChatId && messages[testChatId] ? (
          <ul>
            {messages[testChatId].map(msg => (
              <li key={msg.id} className="border-b py-2">
                <strong>{msg.senderId}:</strong> {msg.content}
              </li>
            ))}
          </ul>
        ) : (
          <p>No messages yet</p>
        )}
      </div>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={messageContent}
          onChange={(e) => setMessageContent(e.target.value)}
          placeholder="Type a message"
          className="border rounded px-2 py-1 flex-1"
        />
        <button
          onClick={handleSendMessage}
          disabled={!testChatId || !messageContent.trim()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-4 rounded disabled:opacity-50"
        >
          Send
        </button>
        <button
          onClick={handleGetMessages}
          disabled={!testChatId}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-1 px-4 rounded disabled:opacity-50"
        >
          Load Messages
        </button>
      </div>
    </div>
  );
};

export default ChatTestComponent;