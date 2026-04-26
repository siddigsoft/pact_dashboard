import { useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { MessageCircle, Send, Trash2, Loader2 } from 'lucide-react';
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
import { useProjectComments } from '@/hooks/useProjectComments';
import { MentionTextarea, extractMentionIds } from '@/components/mentions/MentionTextarea';
import { MentionRenderer } from '@/components/mentions/MentionRenderer';
import { dispatchNotification } from '@/lib/notify';

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

const ProjectCommentsPanel: React.FC<ProjectCommentsPanelProps> = ({
  projectId,
  currentUserId,
  currentUserName,
  isAdmin,
}) => {
  const { comments, loading, submitting, addComment, deleteComment } = useProjectComments(projectId);
  const [text, setText] = useState('');

  const handleSubmit = async () => {
    if (!text.trim()) return;
    const trimmed = text.trim();
    const ok = await addComment(trimmed, currentUserId, currentUserName);
    if (ok) {
      setText('');
      const mentionIds = extractMentionIds(trimmed).filter((id) => id !== currentUserId);
      if (mentionIds.length > 0) {
        const authorName = currentUserName ?? 'A teammate';
        const preview = trimmed.replace(/@\[([^\]]+)\]\([a-f0-9\-]+\)/g, '@$1').slice(0, 140);
        dispatchNotification({
          event: 'comment_mention',
          recipientIds: mentionIds,
          titleEn: `${authorName} mentioned you in a project comment`,
          titleAr: `${authorName} أشار إليك في تعليق على المشروع`,
          messageEn: preview,
          messageAr: preview,
          priority: 'normal',
          entityType: 'project',
          entityId: projectId,
          actionUrl: `/projects/${projectId}`,
          triggeredBy: currentUserId,
          triggeredByName: authorName,
        });
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Input */}
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

      {/* Feed */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-10 border border-dashed rounded-lg">
          <MessageCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">No comments yet. Be the first to comment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const canDelete = isAdmin || comment.author_id === currentUserId;
            const name = comment.author_name ?? 'Unknown';
            const relTime = (() => {
              try {
                return formatDistanceToNow(parseISO(comment.created_at), { addSuffix: true });
              } catch {
                return '';
              }
            })();

            return (
              <div
                key={comment.id}
                className="flex gap-3 group"
                data-testid={`comment-row-${comment.id}`}
              >
                <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                  <AvatarFallback className="text-xs bg-[#1D3461]/10 text-[#1D3461] dark:bg-[#1D3461]/30 dark:text-blue-300">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium">{name}</span>
                    <span className="text-xs text-muted-foreground">{relTime}</span>
                  </div>
                  <p className="text-sm mt-0.5">
                    <MentionRenderer content={comment.content} currentUserId={currentUserId} />
                  </p>
                </div>
                {canDelete && (
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
                        <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deleteComment(comment.id)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
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
