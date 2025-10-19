import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { useUser } from '@/context/user/UserContext';
import { Chat, ChatMessage } from '@/types/chat';
import { ChatService } from '@/services/ChatService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface ChatContextType {
  chats: Chat[];
  messages: Record<string, ChatMessage[]>;
  activeChatId: string | null;
  activeChat: Chat | null;
  isLoading: boolean;
  isSendingMessage: boolean;
  error: string | null;
  setActiveChat: (chat: Chat | null) => void;
  setActiveChatId: (chatId: string | null) => void;
  sendMessage: (chatId: string, content: string, contentType?: "text" | "image" | "file" | "location" | "audio", attachments?: any, metadata?: any) => Promise<void>;
  markAsRead: (chatId: string, messageId: string) => Promise<void>;
  getChatById: (chatId: string) => Chat | undefined;
  createChat: (participants: string[], name?: string, type?: 'private' | 'group' | 'state-group') => Promise<Chat | undefined>;
  startGroupChat: (participants: string[], name: string) => Promise<Chat | undefined>;
  getChatMessages: (chatId: string) => ChatMessage[] | undefined;
  getUnreadMessagesCount: () => number;
  clearError: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSendingMessage, setIsSendingMessage] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [channels, setChannels] = useState<RealtimeChannel[]>([]);
  const { currentUser } = useUser();

  // Cleanup realtime channels on unmount
  useEffect(() => {
    return () => {
      channels.forEach(channel => {
        supabase.removeChannel(channel);
      });
    };
  }, [channels]);

  // Load chats when user is available
  useEffect(() => {
    if (currentUser?.id) {
      loadChats(currentUser.id);
    }
  }, [currentUser]);

  const loadChats = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const dbChats = await ChatService.getUserChats(userId);
      if (dbChats) {
        // Convert database chats to our Chat type
        const convertedChats: Chat[] = dbChats.map(dbChat => ({
          id: dbChat.id,
          name: dbChat.name,
          type: dbChat.type,
          isGroup: dbChat.is_group,
          createdBy: dbChat.created_by,
          stateId: dbChat.state_id,
          relatedEntityId: dbChat.related_entity_id,
          relatedEntityType: dbChat.related_entity_type,
          createdAt: dbChat.created_at,
          updatedAt: dbChat.updated_at,
          participants: [], // Will be populated separately
          status: 'active',
        }));
        
        setChats(convertedChats);
        
        // Load participants for each chat
        for (const chat of convertedChats) {
          await loadChatParticipants(chat.id);
        }
      }
    } catch (err: any) {
      console.error('Error loading chats:', err);
      setError(err.message || 'Failed to load chats');
    } finally {
      setIsLoading(false);
    }
  };

  const loadChatParticipants = async (chatId: string) => {
    try {
      const participants = await ChatService.getChatParticipants(chatId);
      if (participants) {
        setChats(prevChats => 
          prevChats.map(chat => 
            chat.id === chatId 
              ? { ...chat, participants: participants.map(p => p.user_id) }
              : chat
          )
        );
      }
    } catch (err: any) {
      console.error('Error loading chat participants:', err);
      setError(err.message || 'Failed to load chat participants');
    }
  };

  const loadChatMessages = async (chatId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const dbMessages = await ChatService.getChatMessages(chatId);
      if (dbMessages) {
        // Convert database messages to our ChatMessage type
        const convertedMessages: ChatMessage[] = dbMessages.map(dbMessage => ({
          id: dbMessage.id,
          chatId: dbMessage.chat_id,
          senderId: dbMessage.sender_id,
          content: dbMessage.content,
          contentType: dbMessage.content_type,
          timestamp: dbMessage.created_at,
          status: dbMessage.status,
          attachments: dbMessage.attachments,
          metadata: dbMessage.metadata,
          readBy: [], // Will be populated separately
          read: false,
        }));
        
        setMessages(prevMessages => ({
          ...prevMessages,
          [chatId]: convertedMessages,
        }));
      }
    } catch (err: any) {
      console.error('Error loading chat messages:', err);
      setError(err.message || 'Failed to load chat messages');
    } finally {
      setIsLoading(false);
    }
  };

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) || null : null;

  const setActiveChat = (chat: Chat | null) => {
    setActiveChatId(chat?.id || null);
    if (chat?.id) {
      // Load messages when chat is activated
      loadChatMessages(chat.id);
      // Subscribe to realtime updates for this chat
      subscribeToChat(chat.id);
    }
  };

  const subscribeToChat = (chatId: string) => {
    // Check if already subscribed
    const isSubscribed = channels.some(channel => channel.topic === `realtime:chat_messages:chat_id=eq.${chatId}`);
    if (isSubscribed) return;

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          // Handle new message
          const newMessage = payload.new;
          setMessages(prevMessages => ({
            ...prevMessages,
            [chatId]: [...(prevMessages[chatId] || []), {
              id: newMessage.id,
              chatId: newMessage.chat_id,
              senderId: newMessage.sender_id,
              content: newMessage.content,
              contentType: newMessage.content_type,
              timestamp: newMessage.created_at,
              status: newMessage.status,
              attachments: newMessage.attachments,
              metadata: newMessage.metadata,
              readBy: [],
              read: false,
            }]
          }));
        }
      )
      .subscribe();

    setChannels(prevChannels => [...prevChannels, channel]);
  };

  const getChatById = useCallback((chatId: string) => {
    return chats.find(chat => chat.id === chatId);
  }, [chats]);

  const getChatMessages = useCallback((chatId: string) => {
    return messages[chatId];
  }, [messages]);

  const getUnreadMessagesCount = useCallback(() => {
    return chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
  }, [chats]);

  const sendMessage = async (
    chatId: string, 
    content: string, 
    contentType: "text" | "image" | "file" | "location" | "audio" = "text",
    attachments: any = null,
    metadata: any = null
  ): Promise<void> => {
    if (!currentUser?.id) {
      setError("No current user");
      return;
    }

    setIsSendingMessage(true);
    setError(null);

    try {
      const dbMessage = await ChatService.sendMessage({
        chat_id: chatId,
        sender_id: currentUser.id,
        content,
        content_type: contentType,
        attachments,
        metadata,
      });

      if (dbMessage) {
        // Update local state with the new message
        const newMessage: ChatMessage = {
          id: dbMessage.id,
          chatId: dbMessage.chat_id,
          senderId: dbMessage.sender_id,
          content: dbMessage.content,
          contentType: dbMessage.content_type,
          timestamp: dbMessage.created_at,
          status: dbMessage.status,
          attachments: dbMessage.attachments,
          metadata: dbMessage.metadata,
          readBy: [],
          read: false,
        };

        setMessages(prevMessages => ({
          ...prevMessages,
          [chatId]: [...(prevMessages[chatId] || []), newMessage],
        }));

        // Update chat's last message
        setChats(prevChats => 
          prevChats.map(chat => 
            chat.id === chatId 
              ? { ...chat, lastMessage: newMessage }
              : chat
          )
        );
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const markAsRead = async (chatId: string, messageId: string): Promise<void> => {
    if (!currentUser?.id) {
      setError("No current user");
      return;
    }

    try {
      const success = await ChatService.markMessageAsRead(messageId, currentUser.id);
      if (success) {
        // Update local state
        setMessages(prevMessages => {
          const updatedMessages = { ...prevMessages };
          if (updatedMessages[chatId]) {
            const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === messageId);
            if (messageIndex !== -1) {
              updatedMessages[chatId][messageIndex] = {
                ...updatedMessages[chatId][messageIndex],
                read: true,
                readBy: [...(updatedMessages[chatId][messageIndex].readBy || []), currentUser.id],
              };
            }
          }
          return updatedMessages;
        });
      }
    } catch (err: any) {
      console.error('Error marking message as read:', err);
      setError(err.message || 'Failed to mark message as read');
    }
  };

  const createChat = async (
    participants: string[], 
    name?: string, 
    type: 'private' | 'group' | 'state-group' = 'private'
  ): Promise<Chat | undefined> => {

    if (!currentUser?.id) {
      setError("No current user");
      return undefined;
    }

    setIsLoading(true);
    setError(null);

    try {
      const chatName = name || (participants.length === 1 ? 'Private Chat' : 'Group Chat');
      const isGroup = type !== 'private';

      // Compute deterministic pair key for private chats to enforce uniqueness
      let pairKey: string | undefined;
      if (type === 'private') {
        const otherId = participants.find(p => p !== currentUser.id) || participants[0];
        const ids = [currentUser.id, otherId].sort();
        pairKey = `${ids[0]}:${ids[1]}`;

        // Check if a chat already exists for this pair
        const existingDb = await ChatService.getPrivateChatByPairKey(pairKey);
        if (existingDb) {
          const existingChat: Chat = {
            id: existingDb.id,
            name: existingDb.name,
            type: existingDb.type,
            isGroup: existingDb.is_group,
            createdBy: existingDb.created_by,
            stateId: existingDb.state_id,
            relatedEntityId: existingDb.related_entity_id,
            relatedEntityType: existingDb.related_entity_type,
            createdAt: existingDb.created_at,
            updatedAt: existingDb.updated_at,
            participants: [],
            status: 'active',
          };

          // Add to state if not present and load participants
          setChats(prev => prev.some(c => c.id === existingChat.id) ? prev : [...prev, existingChat]);
          await loadChatParticipants(existingChat.id);
          return existingChat;
        }
      }

      const dbChat = await ChatService.createChat({
        name: chatName,
        type,
        is_group: isGroup,
        created_by: currentUser.id,
        ...(pairKey ? { pair_key: pairKey } : {}),
      });

      if (dbChat) {
        // Add participants to the chat
        const allParticipants = [...participants, currentUser.id];
        for (const participantId of allParticipants) {
          await ChatService.addParticipant(dbChat.id, participantId);
        }

        // Convert to our Chat type
        const newChat: Chat = {
          id: dbChat.id,
          name: dbChat.name,
          type: dbChat.type,
          isGroup: dbChat.is_group,
          createdBy: dbChat.created_by,
          stateId: dbChat.state_id,
          relatedEntityId: dbChat.related_entity_id,
          relatedEntityType: dbChat.related_entity_type,
          createdAt: dbChat.created_at,
          updatedAt: dbChat.updated_at,
          participants: allParticipants,
          status: 'active',
        };

        setChats(prevChats => [...prevChats, newChat]);
        return newChat;
      }
    } catch (err: any) {
      console.error('Error creating chat:', err);
      setError(err.message || 'Failed to create chat');
    } finally {
      setIsLoading(false);
    }
    
    return undefined;
  };

  const startGroupChat = async (participants: string[], name: string): Promise<Chat | undefined> => {
    return createChat(participants, name, 'group');
  };

  const clearError = () => {
    setError(null);
  };

  const value: ChatContextType = {
    chats,
    messages,
    activeChatId,
    activeChat,
    isLoading,
    isSendingMessage,
    error,
    setActiveChat,
    setActiveChatId,
    sendMessage,
    markAsRead,
    getChatById,
    createChat,
    startGroupChat,
    getChatMessages,
    getUnreadMessagesCount,
    clearError,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};