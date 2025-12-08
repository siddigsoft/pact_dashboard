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
import { useToast } from '@/hooks/use-toast';

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
  const { currentUser, users } = useUser();
  const { toast } = useToast();

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

  useEffect(() => {
    if (!currentUser?.id) return;
    const channel = supabase
      .channel(`chat_participants:${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_participants', filter: `user_id=eq.${currentUser.id}` },
        () => {
          loadChats(currentUser.id);
        }
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch {}
    };
  }, [currentUser?.id]);

  const loadChats = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const dbChats = await ChatService.getUserChats(userId);
      if (dbChats) {
        // Get chat IDs
        const chatIds = dbChats.map(chat => chat.id);
        
        // Fetch last messages for all chats in batch
        const lastMessages = await ChatService.getLastMessagesForChats(chatIds);
        
        // Load all participants for all chats
        const participantsMap: Record<string, string[]> = {};
        for (const chatId of chatIds) {
          const participants = await ChatService.getChatParticipants(chatId);
          if (participants) {
            participantsMap[chatId] = participants.map(p => p.user_id);
          }
        }
        
        // Convert database chats to our Chat type with last messages
        const convertedChats: Chat[] = dbChats.map(dbChat => {
          const lastMessage = lastMessages[dbChat.id];
          const participants = participantsMap[dbChat.id] || [];
          
          // For private chats, resolve the other participant's name
          let displayName = dbChat.name;
          if (dbChat.type === 'private' && participants.length > 0) {
            const otherParticipantId = participants.find(p => p !== userId);
            if (otherParticipantId) {
              // Try to get the user's name from the users list
              const otherUser = users.find(u => u.id === otherParticipantId);
              if (otherUser) {
                displayName = otherUser.fullName || otherUser.name || otherUser.username || otherUser.email || 'Unknown User';
              } else if (dbChat.name === 'Private Chat' || !dbChat.name) {
                // If we can't find the user, keep the original name or use a placeholder
                displayName = 'Unknown User';
              }
            }
          }
          
          return {
            id: dbChat.id,
            name: displayName,
            type: dbChat.type,
            isGroup: dbChat.is_group,
            createdBy: dbChat.created_by,
            stateId: dbChat.state_id,
            relatedEntityId: dbChat.related_entity_id,
            relatedEntityType: dbChat.related_entity_type,
            createdAt: dbChat.created_at,
            updatedAt: dbChat.updated_at,
            participants: participants,
            status: 'active',
            lastMessage: lastMessage ? {
              id: lastMessage.id,
              chatId: lastMessage.chat_id,
              senderId: lastMessage.sender_id,
              content: lastMessage.content || '',
              contentType: lastMessage.content_type,
              timestamp: lastMessage.created_at,
              status: lastMessage.status,
              attachments: lastMessage.attachments,
              metadata: lastMessage.metadata,
              readBy: [],
              read: false,
            } : undefined,
          };
        });
        
        // Sort chats by last message timestamp (most recent first), then by creation date
        convertedChats.sort((a, b) => {
          const aTime = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : new Date(a.createdAt).getTime();
          const bTime = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : new Date(b.createdAt).getTime();
          return bTime - aTime; // Descending order (newest first)
        });
        
        // Deduplicate by id to avoid transient duplicates
        const uniqueChats = Array.from(new Map(convertedChats.map(c => [c.id, c])).values());
        setChats(uniqueChats);
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
        const participantIds = participants.map(p => p.user_id);
        setChats(prevChats => {
          return prevChats.map(chat => {
            if (chat.id === chatId) {
              // For private chats, update the name to show the other participant's name
              let displayName = chat.name;
              if (chat.type === 'private' && currentUser?.id && participantIds.length > 0) {
                const otherParticipantId = participantIds.find(p => p !== currentUser.id);
                if (otherParticipantId) {
                  const otherUser = users.find(u => u.id === otherParticipantId);
                  if (otherUser) {
                    displayName = otherUser.fullName || otherUser.name || otherUser.username || otherUser.email || 'Unknown User';
                  }
                }
              }
              return { 
                ...chat, 
                participants: participantIds,
                name: displayName
              };
            }
            return chat;
          });
        });
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
    const isSubscribed = channels.some(channel => channel.topic === `chat:${chatId}`);
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
          const chatMessage: ChatMessage = {
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
          };
          
          setMessages(prevMessages => {
            const existing = prevMessages[chatId] || [];
            if (existing.some(m => m.id === newMessage.id)) return prevMessages;
            return {
              ...prevMessages,
              [chatId]: [...existing, chatMessage]
            };
          });
          
          // Update chat's last message and re-sort chats
          setChats(prevChats => {
            const updated = prevChats.map(chat => 
              chat.id === chatId 
                ? { ...chat, lastMessage: chatMessage, updatedAt: new Date().toISOString() }
                : chat
            );
            
            // Sort by last message timestamp (most recent first)
            return updated.sort((a, b) => {
              const aTime = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : new Date(a.createdAt).getTime();
              const bTime = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : new Date(b.createdAt).getTime();
              return bTime - aTime; // Descending order (newest first)
            });
          });
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

        setMessages(prevMessages => {
          const existing = prevMessages[chatId] || [];
          if (existing.some(m => m.id === newMessage.id)) return prevMessages;
          return {
            ...prevMessages,
            [chatId]: [...existing, newMessage],
          };
        });

        // Update chat's last message and move to top of list
        setChats(prevChats => {
          const updated = prevChats.map(chat => 
            chat.id === chatId 
              ? { ...chat, lastMessage: newMessage, updatedAt: new Date().toISOString() }
              : chat
          );
          
          // Sort by last message timestamp (most recent first)
          return updated.sort((a, b) => {
            const aTime = a.lastMessage?.timestamp ? new Date(a.lastMessage.timestamp).getTime() : new Date(a.createdAt).getTime();
            const bTime = b.lastMessage?.timestamp ? new Date(b.lastMessage.timestamp).getTime() : new Date(b.createdAt).getTime();
            return bTime - aTime; // Descending order (newest first)
          });
        });
      } else {
        throw new Error('Message was not saved - no response from database');
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      const errorMessage = err.message || 'Failed to send message';
      setError(errorMessage);
      throw err; // Re-throw so ChatWindow can show toast
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
      // For private chats, try to get the other participant's name
      let chatName: string;
      if (type === 'private' && participants.length === 1) {
        const otherParticipantId = participants[0];
        const otherUser = users.find(u => u.id === otherParticipantId);
        chatName = name || (otherUser 
          ? (otherUser.fullName || otherUser.name || otherUser.username || otherUser.email || 'Unknown User')
          : 'Private Chat');
      } else {
        chatName = name || (participants.length === 1 ? 'Private Chat' : 'Group Chat');
      }
      const isGroup = type !== 'private';

      // Compute deterministic pair key for private chats to enforce uniqueness
      let pairKey: string | undefined;
      if (type === 'private') {
        const otherId = participants.find(p => p !== currentUser.id) || participants[0];
        const ids = [currentUser.id, otherId].sort();
        pairKey = `${ids[0]}:${ids[1]}`;

        // Check if a chat already exists for this pair that current user can access
        let existingDb = await ChatService.getMyChatByPairKey(currentUser.id, pairKey);
        if (!existingDb) {
          // Fallback: direct lookup (in case of owner-created chats)
          existingDb = await ChatService.getPrivateChatByPairKey(pairKey);
        }
        if (existingDb) {
          // Load participants first to get the correct name
          const participants = await ChatService.getChatParticipants(existingDb.id);
          const participantIds = participants ? participants.map(p => p.user_id) : [];
          
          // For private chats, resolve the other participant's name
          let displayName = existingDb.name;
          if (existingDb.type === 'private' && participantIds.length > 0) {
            const otherParticipantId = participantIds.find(p => p !== currentUser.id);
            if (otherParticipantId) {
              const otherUser = users.find(u => u.id === otherParticipantId);
              if (otherUser) {
                displayName = otherUser.fullName || otherUser.name || otherUser.username || otherUser.email || name || 'Unknown User';
              } else if (name) {
                displayName = name;
              }
            }
          }
          
          const existingChat: Chat = {
            id: existingDb.id,
            name: displayName,
            type: existingDb.type,
            isGroup: existingDb.is_group,
            createdBy: existingDb.created_by,
            stateId: existingDb.state_id,
            relatedEntityId: existingDb.related_entity_id,
            relatedEntityType: existingDb.related_entity_type,
            createdAt: existingDb.created_at,
            updatedAt: existingDb.updated_at,
            participants: participantIds,
            status: 'active',
          };

          // Add to state if not present
          setChats(prev => {
            const map = new Map(prev.map(c => [c.id, c]));
            map.set(existingChat.id, existingChat);
            return Array.from(map.values());
          });
          setIsLoading(false);
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

      if (!dbChat) {
        throw new Error('Failed to create chat in database');
      }

      // Add participants to the chat
      // Add current user first (they're the creator, so RLS will allow it)
      // Then add other participants (RLS allows because current user is the creator)
      const allParticipants = [currentUser.id, ...participants];
      for (const participantId of allParticipants) {
        try {
          await ChatService.addParticipant(dbChat.id, participantId);
        } catch (participantError: any) {
          // If it's a duplicate, that's okay - participant already exists
          if (participantError?.message?.includes('duplicate') || participantError?.message?.includes('already exists')) {
            console.log(`Participant ${participantId} already in chat`);
          } else {
            console.error(`Failed to add participant ${participantId}:`, participantError);
            // Continue with other participants even if one fails
          }
        }
      }

      // Convert to our Chat type with resolved name
      const newChat: Chat = {
        id: dbChat.id,
        name: chatName, // Use the resolved name
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

      setChats(prevChats => {
        const map = new Map(prevChats.map(c => [c.id, c]));
        map.set(newChat.id, newChat);
        return Array.from(map.values());
      });
      
      setIsLoading(false);
      return newChat;
    } catch (err: any) {
      console.error('Error creating chat:', err);
      const errorMessage = err.message || 'Failed to create chat';
      setError(errorMessage);
      setIsLoading(false);
      
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
      
      return undefined;
    }
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