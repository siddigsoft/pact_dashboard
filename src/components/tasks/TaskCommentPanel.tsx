import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Send, MessageSquare, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface Comment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
  user_avatar?: string;
}

interface TaskCommentPanelProps {
  taskId: string;
  compact?: boolean;
}

export function TaskCommentPanel({ taskId, compact = false }: TaskCommentPanelProps) {
  const { currentUser } = useUser();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [userMap, setUserMap] = useState<Record<string, { name: string; avatar?: string }>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!taskId) return;
    fetchComments();

    const channel = supabase
      .channel(`task_comments_${taskId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` }, () => {
        fetchComments();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [taskId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  async function fetchComments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const comments = data ?? [];
      setComments(comments);

      // Load user profiles
      const userIds = [...new Set(comments.map((c: Comment) => c.user_id))];
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', userIds);
        const map: Record<string, { name: string; avatar?: string }> = {};
        (profiles ?? []).forEach((p: any) => {
          map[p.id] = { name: p.full_name ?? 'Unknown', avatar: p.avatar_url ?? undefined };
        });
        setUserMap(map);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!text.trim() || !currentUser?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('task_comments').insert({
        task_id: taskId,
        user_id: currentUser.id,
        content: text.trim(),
      });
      if (!error) setText('');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await supabase.from('task_comments').delete().eq('id', id).eq('user_id', currentUser?.id ?? '');
    setComments(p => p.filter(c => c.id !== id));
  }

  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const avatarColor = (id: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500'];
    return colors[id.charCodeAt(0) % colors.length];
  };

  return (
    <div className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Comments {comments.length > 0 && `(${comments.length})`}
        </span>
      </div>

      {/* Comment list */}
      <div className={cn('flex flex-col gap-2 overflow-y-auto', compact ? 'max-h-48' : 'max-h-64')}>
        {loading ? (
          <div className="py-6 flex justify-center">
            <Loader2 className="h-4 w-4 animate-spin opacity-30" />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">
            No comments yet. Be the first to add one.
          </div>
        ) : (
          comments.map(c => {
            const user = userMap[c.user_id];
            const isMine = c.user_id === currentUser?.id;
            return (
              <div key={c.id} className={cn('flex gap-2 group', isMine ? 'flex-row-reverse' : 'flex-row')}>
                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.name} className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <AvatarFallback className={cn('text-[10px] font-bold text-white', avatarColor(c.user_id))}>
                      {initials(user?.name ?? '?')}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className={cn('flex flex-col gap-0.5 max-w-[80%]', isMine ? 'items-end' : 'items-start')}>
                  <div className={cn(
                    'px-3 py-2 rounded-2xl text-xs leading-relaxed',
                    isMine
                      ? 'bg-[#0F2041] text-white rounded-tr-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-foreground rounded-tl-sm'
                  )}>
                    {c.content}
                  </div>
                  <div className={cn('flex items-center gap-1', isMine ? 'flex-row-reverse' : 'flex-row')}>
                    <span className="text-[10px] text-muted-foreground">
                      {user?.name ?? 'Unknown'} · {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                    {isMine && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-destructive"
                        title="Delete comment"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end">
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          className="resize-none text-xs flex-1"
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
          data-testid="input-task-comment"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!text.trim() || saving}
          className="bg-[#0F2041] hover:bg-[#1D3461] h-9 px-3"
          data-testid="btn-send-comment"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground">Ctrl+Enter to send</p>
    </div>
  );
}
