/**
 * useTaskComments Hook
 * React hook for managing task comments with real-time updates
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import * as TaskCommentsService from '@/services/task-comments.service';
import type { TaskComment, MentionNotification } from '@/services/task-comments.service';

export interface UseTaskCommentsOptions {
  taskId: string;
  autoLoad?: boolean;
  realtimeUpdates?: boolean;
}

export function useTaskComments({
  taskId,
  autoLoad = true,
  realtimeUpdates = true,
}: UseTaskCommentsOptions) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadMentions, setUnreadMentions] = useState<MentionNotification[]>([]);
  const [commentCount, setCommentCount] = useState(0);

  // Load comments
  const loadComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await TaskCommentsService.getTaskComments(taskId);
      setComments(data);

      const count = await TaskCommentsService.getCommentCount(taskId);
      setCommentCount(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  // Load unread mentions
  const loadUnreadMentions = useCallback(async () => {
    try {
      const mentions = await TaskCommentsService.getUnreadMentions();
      setUnreadMentions(mentions);
    } catch (err) {
      console.error('Failed to load unread mentions:', err);
    }
  }, []);

  // Create comment
  const createComment = useCallback(
    async (content: string, mentions: string[] = [], parentCommentId?: string) => {
      try {
        const newComment = await TaskCommentsService.createComment(
          taskId,
          content,
          mentions,
          parentCommentId
        );

        if (newComment) {
          if (parentCommentId) {
            // Update parent comment's replies
            setComments(prevComments =>
              prevComments.map(c => {
                if (c.id === parentCommentId) {
                  return {
                    ...c,
                    replies: [...(c.replies || []), newComment],
                    reply_count: (c.reply_count || 0) + 1,
                  };
                }
                return c;
              })
            );
          } else {
            // Add to top level comments
            setComments(prevComments => [newComment, ...prevComments]);
          }
          setCommentCount(prev => prev + 1);
        }

        return newComment;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create comment');
        return null;
      }
    },
    [taskId]
  );

  // Update comment
  const updateComment = useCallback(
    async (commentId: string, content: string, mentions: string[] = []) => {
      try {
        const updated = await TaskCommentsService.updateComment(commentId, content, mentions);

        if (updated) {
          setComments(prevComments =>
            prevComments.map(c => (c.id === commentId ? updated : c))
          );
        }

        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update comment');
        return null;
      }
    },
    []
  );

  // Delete comment
  const deleteComment = useCallback(
    async (commentId: string) => {
      try {
        const success = await TaskCommentsService.deleteComment(commentId);

        if (success) {
          setComments(prevComments =>
            prevComments.filter(c => c.id !== commentId)
          );
          setCommentCount(prev => prev - 1);
        }

        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete comment');
        return false;
      }
    },
    []
  );

  // Pin/unpin comment
  const togglePin = useCallback(
    async (commentId: string, isPinned: boolean) => {
      try {
        const success = await TaskCommentsService.togglePinComment(commentId, isPinned);

        if (success) {
          setComments(prevComments =>
            prevComments.map(c =>
              c.id === commentId ? { ...c, is_pinned: isPinned } : c
            )
          );
        }

        return success;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to pin comment');
        return false;
      }
    },
    []
  );

  // Mark mention as read
  const markMentionRead = useCallback(async (mentionId: string) => {
    try {
      const success = await TaskCommentsService.markMentionRead(mentionId);

      if (success) {
        setUnreadMentions(prev => prev.filter(m => m.id !== mentionId));
      }

      return success;
    } catch (err) {
      console.error('Failed to mark mention as read:', err);
      return false;
    }
  }, []);

  // Add reply to comment
  const addReply = useCallback(
    async (parentCommentId: string, content: string, mentions: string[] = []) => {
      const reply = await createComment(content, mentions, parentCommentId);
      return reply;
    },
    [createComment]
  );

  // Setup real-time subscription
  useEffect(() => {
    if (!realtimeUpdates) return;

    // Subscribe to new comments
    const subscription = supabase
      .channel(`task_comments:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_comment_threads',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const newComment = payload.new as TaskComment;
          if (newComment.parent_comment_id) {
            // Update parent's replies
            setComments(prev =>
              prev.map(c => {
                if (c.id === newComment.parent_comment_id) {
                  return {
                    ...c,
                    replies: [...(c.replies || []), newComment],
                    reply_count: (c.reply_count || 0) + 1,
                  };
                }
                return c;
              })
            );
          } else {
            setComments(prev => [newComment, ...prev]);
          }
          setCommentCount(prev => prev + 1);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'task_comment_threads',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const updated = payload.new as TaskComment;
          setComments(prev =>
            prev.map(c => (c.id === updated.id ? updated : c))
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'task_comment_threads',
          filter: `task_id=eq.${taskId}`,
        },
        (payload) => {
          const deleted = payload.old as TaskComment;
          setComments(prev => prev.filter(c => c.id !== deleted.id));
          setCommentCount(prev => Math.max(0, prev - 1));
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [taskId, realtimeUpdates]);

  // Auto-load comments on mount
  useEffect(() => {
    if (autoLoad) {
      loadComments();
      loadUnreadMentions();
    }
  }, [autoLoad, loadComments, loadUnreadMentions]);

  return {
    comments,
    loading,
    error,
    commentCount,
    unreadMentions,
    createComment,
    updateComment,
    deleteComment,
    togglePin,
    addReply,
    markMentionRead,
    loadComments,
    loadUnreadMentions,
  };
}

/**
 * useTaskCommentStats Hook
 * Get statistics about comments on a task
 */
export function useTaskCommentStats(taskId: string) {
  const [stats, setStats] = useState({
    total: 0,
    threaded: 0,
    mentions: 0,
    pinned: 0,
  });
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await TaskCommentsService.getCommentStats(taskId);
      setStats(data);
    } catch (err) {
      console.error('Failed to load comment stats:', err);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return { stats, loading, loadStats };
}
