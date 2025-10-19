import { supabase } from '@/integrations/supabase/client';
import { Chat, ChatMessage } from '@/types/chat';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface ChatMessageRead {
  message_id: string;
  user_id: string;
  read_at: string;
}

export interface ChatParticipant {
  chat_id: string;
  user_id: string;
  joined_at: string;
}

export interface DatabaseChat {
  id: string;
  name: string;
  type: 'private' | 'group' | 'state-group';
  is_group: boolean;
  created_by: string | null;
  state_id: string | null;
  related_entity_id: string | null;
  related_entity_type: 'mmpFile' | 'siteVisit' | 'project' | null;
  created_at: string;
  updated_at: string;
  pair_key?: string | null;
}

export interface DatabaseChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string | null;
  content_type: 'text' | 'image' | 'file' | 'location' | 'audio';
  attachments: any | null;
  metadata: any | null;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
}

export class ChatService {
  // Create a new chat
  static async createChat(chatData: Partial<DatabaseChat>): Promise<DatabaseChat | null> {
    try {
      const { data, error } = await supabase
        .from('chats')
        .insert(chatData)
        .select()
        .single();

      if (error) {
        const code = (error as any)?.code;
        const msg = (error as any)?.message?.toString().toLowerCase?.() || '';
        const isUniqueViolation = code === '23505' || msg.includes('duplicate key');
        if (isUniqueViolation && chatData.pair_key && chatData.type === 'private') {
          const existing = await ChatService.getPrivateChatByPairKey(chatData.pair_key);
          if (existing) return existing;
        }
        console.error('Error creating chat:', error);
        return null;
      }

      return data as DatabaseChat;
    } catch (error) {
      console.error('Error creating chat:', error);
      return null;
    }
  }

  // Get existing private chat by pair key
  static async getPrivateChatByPairKey(pairKey: string): Promise<DatabaseChat | null> {
    try {
      const { data, error } = await supabase
        .from('chats')
        .select(`
          id,
          name,
          type,
          is_group,
          created_by,
          state_id,
          related_entity_id,
          related_entity_type,
          created_at,
          updated_at,
          pair_key
        `)
        .eq('type', 'private')
        .eq('pair_key', pairKey)
        .single();

      if (error) {
        return null;
      }
      return data as DatabaseChat;
    } catch (error) {
      return null;
    }
  }

  // Get all chats for the current user
  static async getUserChats(userId: string): Promise<DatabaseChat[] | null> {
    try {
      // Step 1: fetch chat IDs where the user is a participant (no nested joins)
      const { data: cpRows, error: cpError } = await supabase
        .from('chat_participants')
        .select('chat_id')
        .eq('user_id', userId);

      if (cpError) {
        console.error('Error fetching user chat ids:', cpError);
        return null;
      }

      const chatIds = (cpRows || []).map((r: { chat_id: string }) => r.chat_id);
      if (chatIds.length === 0) return [];

      // Step 2: fetch chats by IDs (simple IN filter)
      const { data: chats, error: chatsError } = await supabase
        .from('chats')
        .select(`
          id,
          name,
          type,
          is_group,
          created_by,
          state_id,
          related_entity_id,
          related_entity_type,
          created_at,
          updated_at,
          pair_key
        `)
        .in('id', chatIds);

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

  // Get chat participants
  static async getChatParticipants(chatId: string): Promise<ChatParticipant[] | null> {
    try {
      const { data, error } = await supabase
        .from('chat_participants')
        .select('*')
        .eq('chat_id', chatId);
      
      if (error) {
        console.error('Error fetching chat participants:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching chat participants:', error);
      return null;
    }
  }

  // Add participant to chat
  static async addParticipant(chatId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chat_participants')
        .insert({
          chat_id: chatId,
          user_id: userId
        });
      
      if (error) {
        console.error('Error adding participant:', error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Error adding participant:', error);
      return false;
    }
  }

  // Remove participant from chat
  static async removeParticipant(chatId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chat_participants')
        .delete()
        .eq('chat_id', chatId)
        .eq('user_id', userId);
      
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

  // Send a message
  static async sendMessage(messageData: Partial<DatabaseChatMessage>): Promise<DatabaseChatMessage | null> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert(messageData)
        .select()
        .single();
      
      if (error) {
        console.error('Error sending message:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error sending message:', error);
      return null;
    }
  }

  // Get messages for a chat
  static async getChatMessages(chatId: string): Promise<DatabaseChatMessage[] | null> {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });
      
      if (error) {
        console.error('Error fetching chat messages:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching chat messages:', error);
      return null;
    }
  }

  // Mark message as read
  static async markMessageAsRead(messageId: string, userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chat_message_reads')
        .insert({
          message_id: messageId,
          user_id: userId
        });
      
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

  // Get read receipts for a message
  static async getMessageReadReceipts(messageId: string): Promise<ChatMessageRead[] | null> {
    try {
      const { data, error } = await supabase
        .from('chat_message_reads')
        .select('*')
        .eq('message_id', messageId);
      
      if (error) {
        console.error('Error fetching message read receipts:', error);
        return null;
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching message read receipts:', error);
      return null;
    }
  }

  // Update chat
  static async updateChat(chatId: string, updates: Partial<DatabaseChat>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chats')
        .update(updates)
        .eq('id', chatId);
      
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

  // Delete chat
  static async deleteChat(chatId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);
      
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

  // Subscribe to chat messages in real-time
  static subscribeToChatMessages(chatId: string, callback: (payload: any) => void): RealtimeChannel {
    return supabase
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
          callback(payload);
        }
      )
      .subscribe();
  }

  // Subscribe to message read status updates
  static subscribeToMessageReads(messageId: string, callback: (payload: any) => void): RealtimeChannel {
    return supabase
      .channel(`message-reads:${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_message_reads',
          filter: `message_id=eq.${messageId}`,
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();
  }
}