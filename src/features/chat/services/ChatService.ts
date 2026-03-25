import type { ChatParticipant, ChatMessageRead } from '@/types/chat';
import type { DatabaseChat, DatabaseChatMessage } from '@/features/chat/repository/chatRepository';
import * as chatRepo from '@/features/chat/repository/chatRepository';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type { DatabaseChat, DatabaseChatMessage };
export type { ChatMessageRead, ChatParticipant };

export class ChatService {
  static async createChat(chatData: Partial<DatabaseChat>): Promise<DatabaseChat | null> {
    try {
      const { data, error } = await chatRepo.insertChatRow(chatData);

      if (error) {
        const code = (error as { code?: string })?.code;
        const msg = (error as { message?: string })?.message?.toString?.().toLowerCase?.() || '';
        const isUniqueViolation = code === '23505' || msg.includes('duplicate key');
        if (isUniqueViolation && chatData.pair_key && chatData.type === 'private') {
          const existing = await ChatService.getPrivateChatByPairKey(chatData.pair_key);
          if (existing) return existing;
        }
        console.error('Error creating chat:', error);
        throw new Error(`Failed to create chat: ${error.message || 'Unknown error'} (Code: ${code || 'N/A'})`);
      }

      if (!data) {
        throw new Error('Chat created but no data returned');
      }

      return data as DatabaseChat;
    } catch (error) {
      console.error('Error creating chat:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to create chat: Unknown error');
    }
  }

  static async getMyChatByPairKey(userId: string, pairKey: string): Promise<DatabaseChat | null> {
    try {
      const { data: cpRows, error: cpError } = await chatRepo.fetchParticipantChatIdsForUser(userId);

      if (cpError) return null;

      const chatIds = (cpRows || []).map((r: { chat_id: string }) => r.chat_id);
      if (chatIds.length === 0) return null;

      const { data, error } = await chatRepo.fetchPrivateChatByPairKeyAmongIds(pairKey, chatIds);

      if (error) return null;
      return data as DatabaseChat;
    } catch {
      return null;
    }
  }

  static async getPrivateChatByPairKey(pairKey: string): Promise<DatabaseChat | null> {
    try {
      const { data, error } = await chatRepo.fetchPrivateChatByPairKey(pairKey);

      if (error) {
        return null;
      }
      return data as DatabaseChat;
    } catch {
      return null;
    }
  }

  static async getUserChats(userId: string): Promise<DatabaseChat[] | null> {
    try {
      const { data: cpRows, error: cpError } = await chatRepo.fetchParticipantChatIdsForUser(userId);

      if (cpError) {
        console.error('Error fetching user chat ids:', cpError);
        return null;
      }

      const chatIds = (cpRows || []).map((r: { chat_id: string }) => r.chat_id);
      if (chatIds.length === 0) return [];

      const { data: chats, error: chatsError } = await chatRepo.fetchChatsByIds(chatIds);

      if (chatsError) {
        console.error('Error fetching chats by ids:', chatsError);
        return null;
      }

      return (chats || []) as DatabaseChat[];
    } catch (error) {
      console.error('Error fetching user chats:', error);
      return null;
    }
  }

  static async getChatParticipants(chatId: string): Promise<ChatParticipant[] | null> {
    try {
      const { data, error } = await chatRepo.fetchChatParticipantsRows(chatId);

      if (error) {
        console.error('Error fetching chat participants:', error);
        return null;
      }

      return data as ChatParticipant[];
    } catch (error) {
      console.error('Error fetching chat participants:', error);
      return null;
    }
  }

