/**
 * Task Comments Service
 * Manages task comments with @mentions, threading, and notifications
 * 
 * Usage:
 * await createComment(taskId, 'This is my comment with @[User Name](uuid)', [uuid]);
 * const comments = await getTaskComments(taskId);
 */

import { supabase } from '@/lib/supabase';

export interface TaskComment {
  id: string;
  task_id: string;
  parent_comment_id: string | null;
  user_id: string;
  content: string;
  mentions: string[];
  is_pinned: boolean;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    full_name: string;
    email: string;
  };
  mentions_data?: Array<{
    id: string;
    full_name: string;
    email: string;
  }>;
  replies?: TaskComment[];
  reply_count?: number;
}

export interface MentionNotification {
  id: string;
  comment_id: string;
  mentioned_user_id: string;
  mentioned_by_id: string;
  task_id: string;
  is_read: boolean;
  created_at: string;
  comment?: TaskComment;
}

/**
 * Create a new comment on a task
 */
export async function createComment(
  taskId: string,
  content: string,
  mentions: string[] = [],
  parentCommentId?: string
): Promise<TaskComment | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return null;
    }

    const { data, error } = await supabase
      .from('task_comment_threads')
      .insert({
        task_id: taskId,
        parent_comment_id: parentCommentId || null,
        user_id: user.id,
        content,
        mentions: mentions.length > 0 ? mentions : [],
      })
      .select(`
        *,
        user:user_id(id, full_name, email)
      `)
      .single();

    if (error) {
      console.error('Failed to create comment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error in createComment:', err);
    return null;
  }
}

/**
 * Get all comments for a task (with replies)
 */
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  try {
    const { data, error } = await supabase
      .from('task_comment_threads')
      .select(`
        *,
        user:user_id(id, full_name, email)
      `)
      .eq('task_id', taskId)
      .is('parent_comment_id', null)
      .is('deleted_at', null)
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch task comments:', error);
      return [];
    }

    // Get replies for each comment
    const comments = (data || []) as TaskComment[];
    
    for (const comment of comments) {
      const replies = await getCommentReplies(comment.id);
      comment.replies = replies;
      comment.reply_count = replies.length;
    }

    return comments;
  } catch (err) {
    console.error('Error in getTaskComments:', err);
    return [];
  }
}

/**
 * Get replies to a specific comment
 */
export async function getCommentReplies(commentId: string): Promise<TaskComment[]> {
  try {
    const { data, error } = await supabase
      .from('task_comment_threads')
      .select(`
        *,
        user:user_id(id, full_name, email)
      `)
      .eq('parent_comment_id', commentId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Failed to fetch comment replies:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getCommentReplies:', err);
    return [];
  }
}

/**
 * Update a comment
 */
export async function updateComment(
  commentId: string,
  content: string,
  mentions: string[] = []
): Promise<TaskComment | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from('task_comment_threads')
      .update({
        content,
        mentions: mentions.length > 0 ? mentions : [],
        edited_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('user_id', user?.id || '')
      .select(`
        *,
        user:user_id(id, full_name, email)
      `)
      .single();

    if (error) {
      console.error('Failed to update comment:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Error in updateComment:', err);
    return null;
  }
}

/**
 * Delete a comment (soft delete)
 */
export async function deleteComment(commentId: string): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('task_comment_threads')
      .update({
        deleted_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .eq('user_id', user?.id || '');

    if (error) {
      console.error('Failed to delete comment:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in deleteComment:', err);
    return false;
  }
}

/**
 * Pin/unpin a comment
 */
export async function togglePinComment(commentId: string, isPinned: boolean): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('task_comment_threads')
      .update({
        is_pinned: isPinned,
      })
      .eq('id', commentId);

    if (error) {
      console.error('Failed to pin/unpin comment:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in togglePinComment:', err);
    return false;
  }
}

/**
 * Get unread mentions for current user
 */
export async function getUnreadMentions(): Promise<MentionNotification[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .rpc('get_unread_mentions', {
        p_user_id: user.id,
      });

    if (error) {
      console.error('Failed to fetch unread mentions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getUnreadMentions:', err);
    return [];
  }
}

/**
 * Mark mention as read
 */
export async function markMentionRead(mentionId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .rpc('mark_mention_read', {
        p_mention_id: mentionId,
      });

    if (error) {
      console.error('Failed to mark mention as read:', error);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error in markMentionRead:', err);
    return false;
  }
}

/**
 * Get comment count for a task
 */
export async function getCommentCount(taskId: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('task_comment_threads')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .is('deleted_at', null);

    if (error) {
      console.error('Failed to get comment count:', error);
      return 0;
    }

    return count || 0;
  } catch (err) {
    console.error('Error in getCommentCount:', err);
    return 0;
  }
}

/**
 * Search comments in a task
 */
export async function searchComments(taskId: string, searchTerm: string): Promise<TaskComment[]> {
  try {
    const { data, error } = await supabase
      .from('task_comment_threads')
      .select(`
        *,
        user:user_id(id, full_name, email)
      `)
      .eq('task_id', taskId)
      .ilike('content', `%${searchTerm}%`)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to search comments:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in searchComments:', err);
    return [];
  }
}

/**
 * Get recent mentions for a user
 */
export async function getRecentMentions(limit: number = 20): Promise<MentionNotification[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('comment_mention_notifications')
      .select(`
        *,
        comment:comment_id(
          id, content, task_id,
          user:user_id(id, full_name)
        )
      `)
      .eq('mentioned_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Failed to fetch recent mentions:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getRecentMentions:', err);
    return [];
  }
}

/**
 * Get mention notifications by task
 */
export async function getTaskMentionNotifications(taskId: string): Promise<MentionNotification[]> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('comment_mention_notifications')
      .select('*')
      .eq('task_id', taskId)
      .eq('mentioned_user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch task mention notifications:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error in getTaskMentionNotifications:', err);
    return [];
  }
}

/**
 * Get comment statistics for a task
 */
export async function getCommentStats(taskId: string): Promise<{
  total: number;
  threaded: number;
  mentions: number;
  pinned: number;
}> {
  try {
    const { data, error } = await supabase
      .from('task_comment_threads')
      .select('id, parent_comment_id, mentions, is_pinned')
      .eq('task_id', taskId)
      .is('deleted_at', null);

    if (error) {
      console.error('Failed to get comment stats:', error);
      return { total: 0, threaded: 0, mentions: 0, pinned: 0 };
    }

    const records = data || [];
    const threaded = records.filter(r => r.parent_comment_id).length;
    const mentions = records.reduce((sum, r) => sum + (r.mentions?.length || 0), 0);
    const pinned = records.filter(r => r.is_pinned).length;

    return {
      total: records.length,
      threaded,
      mentions,
      pinned,
    };
  } catch (err) {
    console.error('Error in getCommentStats:', err);
    return { total: 0, threaded: 0, mentions: 0, pinned: 0 };
  }
}

/**
 * Extract mentioned user IDs from content with @[name](id) format
 */
export function extractMentionIds(content: string): string[] {
  const pattern = /@\[([^\]]+)\]\(([a-f0-9\-]+)\)/g;
  const mentions: string[] = [];
  let match;

  while ((match = pattern.exec(content)) !== null) {
    mentions.push(match[2]);
  }

  return mentions;
}

/**
 * Format mention in content to @[name](id)
 */
export function formatMention(userId: string, userName: string): string {
  return `@[${userName}](${userId})`;
}
