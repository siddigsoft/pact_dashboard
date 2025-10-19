
import { User } from './user';

export interface Chat {
  id: string;
  name: string;
  type: 'private' | 'group' | 'state-group';
  isGroup: boolean;
  createdBy: string | null;
  stateId: string | null;
  relatedEntityId: string | null;
  relatedEntityType: 'mmpFile' | 'siteVisit' | 'project' | null;
  createdAt: string;
  updatedAt: string;
  participants: string[];
  lastMessage?: ChatMessage;
  unreadCount?: number;
  status: 'active' | 'archived' | 'deleted';
  pinnedMessageId?: string | null;
  isStateGroup?: boolean;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  content: string | null;
  contentType: 'text' | 'image' | 'file' | 'location' | 'audio';
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  attachments?: any;
  metadata?: any;
  readBy: string[];
  read?: boolean;
}

export interface ChatParticipant {
  chat_id: string;
  user_id: string;
  joined_at: string;
}

export interface ChatMessageRead {
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface ChatContextType {
  chats: Chat[];
  currentChat: Chat | null;
  isLoading: boolean;
  selectedUsers: User[];
  createChat: (participants: string[], isGroup: boolean, groupName?: string) => Promise<string>;
  sendMessage: (content: string, contentType: ChatMessage['contentType'], attachments?: ChatMessage['attachments'], metadata?: ChatMessage['metadata']) => Promise<boolean>;
  loadChat: (chatId: string) => Promise<boolean>;
  loadChats: () => Promise<boolean>;
  markAsRead: (chatId: string, messageIds?: string[]) => Promise<boolean>;
  deleteChat: (chatId: string) => Promise<boolean>;
  archiveChat: (chatId: string) => Promise<boolean>;
  selectUser: (user: User) => void;
  removeSelectedUser: (userId: string) => void;
  clearSelectedUsers: () => void;
}