  static async addParticipant(chatId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await chatRepo.insertChatParticipantRow(chatId, userId);

      if (error) {
        const code = (error as { code?: string })?.code;
        if (code === '23505') {
          console.log(`Participant ${userId} already exists in chat ${chatId}`);
          return true;
        }
        console.error('Error adding participant:', error);
        throw new Error(`Failed to add participant: ${error.message || 'Unknown error'} (Code: ${code || 'N/A'})`);
      }

      return true;
    } catch (error) {
      console.error('Error adding participant:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to add participant: Unknown error');
    }
  }

  static async removeParticipant(chatId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await chatRepo.deleteChatParticipantRow(chatId, userId);

      if (error) {
        console.error('Error removing participant:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error removing participant:', error);
      return false;
    }
  }

  static async sendMessage(messageData: Partial<DatabaseChatMessage>): Promise<DatabaseChatMessage | null> {
    try {
      const { data, error } = await chatRepo.insertChatMessageRow(messageData);

      if (error) {
        console.error('Error sending message:', error);
        throw new Error(`Failed to send message: ${error.message || error.code || 'Database error'}`);
      }

      return data as DatabaseChatMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to send message: Unknown error');
    }
  }

  static async getChatMessages(chatId: string): Promise<DatabaseChatMessage[] | null> {
    try {
      const { data, error } = await chatRepo.fetchChatMessagesOrdered(chatId);

      if (error) {
        console.error('Error fetching chat messages:', error);
        return null;
      }

      return data as DatabaseChatMessage[];
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return null;
    }
  }

  static async getLastMessage(chatId: string): Promise<DatabaseChatMessage | null> {
    try {
      const { data, error } = await chatRepo.fetchLastChatMessage(chatId);

      if (error) {
        if (error.code === 'PGRST116') {
          return null;
        }
        console.error('Error fetching last message:', error);
        return null;
      }

      return data as DatabaseChatMessage;
    } catch (error) {
      console.error('Error fetching last message:', error);
      return null;
    }
  }

  static async getLastMessagesForChats(chatIds: string[]): Promise<Record<string, DatabaseChatMessage>> {
    if (chatIds.length === 0) return {};

    try {
      const { data, error } = await chatRepo.fetchChatMessagesForChats(chatIds);

      if (error) {
        console.error('Error fetching last messages:', error);
        return {};
      }

      const lastMessages: Record<string, DatabaseChatMessage> = {};
      const seenChats = new Set<string>();

      for (const message of data || []) {
        if (!seenChats.has(message.chat_id)) {
          lastMessages[message.chat_id] = message as DatabaseChatMessage;
          seenChats.add(message.chat_id);
        }
      }

      return lastMessages;
    } catch (error) {
      console.error('Error fetching last messages:', error);
      return {};
    }
  }

  static async markMessageAsRead(messageId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await chatRepo.insertChatMessageReadRow(messageId, userId);

      if (error) {
        console.error('Error marking message as read:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking message as read:', error);
      return false;
    }
  }

  static async getMessageReadReceipts(messageId: string): Promise<ChatMessageRead[] | null> {
    try {
      const { data, error } = await chatRepo.fetchChatMessageReads(messageId);

      if (error) {
        console.error('Error fetching message read receipts:', error);
        return null;
      }

      return data as ChatMessageRead[];
    } catch (error) {
      console.error('Error fetching message read receipts:', error);
      return null;
    }
  }

  static async updateChat(chatId: string, updates: Partial<DatabaseChat>): Promise<boolean> {
    try {
      const { error } = await chatRepo.updateChatRow(chatId, updates);

      if (error) {
        console.error('Error updating chat:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error updating chat:', error);
      return false;
    }
  }

  static async deleteChat(chatId: string): Promise<boolean> {
    try {
      const { error } = await chatRepo.deleteChatRow(chatId);

      if (error) {
        console.error('Error deleting chat:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      return false;
    }
  }

  static subscribeToChatMessages(chatId: string, callback: (payload: unknown) => void): RealtimeChannel {
    return chatRepo.subscribeToChatMessagesChannel(chatId, callback);
  }

  static subscribeToMessageReads(messageId: string, callback: (payload: unknown) => void): RealtimeChannel {
    return chatRepo.subscribeToMessageReadsChannel(messageId, callback);
  }
}
