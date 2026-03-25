/**
 * Chat tables — DB access for chats, chat_participants, chat_messages, chat_message_reads.
 */
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

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
  attachments: unknown | null;
  metadata: unknown | null;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  created_at: string;
}

const CHAT_ROW_SELECT = `
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
`;

export function insertChatRow(chatData: Partial<DatabaseChat>) {
  return supabase.from('chats').insert(chatData).select().single();
}

export function fetchParticipantChatIdsForUser(userId: string) {
  return supabase.from('chat_participants').select('chat_id').eq('user_id', userId);
}

export function fetchPrivateChatByPairKeyAmongIds(pairKey: string, chatIds: string[]) {
  return supabase
    .from('chats')
    .select(CHAT_ROW_SELECT)
    .eq('type', 'private')
    .eq('pair_key', pairKey)
    .in('id', chatIds)
    .single();
}

export function fetchPrivateChatByPairKey(pairKey: string) {
  return supabase
    .from('chats')
    .select(CHAT_ROW_SELECT)
    .eq('type', 'private')
    .eq('pair_key', pairKey)
    .single();
}

export function fetchChatsByIds(chatIds: string[]) {
  return supabase.from('chats').select(CHAT_ROW_SELECT).in('id', chatIds);
}

export function fetchChatParticipantsRows(chatId: string) {
  return supabase.from('chat_participants').select('*').eq('chat_id', chatId);
}

export function insertChatParticipantRow(chatId: string, userId: string) {
  return supabase.from('chat_participants').insert({ chat_id: chatId, user_id: userId });
}

export function deleteChatParticipantRow(chatId: string, userId: string) {
  return supabase.from('chat_participants').delete().eq('chat_id', chatId).eq('user_id', userId);
}

export function insertChatMessageRow(messageData: Partial<DatabaseChatMessage>) {
  return supabase.from('chat_messages').insert(messageData).select().single();
}

export function fetchChatMessagesOrdered(chatId: string) {
  return supabase.from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true });
}

export function fetchLastChatMessage(chatId: string) {
  return supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
}

export function fetchChatMessagesForChats(chatIds: string[]) {
  return supabase.from('chat_messages').select('*').in('chat_id', chatIds).order('created_at', { ascending: false });
}

export function insertChatMessageReadRow(messageId: string, userId: string) {
  return supabase.from('chat_message_reads').insert({ message_id: messageId, user_id: userId });
}

export function fetchChatMessageReads(messageId: string) {
  return supabase.from('chat_message_reads').select('*').eq('message_id', messageId);
}

export function updateChatRow(chatId: string, updates: Partial<DatabaseChat>) {
  return supabase.from('chats').update(updates).eq('id', chatId);
}

export function deleteChatRow(chatId: string) {
  return supabase.from('chats').delete().eq('id', chatId);
}

export function subscribeToChatMessagesChannel(chatId: string, callback: (payload: unknown) => void): RealtimeChannel {
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
      },
    )
    .subscribe();
}

export function subscribeToMessageReadsChannel(messageId: string, callback: (payload: unknown) => void): RealtimeChannel {
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
      },
    )
    .subscribe();
}
