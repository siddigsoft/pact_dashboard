import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { User, Chat, ChatMessage } from '@/types';
import { shouldBelongToStateGroup, createStateGroup } from '@/utils/stateGroupUtils';
import { sudanStates } from '@/data/sudanStates';

interface ChatContextType {
  chats: Chat[];
  messages: Record<string, ChatMessage[]>;
  activeChatId: string | null;
  activeChat: Chat | null;
  setActiveChat: (chat: Chat | null) => void;
  setActiveChatId: (chatId: string | null) => void;
  sendMessage: (chatId: string, content: string, contentType: "text" | "image" | "file" | "location" | "audio", attachments?: { url: string; type: string; name: string; size?: number; }[], metadata?: any) => Promise<void>;
  markAsRead: (chatId: string, messageId: string) => void;
  getChatById: (chatId: string) => Chat | undefined;
  createChat: (participants: string[], name?: string) => Promise<Chat | undefined>;
  startGroupChat: (participants: string[], name: string) => Promise<Chat | undefined>;
  leaveGroupChat: (chatId: string) => Promise<void>;
  addParticipantsToGroupChat: (chatId: string, participantIds: string[]) => Promise<void>;
  removeParticipantFromGroupChat: (chatId: string, participantId: string) => Promise<void>;
  updateChat: (chatId: string, updates: Partial<Chat>) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  getChatMessages: (chatId: string) => ChatMessage[] | undefined;
  sendReaction: (chatId: string, messageId: string, reaction: string) => Promise<void>;
  forwardMessage: (chatId: string, messageId: string, targetChatId: string) => Promise<void>;
  replyToMessage: (chatId: string, messageId: string, content: string, contentType: "text" | "image" | "file" | "location" | "audio", attachments?: { url: string; type: string; name: string; size?: number; }[]) => Promise<void>;
  retrySendMessage: (chatId: string, messageId: string, content: string, contentType: "text" | "image" | "file" | "location" | "audio", attachments?: { url: string; type: string; name: string; size?: number; }[], metadata?: any) => Promise<void>;
  editMessage: (chatId: string, messageId: string, newContent: string) => Promise<void>;
  deleteMessage: (chatId: string, messageId: string) => Promise<void>;
  pinMessage: (chatId: string, messageId: string) => Promise<void>;
  unpinMessage: (chatId: string, messageId: string) => Promise<void>;
  clearChatHistory: (chatId: string) => Promise<void>;
  searchMessages: (chatId: string, searchTerm: string) => ChatMessage[];
  downloadAttachment: (chatId: string, messageId: string, attachmentUrl: string) => Promise<void>;
  reportMessage: (chatId: string, messageId: string, reason: string) => Promise<void>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
  isUserBlocked: (userId: string) => boolean;
  createStateBasedGroupChats: (currentUserId: string, allUsers: User[]) => Promise<void>;
  getUnreadMessagesCount: () => number;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Record<string, ChatMessage[]>>({});
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [blockedUsers, setBlockedUsers] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);

  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('PACTCurrentUser');
      if (storedUser) {
        const parsedUser = JSON.parse(storedUser);
        if (parsedUser.id) {
          setCurrentUserId(parsedUser.id);
        }
      }

      const loadedUsers: User[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('user-')) {
          try {
            const userData = JSON.parse(localStorage.getItem(key) || '');
            loadedUsers.push(userData);
          } catch (err) {
            console.error("Error parsing stored user:", err);
          }
        }
      }
      setAllUsers(loadedUsers);

      const storedChats = localStorage.getItem('chats');
      const storedMessages = localStorage.getItem('messages');
      const storedBlockedUsers = localStorage.getItem('blockedUsers');

      if (storedChats) {
        setChats(JSON.parse(storedChats));
      }
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages));
      }
      if (storedBlockedUsers) {
        setBlockedUsers(JSON.parse(storedBlockedUsers));
      }
    } catch (error) {
      console.error("Error loading initial data:", error);
    }
  }, []);

  const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) || null : null;

  const setActiveChat = (chat: Chat | null) => {
    setActiveChatId(chat?.id || null);
  };

  useEffect(() => {
    localStorage.setItem('chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('blockedUsers', JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  const getChatById = useCallback((chatId: string) => {
    return chats.find(chat => chat.id === chatId);
  }, [chats]);

  const getChatMessages = useCallback((chatId: string) => {
    return messages[chatId];
  }, [messages]);

  const getUnreadMessagesCount = useCallback(() => {
    return chats.reduce((total, chat) => total + (chat.unreadCount || 0), 0);
  }, [chats]);

  const sendMessage = async (chatId: string, content: string, contentType: "text" | "image" | "file" | "location" | "audio", attachments: { url: string; type: string; name: string; size?: number; }[] = [], metadata: any = {}): Promise<void> => {
    if (!currentUserId) {
      console.error("No current user");
      return;
    }

    const newMessage: ChatMessage = {
      id: uuidv4(),
      chatId: chatId,
      senderId: currentUserId,
      content: content,
      contentType: contentType,
      timestamp: new Date().toISOString(),
      status: 'sent',
      attachments: attachments,
      metadata: metadata,
      readBy: [],
      read: false,
    };

    setMessages(prevMessages => {
      const updatedMessages = {
        ...prevMessages,
        [chatId]: [...(prevMessages[chatId] || []), newMessage],
      };
      return updatedMessages;
    });

    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === chatId 
          ? { ...chat, unreadCount: (chat.unreadCount || 0) + 1, lastMessage: newMessage }
          : chat
      )
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === newMessage.id);
        if (messageIndex !== -1) {
          updatedMessages[chatId][messageIndex] = { ...updatedMessages[chatId][messageIndex], status: 'delivered' };
        }
      }
      return updatedMessages;
    });
  };

  const retrySendMessage = async (chatId: string, messageId: string, content: string, contentType: "text" | "image" | "file" | "location" | "audio", attachments: { url: string; type: string; name: string; size?: number; }[] = [], metadata: any = {}): Promise<void> => {
    if (!currentUserId) {
      console.error("No current user");
      return;
    }

    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          updatedMessages[chatId][messageIndex] = { ...updatedMessages[chatId][messageIndex], status: 'sent' };
        }
      }
      return updatedMessages;
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          updatedMessages[chatId][messageIndex] = { ...updatedMessages[chatId][messageIndex], status: 'delivered' };
        }
      }
      return updatedMessages;
    });
  };

  const markAsRead = (chatId: string, messageId: string) => {
    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          updatedMessages[chatId][messageIndex] = {
            ...updatedMessages[chatId][messageIndex],
            read: true,
            readBy: [...(updatedMessages[chatId][messageIndex].readBy || []), currentUserId].filter(Boolean) as string[],
          };
        }
      }
      return updatedMessages;
    });
    
    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === chatId 
          ? { ...chat, unreadCount: 0 }
          : chat
      )
    );
  };

  const createChat = async (participants: string[], name?: string): Promise<Chat | undefined> => {
    if (!currentUserId) {
      console.error("No current user");
      return;
    }

    const chatExists = chats.find(chat =>
      chat.participants.length === participants.length + 1 &&
      chat.participants.includes(currentUserId) &&
      participants.every(p => chat.participants.includes(p))
    );

    if (chatExists) {
      setActiveChatId(chatExists.id);
      return chatExists;
    }

    const newChat: Chat = {
      id: uuidv4(),
      name: name || 'New Chat',
      type: 'private',
      participants: [...participants, currentUserId],
      unreadCount: 0,
      isGroup: false,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUserId,
      stateId: null,
      relatedEntityId: null,
      relatedEntityType: null,
    };

    setChats(prevChats => [...prevChats, newChat]);
    setActiveChatId(newChat.id);
    return newChat;
  };

  const startGroupChat = async (participants: string[], name: string): Promise<Chat | undefined> => {
    if (!currentUserId) {
      console.error("No current user");
      return;
    }

    const newChat: Chat = {
      id: uuidv4(),
      name: name,
      type: 'group',
      participants: [...participants, currentUserId],
      unreadCount: 0,
      isGroup: true,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: currentUserId,
      stateId: null,
      relatedEntityId: null,
      relatedEntityType: null,
    };

    setChats(prevChats => [...prevChats, newChat]);
    setActiveChatId(newChat.id);
    return newChat;
  };

  const leaveGroupChat = async (chatId: string): Promise<void> => {
    if (!currentUserId) {
      console.error("No current user");
      return;
    }

    setChats(prevChats => prevChats.map(chat =>
      chat.id === chatId ? { ...chat, participants: chat.participants.filter(p => p !== currentUserId) } : chat
    ));

    setActiveChatId(null);
  };

  const addParticipantsToGroupChat = async (chatId: string, participantIds: string[]): Promise<void> => {
    setChats(prevChats => prevChats.map(chat =>
      chat.id === chatId ? { ...chat, participants: [...chat.participants, ...participantIds] } : chat
    ));
  };

  const removeParticipantFromGroupChat = async (chatId: string, participantId: string): Promise<void> => {
    setChats(prevChats => prevChats.map(chat =>
      chat.id === chatId ? { ...chat, participants: chat.participants.filter(p => p !== participantId) } : chat
    ));
  };

  const updateChat = async (chatId: string, updates: Partial<Chat>): Promise<void> => {
    setChats(prevChats =>
      prevChats.map(chat => (chat.id === chatId ? { ...chat, ...updates } : chat))
    );
  };

  const deleteChat = async (chatId: string): Promise<void> => {
    setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
    setMessages(prevMessages => {
      const newMessages = { ...prevMessages };
      delete newMessages[chatId];
      return newMessages;
    });
    setActiveChatId(null);
  };

  const sendReaction = async (chatId: string, messageId: string, reaction: string): Promise<void> => {
    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          const currentMessage = updatedMessages[chatId][messageIndex];
          const currentReactions = currentMessage.metadata?.reactions || {};
          const userReactionsKey = currentUserId || '';
          const userReactions = currentReactions[userReactionsKey] || [];
          const reactionIndex = userReactions.indexOf(reaction);
          
          if (reactionIndex === -1) {
            userReactions.push(reaction);
          } else {
            userReactions.splice(reactionIndex, 1);
          }
          
          currentReactions[userReactionsKey] = userReactions;
          
          updatedMessages[chatId][messageIndex] = {
            ...currentMessage,
            metadata: {
              ...currentMessage.metadata,
              reactions: currentReactions
            }
          };
        }
      }
      return updatedMessages;
    });
  };

  const forwardMessage = async (chatId: string, messageId: string, targetChatId: string): Promise<void> => {
    const messageToForward = messages[chatId]?.find(msg => msg.id === messageId);

    if (messageToForward) {
      const newMessage: ChatMessage = {
        id: uuidv4(),
        chatId: targetChatId,
        senderId: currentUserId ?? '',
        content: messageToForward.content,
        contentType: messageToForward.contentType,
        timestamp: new Date().toISOString(),
        status: 'sent',
        attachments: messageToForward.attachments,
        metadata: {
          forwardedFrom: messageToForward.senderId,
        },
        readBy: [],
        read: false,
      };

      setMessages(prevMessages => ({
        ...prevMessages,
        [targetChatId]: [...(prevMessages[targetChatId] || []), newMessage],
      }));
      
      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === targetChatId 
            ? { ...chat, lastMessage: newMessage, updatedAt: new Date().toISOString() }
            : chat
        )
      );
    }
  };

  const replyToMessage = async (chatId: string, messageId: string, content: string, contentType: "text" | "image" | "file" | "location" | "audio", attachments: { url: string; type: string; name: string; size?: number; }[] = []): Promise<void> => {
    if (!currentUserId) {
      console.error("No current user");
      return;
    }

    const newMessage: ChatMessage = {
      id: uuidv4(),
      chatId: chatId,
      senderId: currentUserId,
      content: content,
      contentType: contentType,
      timestamp: new Date().toISOString(),
      status: 'sent',
      attachments: attachments,
      metadata: {
        replyTo: messageId,
      },
      readBy: [],
      read: false,
    };

    setMessages(prevMessages => ({
      ...prevMessages,
      [chatId]: [...(prevMessages[chatId] || []), newMessage],
    }));
    
    setChats(prevChats => 
      prevChats.map(chat => 
        chat.id === chatId 
          ? { ...chat, lastMessage: newMessage, updatedAt: new Date().toISOString() }
          : chat
      )
    );
  };

  const editMessage = async (chatId: string, messageId: string, newContent: string): Promise<void> => {
    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        const messageIndex = updatedMessages[chatId].findIndex(msg => msg.id === messageId);
        if (messageIndex !== -1) {
          updatedMessages[chatId][messageIndex] = { ...updatedMessages[chatId][messageIndex], content: newContent };
        }
      }
      return updatedMessages;
    });
  };

  const deleteMessage = async (chatId: string, messageId: string): Promise<void> => {
    setMessages(prevMessages => {
      const updatedMessages = { ...prevMessages };
      if (updatedMessages[chatId]) {
        updatedMessages[chatId] = updatedMessages[chatId].filter(msg => msg.id !== messageId);
      }
      return updatedMessages;
    });
  };

  const pinMessage = async (chatId: string, messageId: string): Promise<void> => {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId ? { ...chat, pinnedMessageId: messageId } : chat
      )
    );
  };

  const unpinMessage = async (chatId: string, messageId: string): Promise<void> => {
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === chatId && chat.pinnedMessageId === messageId ? { ...chat, pinnedMessageId: null } : chat
      )
    );
  };

  const clearChatHistory = async (chatId: string): Promise<void> => {
    setMessages(prevMessages => ({ ...prevMessages, [chatId]: [] }));
  };

  const searchMessages = (chatId: string, searchTerm: string): ChatMessage[] => {
    const chatMessages = messages[chatId] || [];
    const lowerSearchTerm = searchTerm.toLowerCase();
    return chatMessages.filter(msg => {
      const normalized = msg.content?.toLowerCase() ?? '';
      return normalized.includes(lowerSearchTerm);
    });
  };

  const downloadAttachment = async (chatId: string, messageId: string, attachmentUrl: string): Promise<void> => {
    console.log(`Downloading attachment from ${attachmentUrl} for message ${messageId} in chat ${chatId}`);
  };

  const reportMessage = async (chatId: string, messageId: string, reason: string): Promise<void> => {
    console.log(`Reporting message ${messageId} in chat ${chatId} for reason: ${reason}`);
  };

  const blockUser = async (userId: string): Promise<void> => {
    setBlockedUsers(prevBlockedUsers => [...prevBlockedUsers, userId]);
  };

  const unblockUser = async (userId: string): Promise<void> => {
    setBlockedUsers(prevBlockedUsers => prevBlockedUsers.filter(id => id !== userId));
  };

  const isUserBlocked = (userId: string): boolean => {
    return blockedUsers.includes(userId);
  };

  const createStateBasedGroupChats = async (userId: string, users: User[]): Promise<void> => {
    if (!userId) {
      console.error("No current user");
      return;
    }

    const existingStateGroupChats = chats.filter(chat => chat.isStateGroup);
    if (existingStateGroupChats.length > 0) {
      console.log("State-based group chats already exist. Skipping creation.");
      return;
    }

    sudanStates.forEach(async (state) => {
      const potentialParticipants = users.filter(user => shouldBelongToStateGroup(user, state.id));
      const participantIds = potentialParticipants.map(user => user.id);

      if (participantIds.length > 0) {
        const newStateGroupChat = createStateGroup(state.name, state.id, participantIds);
        setChats(prevChats => [...prevChats, newStateGroupChat]);
      }
    });
  };

  const value: ChatContextType = {
    chats,
    messages,
    activeChatId,
    activeChat,
    setActiveChat,
    setActiveChatId,
    sendMessage,
    markAsRead,
    getChatById,
    createChat,
    startGroupChat,
    leaveGroupChat,
    addParticipantsToGroupChat,
    removeParticipantFromGroupChat,
    updateChat,
    deleteChat,
    getChatMessages,
    sendReaction,
    forwardMessage,
    replyToMessage,
    retrySendMessage,
    editMessage,
    deleteMessage,
    pinMessage,
    unpinMessage,
    clearChatHistory,
    searchMessages,
    downloadAttachment,
    reportMessage,
    blockUser,
    unblockUser,
    isUserBlocked,
    createStateBasedGroupChats,
    getUnreadMessagesCount,
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
