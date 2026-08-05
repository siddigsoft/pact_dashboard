import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { MessageCircle, Send, Trash2, Loader2, CornerDownRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useProjectComments, ProjectComment } from '@/hooks/useProjectComments';
import { MentionTextarea, extractMentionIds } from '@/components/mentions/MentionTextarea';
import { MentionRenderer } from '@/components/mentions/MentionRenderer';
import { dispatchNotification } from '@/lib/notify';
import { cn } from '@/lib/utils';

interface ProjectCommentsPanelProps {
  projectId: string;
  currentUserId: string;
  currentUserName?: string;
  isAdmin: boolean;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function relativeTime(isoString: string): string {
  try {
    return formatDistanceToNow(parseISO(isoString), { addSuffix: true });
  } catch {
    return '';
  }
}

/* ── Single comment bubble ───────────────────────────────────────────── */
interface CommentBubbleProps {
  comment: ProjectComment;
  currentUserId: string;
  currentUserName?: string;
  isAdmin: boolean;
  projectId: string;
  isReply?: boolean;
  onReply: (comment: ProjectComment) => void;
  onDelete: (id: string) => void;
  submitting: boolean;
}

function CommentBubble({
  comment,
  currentUserId,
  currentUserName,
  isAdmin,
  projectId,
  isReply = false,
  onReply,
  onDelete,
  submitting,
}: CommentBubbleProps) {
  const canDelete = isAdmin || comment.author_id === currentUserId;
  const name = comment.author_name ?? 'Unknown';

  return (
    <div
      className={cn('flex gap-3 group', isReply && 'ml-8 mt-2')}
      data-testid={`comment-row-${comment.id}`}
    >
      {isReply && (
        <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-2" />
      )}
      <Avatar className={cn('flex-shrink-0 mt-0.5', isReply ? 'h-6 w-6' : 'h-7 w-7')}>
        <AvatarFallback
          className={cn(
            'bg-[#1D3461]/10 text-[#1D3461] dark:bg-[#1D3461]/30 dark:text-blue-300',
            isReply ? 'text-[10px]' : 'text-xs',
          )}
        >
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={cn('font-medium', isReply ? 'text-xs' : 'text-sm')}>{name}</span>
          <span className="text-xs text-muted-foreground">{relativeTime(comment.created_at)}</span>
          {comment.optimistic && (
            <span className="text-[10px] text-muted-foreground italic">sending…</span>
          )}
        </div>
        <p className={cn('mt-0.5', isReply ? 'text-xs' : 'text-sm')}>
          <MentionRenderer content={comment.content} currentUserId={currentUserId} />
        </p>

        {/* Reply button — only shown on top-level comments */}
        {!isReply && !comment.optimistic && (
          <button
            className="mt-1 text-[11px] text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
            onClick={() => onReply(comment)}
          >
            <CornerDownRight className="h-3 w-3" />
            Reply
          </button>
        )}
      </div>

      {canDelete && !comment.optimistic && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-muted-foreground hover:text-destructive"
              data-testid={`button-delete-comment-${comment.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete comment?</AlertDialogTitle>
              <AlertDialogDescription>
                This cannot be undone.
                {!isReply && ' Any replies to this comment will also be deleted.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => onDelete(comment.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────── */
const ProjectCommentsPanel: React.FC<ProjectCommentsPanelProps> = ({
  projectId,
  currentUserId,
  currentUserName,
  isAdmin,
}) => {
  const { comments, loading, submitting, addComment, deleteComment } = useProjectComments(projectId);
  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ProjectComment | null>(null);
  const [replyText, setReplyText] = useState('');

  /* Top-level comments (oldest → newest) */
  const topLevel = comments.filter((c) => !c.parent_id);
  /* Group replies by parent id */
  const repliesFor = (parentId: string) =>
    comments.filter((c) => c.parent_id === parentId);

  const dispatchMentionNotification = (
    content: string,
    entityId: string,
    parentCommentId?: string,
  ) => {
    const mentionIds = extractMentionIds(content).filter((id) => id !== currentUserId);
    if (mentionIds.length === 0) return;
    const authorName = currentUserName ?? 'A teammate';
    const preview = content.replace(/@\[([^\]]+)\]\([a-f0-9\-]+\)/g, '@$1').slice(0, 140);
    dispatchNotification({
      event: 'comment_mention',
      recipientIds: mentionIds,
      titleEn: `${authorName} mentioned you in a project comment`,
      titleAr: `${authorName} أشار إليك في تعليق على المشروع`,
      messageEn: preview,
      messageAr: preview,
      priority: 'normal',
      entityType: 'project',
      entityId,
      actionUrl: `/projects/${entityId}`,
      sendEmail: true,
      triggeredBy: currentUserId,
      triggeredByName: authorName,
    });
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    const ok = await addComment(trimmed, currentUserId, currentUserName);
    if (ok) {
      setText('');
      dispatchMentionNotification(trimmed, projectId);
    }
  };

  const handleReplySubmit = async () => {
    if (!replyText.trim() || !replyingTo) return;
    const trimmed = replyText.trim();
    const ok = await addComment(trimmed, currentUserId, currentUserName, replyingTo.id);
    if (ok) {
      setReplyText('');
      setReplyingTo(null);
      dispatchMentionNotification(trimmed, projectId, replyingTo.id);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── New comment input ── */}
      <div className="space-y-2">
        <MentionTextarea
          placeholder="Write a comment… type @ to mention (Ctrl+Enter to submit)"
          value={text}
          onChange={setText}
          onSubmit={() => handleSubmit()}
          rows={3}
          data-testid="input-comment"
          excludeUserIds={currentUserId ? [currentUserId] : []}
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={submitting || !text.trim()}
            data-testid="button-submit-comment"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-1.5" />
            )}
            Post Comment
          </Button>
        </div>
      </div>

      {/* ── Comment feed ── */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : topLevel.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {topLevel.map((comment) => {
            const replies = repliesFor(comment.id);
            const isReplying = replyingTo?.id === comment.id;

            return (
              <div key={comment.id} className="space-y-0">
                {/* Top-level comment */}
                <CommentBubble
                  comment={comment}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  isAdmin={isAdmin}
                  projectId={projectId}
                  onReply={setReplyingTo}
                  onDelete={deleteComment}
                  submitting={submitting}
                />

                {/* Existing replies */}
                {replies.map((reply) => (
                  <CommentBubble
                    key={reply.id}
                    comment={reply}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    isAdmin={isAdmin}
                    projectId={projectId}
                    isReply
                    onReply={setReplyingTo}
                    onDelete={deleteComment}
                    submitting={submitting}
                  />
                ))}

                {/* Inline reply composer */}
                {isReplying && (
                  <div className="ml-8 mt-2 space-y-2 border-l-2 border-primary/20 pl-4">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CornerDownRight className="h-3 w-3" />
                      Replying to <span className="font-medium text-foreground">{comment.author_name}</span>
                      <button
                        className="ml-auto hover:text-destructive transition-colors"
                        onClick={() => { setReplyingTo(null); setReplyText(''); }}
                        aria-label="Cancel reply"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <MentionTextarea
                      placeholder={`Reply to ${comment.author_name}… type @ to mention`}
                      value={replyText}
                      onChange={setReplyText}
                      onSubmit={() => handleReplySubmit()}
                      rows={2}
                      data-testid={`input-reply-${comment.id}`}
                      excludeUserIds={currentUserId ? [currentUserId] : []}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => { setReplyingTo(null); setReplyText(''); }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleReplySubmit}
                        disabled={submitting || !replyText.trim()}
                        data-testid={`button-submit-reply-${comment.id}`}
                      >
                        {submitting ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                          <Send className="h-3 w-3 mr-1" />
                        )}
                        Reply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectCommentsPanel;
