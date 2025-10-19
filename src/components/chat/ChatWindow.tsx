
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { useUser } from '@/context/user/UserContext';
import { Send, Info, ArrowLeft, MoreVertical, Paperclip, Users } from 'lucide-react';
import { ChatMessage } from '@/types';

const ChatWindow: React.FC = () => {
  const { activeChat, getChatMessages, sendMessage, setActiveChat } = useChat();
  const [messageText, setMessageText] = useState('');
  const { currentUser } = useUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Get messages for the active chat
  const chatMessages = activeChat ? getChatMessages(activeChat.id) || [] : [];
  
  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSendMessage = () => {
    if (messageText.trim() && activeChat) {
      sendMessage(activeChat.id, messageText, 'text');
      setMessageText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  // Auto-resize textarea
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  // If no chat is selected
  if (!activeChat) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6 text-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-sm max-w-md">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-primary" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Select a conversation</h2>
          <p className="text-muted-foreground mb-4">
            Choose a chat from the sidebar or start a new conversation to begin messaging
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="py-3 px-4 flex items-center justify-between border-b bg-white">
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden mr-2"
            onClick={() => setActiveChat(null)}
          >
            <ArrowLeft size={18} />
          </Button>
          
          <div className="flex items-center gap-3">
            {activeChat.type === 'private' ? (
              <Avatar className="h-9 w-9">
                <div className="bg-primary/20 w-full h-full rounded-full flex items-center justify-center text-primary font-medium">
                  {activeChat.name.charAt(0).toUpperCase()}
                </div>
              </Avatar>
            ) : (
              <Avatar className="h-9 w-9">
                <div className="bg-secondary/20 w-full h-full rounded-full flex items-center justify-center">
                  <Users size={16} className="text-secondary" />
                </div>
              </Avatar>
            )}
            
            <div>
              <h3 className="font-medium leading-tight">{activeChat.name}</h3>
              <p className="text-xs text-muted-foreground">
                {activeChat.type === 'group' 
                  ? `${activeChat.participants.length} participants` 
                  : 'Online'}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon">
            <Info size={18} />
          </Button>
          <Button variant="ghost" size="icon">
            <MoreVertical size={18} />
          </Button>
        </div>
      </div>
      
      {/* Messages area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4 pb-4">
          {chatMessages.length > 0 ? (
            chatMessages.map((message) => {
              const isOwnMessage = message.senderId === currentUser?.id;
              
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg p-3 ${
                      isOwnMessage
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-gray-100 text-foreground'
                    }`}
                  >
                    {!isOwnMessage && (
                      <p className="text-xs font-medium mb-1">
                        {message.senderId === 'usr1' ? 'You' : activeChat.name}
                      </p>
                    )}
                    <p className="text-sm break-words">{message.content}</p>
                    <p className="text-xs mt-1 opacity-70 text-right">
                      {formatDistanceToNow(new Date(message.timestamp), {
                        addSuffix: true,
                        includeSeconds: true,
                      })}
                    </p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Users size={24} className="text-primary" />
              </div>
              <p className="font-medium">Start your conversation</p>
              <p className="text-sm text-muted-foreground mt-1">
                {activeChat.type === 'private'
                  ? `Send your first message to ${activeChat.name}`
                  : `Send your first message to the ${activeChat.name} group`}
              </p>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {/* Message input */}
      <div className="p-3 bg-white border-t">
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-10 w-10">
            <Paperclip size={18} />
          </Button>
          
          <div className="flex-1 flex items-end">
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              className="resize-none min-h-[40px] max-h-[120px] py-2"
              value={messageText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
            />
          </div>
          
          <Button 
            size="icon" 
            className="h-10 w-10"
            onClick={handleSendMessage}
            disabled={!messageText.trim()}
          >
            <Send size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
