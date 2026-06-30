import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useToast } from '@/hooks/use-toast';
import {
  MessageSquare, Flag, FileEdit, Search, Filter, CheckCheck,
  CornerDownRight, AtSign, Download, ChevronDown, ChevronRight,
  MoreHorizontal, Trash2, Check, X, GitCompare, Send, AlertTriangle,
  Star, Zap, Eye, Users, Clock, Plus, RefreshCw, Tag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type TabId = 'comments' | 'flags' | 'review';

// ── Flag types ───────────────────────────────────────────────────────────────
const FLAG_TYPES = [
  { value: 'suspicious',        label: 'Suspicious',       icon: AlertTriangle, color: 'text-red-600    bg-red-50    border-red-200'    },
  { value: 'needs_correction',  label: 'Needs Correction', icon: FileEdit,      color: 'text-amber-600  bg-amber-50  border-amber-200'  },
  { value: 'priority',          label: 'Priority',         icon: Zap,           color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { value: 'interesting',       label: 'Interesting',      icon: Star,          color: 'text-blue-600   bg-blue-50   border-blue-200'   },
] as const;
type FlagType = typeof FLAG_TYPES[number]['value'];

const FLAG_MAP = Object.fromEntries(FLAG_TYPES.map(f => [f.value, f]));

// ── Helpers ──────────────────────────────────────────────────────────────────
function ago(ts: string) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function initials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: Submission Comments
// ─────────────────────────────────────────────────────────────────────────────
function SubmissionCommentsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFormId, setSelectedFormId] = useState('');
  const [selectedSubId, setSelectedSubId]   = useState('');
  const [searchQ, setSearchQ]               = useState('');
  const [showResolved, setShowResolved]     = useState(false);
  const [replyingTo, setReplyingTo]         = useState<string | null>(null);
  const [draft, setDraft]                   = useState('');
  const [replyDraft, setReplyDraft]         = useState('');
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const textRef = useRef<HTMLTextAreaElement>(null);

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-collab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: submissions = [] } = useQuery<{ id: string; submitted_at: string }[]>({
    queryKey: ['fd-submissions-list', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_submissions')
        .select('id, submitted_at')
        .eq('form_id', selectedFormId)
        .order('submitted_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: comments = [], isLoading: commentsLoading } = useQuery<any[]>({
    queryKey: ['fd-submission-comments', selectedSubId, showResolved],
    enabled: !!selectedSubId,
    queryFn: async () => {
      let q = supabase
        .from('fd_submission_comments')
        .select('*, replies:fd_submission_comments(id, body, author_name, created_at, is_resolved, parent_id)')
        .eq('submission_id', selectedSubId)
        .is('parent_id', null)
        .order('created_at');
      if (!showResolved) q = q.eq('is_resolved', false);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const addComment = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string }) => {
      const { error } = await supabase.from('fd_submission_comments').insert({
        submission_id: selectedSubId,
        form_id: selectedFormId,
        body,
        parent_id: parentId ?? null,
        author_id: user?.id,
        author_name: user?.user_metadata?.full_name ?? user?.email ?? 'Unknown',
        is_resolved: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-submission-comments', selectedSubId] });
      setDraft(''); setReplyDraft(''); setReplyingTo(null);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resolveComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fd_submission_comments')
        .update({ is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-submission-comments', selectedSubId] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const exportComments = async () => {
    if (!comments.length) return;
    const rows = [['Author', 'Comment', 'Thread', 'Date', 'Resolved']];
    for (const c of comments) {
      rows.push([c.author_name, c.body, 'Root', new Date(c.created_at).toLocaleString(), c.is_resolved ? 'Yes' : 'No']);
      for (const r of (c.replies ?? [])) {
        rows.push([r.author_name, r.body, 'Reply', new Date(r.created_at).toLocaleString(), r.is_resolved ? 'Yes' : 'No']);
      }
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `comments-${selectedSubId.slice(0, 8)}.csv`;
    a.click();
  };

  const filteredComments = comments.filter(c =>
    !searchQ || c.body.toLowerCase().includes(searchQ.toLowerCase()) || c.author_name.toLowerCase().includes(searchQ.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Selectors */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedFormId} onValueChange={v => { setSelectedFormId(v); setSelectedSubId(''); }}>
          <SelectTrigger className="w-56" data-testid="select-form-comments">
            <SelectValue placeholder="Select form…" />
          </SelectTrigger>
          <SelectContent>
            {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedSubId} onValueChange={setSelectedSubId} disabled={!selectedFormId}>
          <SelectTrigger className="w-56" data-testid="select-submission-comments">
            <SelectValue placeholder="Select submission…" />
          </SelectTrigger>
          <SelectContent>
            {submissions.map(s => (
              <SelectItem key={s.id} value={s.id}>
                #{s.id.slice(0, 8)} — {new Date(s.submitted_at).toLocaleDateString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search comments…" className="pl-8" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowResolved(p => !p)} data-testid="toggle-resolved">
          <Eye className="h-4 w-4 mr-1" />
          {showResolved ? 'Hide Resolved' : 'Show Resolved'}
        </Button>
        {comments.length > 0 && (
          <Button variant="outline" size="sm" onClick={exportComments} data-testid="export-comments">
            <Download className="h-4 w-4 mr-1" /> Export Log
          </Button>
        )}
      </div>

      {/* Comment composer */}
      {selectedSubId && (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <MessageSquare className="h-4 w-4 text-primary" />
            Add Comment
            <span className="text-xs text-muted-foreground ml-1">Use @name to mention a colleague</span>
          </p>
          <Textarea
            ref={textRef}
            placeholder="Write your comment… (@mention someone)"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            data-testid="input-new-comment"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" disabled={!draft.trim() || addComment.isPending}
              onClick={() => addComment.mutate({ body: draft })}
              data-testid="btn-submit-comment">
              <Send className="h-4 w-4 mr-1" />
              {addComment.isPending ? 'Posting…' : 'Post Comment'}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!selectedSubId && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <MessageSquare className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select a form and submission to view comment threads</p>
        </div>
      )}

      {/* Threads */}
      {selectedSubId && commentsLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading comments…
        </div>
      )}

      {selectedSubId && !commentsLoading && filteredComments.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No {showResolved ? '' : 'open'} comments on this submission.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {filteredComments.map(c => {
          const expanded = expandedThreads.has(c.id);
          const replies: any[] = c.replies ?? [];
          return (
            <div key={c.id}
              className={cn('rounded-lg border bg-card p-4 flex flex-col gap-2 transition-opacity',
                c.is_resolved && 'opacity-60')}
              data-testid={`comment-thread-${c.id}`}>
              {/* Root comment */}
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {initials(c.author_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.author_name}</span>
                    <span className="text-xs text-muted-foreground">{ago(c.created_at)}</span>
                    {c.is_resolved && <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Resolved</Badge>}
                  </div>
                  <p className="text-sm mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {!c.is_resolved && (
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => resolveComment.mutate(c.id)}
                      title="Mark resolved" data-testid={`btn-resolve-${c.id}`}>
                      <CheckCheck className="h-4 w-4 text-green-600" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                    title="Reply" data-testid={`btn-reply-${c.id}`}>
                    <CornerDownRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Reply composer */}
              {replyingTo === c.id && (
                <div className="ml-11 flex flex-col gap-2 pt-1">
                  <Textarea
                    placeholder="Write a reply…"
                    value={replyDraft}
                    onChange={e => setReplyDraft(e.target.value)}
                    rows={2}
                    data-testid={`input-reply-${c.id}`}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!replyDraft.trim() || addComment.isPending}
                      onClick={() => addComment.mutate({ body: replyDraft, parentId: c.id })}
                      data-testid={`btn-submit-reply-${c.id}`}>
                      <Send className="h-3 w-3 mr-1" /> Reply
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setReplyingTo(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Replies */}
              {replies.length > 0 && (
                <div className="ml-11">
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
                    onClick={() => setExpandedThreads(p => {
                      const n = new Set(p);
                      n.has(c.id) ? n.delete(c.id) : n.add(c.id);
                      return n;
                    })}
                    data-testid={`toggle-replies-${c.id}`}>
                    {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </button>
                  {expanded && (
                    <div className="flex flex-col gap-2 border-l-2 border-muted pl-3">
                      {replies.map((r: any) => (
                        <div key={r.id} className="flex items-start gap-2">
                          <Avatar className="h-6 w-6 flex-shrink-0">
                            <AvatarFallback className="text-[10px] bg-muted">{initials(r.author_name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-xs">{r.author_name}</span>
                              <span className="text-[10px] text-muted-foreground">{ago(r.created_at)}</span>
                            </div>
                            <p className="text-xs mt-0.5 whitespace-pre-wrap">{r.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Submission Flags
// ─────────────────────────────────────────────────────────────────────────────
function SubmissionFlagsTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFormId, setSelectedFormId] = useState('');
  const [filterFlag, setFilterFlag]         = useState<FlagType | 'all'>('all');
  const [searchQ, setSearchQ]               = useState('');
  const [selected, setSelected]             = useState<Set<string>>(new Set());
  const [bulkFlagType, setBulkFlagType]     = useState<FlagType>('suspicious');

  const { data: forms = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['fd-forms-collab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: submissions = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-submissions-flags', selectedFormId, filterFlag],
    enabled: !!selectedFormId,
    queryFn: async () => {
      let q = supabase
        .from('fd_submissions')
        .select('id, submitted_at, data, fd_submission_flags(id, flag_type, flagged_by_name, note, created_at)')
        .eq('form_id', selectedFormId)
        .order('submitted_at', { ascending: false })
        .limit(200);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).filter(s => {
        if (filterFlag === 'all') return true;
        return (s.fd_submission_flags ?? []).some((f: any) => f.flag_type === filterFlag);
      });
    },
  });

  const addFlag = useMutation({
    mutationFn: async ({ submissionId, flagType, note }: { submissionId: string; flagType: FlagType; note?: string }) => {
      const { error } = await supabase.from('fd_submission_flags').insert({
        submission_id: submissionId,
        form_id: selectedFormId,
        flag_type: flagType,
        flagged_by: user?.id,
        flagged_by_name: user?.user_metadata?.full_name ?? user?.email ?? 'Unknown',
        note: note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-submissions-flags', selectedFormId] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const removeFlag = useMutation({
    mutationFn: async (flagId: string) => {
      const { error } = await supabase.from('fd_submission_flags').delete().eq('id', flagId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-submissions-flags', selectedFormId] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const bulkFlag = useMutation({
    mutationFn: async () => {
      const rows = [...selected].map(sid => ({
        submission_id: sid,
        form_id: selectedFormId,
        flag_type: bulkFlagType,
        flagged_by: user?.id,
        flagged_by_name: user?.user_metadata?.full_name ?? user?.email ?? 'Unknown',
      }));
      const { error } = await supabase.from('fd_submission_flags').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-submissions-flags', selectedFormId] });
      setSelected(new Set());
      toast({ title: `${selected.size} submission(s) flagged as ${bulkFlagType}` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const bulkUnflag = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('fd_submission_flags')
        .delete()
        .in('submission_id', [...selected]);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-submissions-flags', selectedFormId] });
      setSelected(new Set());
      toast({ title: `Flags removed from ${selected.size} submission(s)` });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const filtered = submissions.filter(s =>
    !searchQ || s.id.includes(searchQ) ||
    (s.fd_submission_flags ?? []).some((f: any) => f.note?.toLowerCase().includes(searchQ.toLowerCase()))
  );

  const allChecked = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(filtered.map(s => s.id)));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedFormId} onValueChange={v => { setSelectedFormId(v); setSelected(new Set()); }}>
          <SelectTrigger className="w-56" data-testid="select-form-flags">
            <SelectValue placeholder="Select form…" />
          </SelectTrigger>
          <SelectContent>
            {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Tabs value={filterFlag} onValueChange={v => setFilterFlag(v as any)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            {FLAG_TYPES.map(ft => (
              <TabsTrigger key={ft.value} value={ft.value}>
                <ft.icon className="h-3 w-3 mr-1" /> {ft.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search…" className="pl-8" value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </div>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <Select value={bulkFlagType} onValueChange={v => setBulkFlagType(v as FlagType)}>
            <SelectTrigger className="w-40 h-8" data-testid="select-bulk-flag-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FLAG_TYPES.map(ft => <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => bulkFlag.mutate()} disabled={bulkFlag.isPending}
            data-testid="btn-bulk-flag">
            <Flag className="h-4 w-4 mr-1" /> Flag All
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkUnflag.mutate()} disabled={bulkUnflag.isPending}
            data-testid="btn-bulk-unflag">
            <X className="h-4 w-4 mr-1" /> Remove Flags
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Cancel</Button>
        </div>
      )}

      {!selectedFormId && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <Flag className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select a form to flag submissions</p>
        </div>
      )}

      {selectedFormId && isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading submissions…
        </div>
      )}

      {selectedFormId && !isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No submissions found.
        </div>
      )}

      {selectedFormId && !isLoading && filtered.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="p-3 text-left w-8">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll}
                    className="rounded" data-testid="checkbox-select-all" />
                </th>
                <th className="p-3 text-left">Submission ID</th>
                <th className="p-3 text-left">Submitted</th>
                <th className="p-3 text-left">Flags</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => {
                const flags: any[] = s.fd_submission_flags ?? [];
                return (
                  <tr key={s.id}
                    className={cn('border-b last:border-0 hover:bg-muted/30', i % 2 === 0 && 'bg-background')}
                    data-testid={`flag-row-${s.id}`}>
                    <td className="p-3">
                      <input type="checkbox" checked={selected.has(s.id)}
                        onChange={() => setSelected(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                        className="rounded" data-testid={`checkbox-${s.id}`} />
                    </td>
                    <td className="p-3 font-mono text-xs">{s.id.slice(0, 12)}…</td>
                    <td className="p-3 text-muted-foreground">{new Date(s.submitted_at).toLocaleDateString()}</td>
                    <td className="p-3">
                      {flags.length === 0
                        ? <span className="text-muted-foreground text-xs">—</span>
                        : (
                          <div className="flex flex-wrap gap-1">
                            {flags.map((f: any) => {
                              const ft = FLAG_MAP[f.flag_type];
                              if (!ft) return null;
                              const FIcon = ft.icon;
                              return (
                                <span key={f.id}
                                  className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium', ft.color)}
                                  title={f.note ?? ''}>
                                  <FIcon className="h-3 w-3" /> {ft.label}
                                  <button onClick={() => removeFlag.mutate(f.id)}
                                    className="ml-0.5 opacity-60 hover:opacity-100"
                                    data-testid={`remove-flag-${f.id}`}>
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                    </td>
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            data-testid={`flag-menu-${s.id}`}>
                            <Flag className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {FLAG_TYPES.map(ft => (
                            <DropdownMenuItem key={ft.value}
                              onClick={() => addFlag.mutate({ submissionId: s.id, flagType: ft.value })}
                              data-testid={`flag-as-${ft.value}-${s.id}`}>
                              <ft.icon className="h-4 w-4 mr-2" />
                              Flag as {ft.label}
                            </DropdownMenuItem>
                          ))}
                          {flags.length > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive"
                                onClick={() => flags.forEach(f => removeFlag.mutate(f.id))}
                                data-testid={`remove-all-flags-${s.id}`}>
                                <X className="h-4 w-4 mr-2" /> Remove All Flags
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: Form Draft Review
// ─────────────────────────────────────────────────────────────────────────────
type ReviewStatus = 'open' | 'resolved' | 'all';

function FormDraftReviewTab() {
  const { user } = useUser();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedFormId, setSelectedFormId] = useState('');
  const [reviewFilter, setReviewFilter]     = useState<ReviewStatus>('open');
  const [newFieldKey, setNewFieldKey]       = useState('');
  const [newComment, setNewComment]         = useState('');
  const [compareMode, setCompareMode]       = useState(false);
  const [compareVersion, setCompareVersion] = useState('');

  const { data: forms = [] } = useQuery<{ id: string; name: string; version?: number }[]>({
    queryKey: ['fd-forms-collab'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fd_forms').select('id, name, version').order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedForm = forms.find(f => f.id === selectedFormId);

  const { data: reviewComments = [], isLoading } = useQuery<any[]>({
    queryKey: ['fd-review-comments', selectedFormId, reviewFilter],
    enabled: !!selectedFormId,
    queryFn: async () => {
      let q = supabase
        .from('fd_form_review_comments')
        .select('*')
        .eq('form_id', selectedFormId)
        .order('field_key')
        .order('created_at');
      if (reviewFilter === 'open') q = q.eq('is_resolved', false);
      if (reviewFilter === 'resolved') q = q.eq('is_resolved', true);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: formSchema = [] } = useQuery<any[]>({
    queryKey: ['fd-schema-collab', selectedFormId],
    enabled: !!selectedFormId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fd_form_schema')
        .select('field_key, label, field_type, version')
        .eq('form_id', selectedFormId)
        .order('position');
      if (error) throw error;
      return data ?? [];
    },
  });

  const addReviewComment = useMutation({
    mutationFn: async () => {
      if (!newFieldKey || !newComment.trim()) throw new Error('Field and comment required');
      const { error } = await supabase.from('fd_form_review_comments').insert({
        form_id: selectedFormId,
        field_key: newFieldKey,
        body: newComment.trim(),
        reviewer_id: user?.id,
        reviewer_name: user?.user_metadata?.full_name ?? user?.email ?? 'Unknown',
        is_resolved: false,
        form_version: selectedForm?.version ?? 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fd-review-comments', selectedFormId] });
      setNewFieldKey(''); setNewComment('');
      toast({ title: 'Review comment added' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const resolveReviewComment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fd_form_review_comments')
        .update({ is_resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fd-review-comments', selectedFormId] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  // Group comments by field_key
  const grouped = reviewComments.reduce<Record<string, any[]>>((acc, c) => {
    if (!acc[c.field_key]) acc[c.field_key] = [];
    acc[c.field_key].push(c);
    return acc;
  }, {});

  // Version comparison: show fields that changed between versions
  const versions = [...new Set(formSchema.map(f => f.version).filter(Boolean))].sort((a, b) => b - a);
  const compareVersionNum = parseInt(compareVersion, 10);
  const currentVersionFields = formSchema.filter(f => !f.version || f.version === Math.max(...versions.map(Number)));
  const compareVersionFields = formSchema.filter(f => f.version === compareVersionNum);

  const openCount  = reviewComments.filter(c => !c.is_resolved).length;
  const resolvedCount = reviewComments.filter(c => c.is_resolved).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <Select value={selectedFormId} onValueChange={setSelectedFormId}>
          <SelectTrigger className="w-64" data-testid="select-form-review">
            <SelectValue placeholder="Select form draft…" />
          </SelectTrigger>
          <SelectContent>
            {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {selectedFormId && (
          <>
            <Tabs value={reviewFilter} onValueChange={v => setReviewFilter(v as ReviewStatus)}>
              <TabsList>
                <TabsTrigger value="open">Open ({openCount})</TabsTrigger>
                <TabsTrigger value="resolved">Resolved ({resolvedCount})</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm"
              onClick={() => setCompareMode(p => !p)}
              data-testid="btn-toggle-compare">
              <GitCompare className="h-4 w-4 mr-1" />
              {compareMode ? 'Exit Compare' : 'Compare Versions'}
            </Button>
          </>
        )}
      </div>

      {!selectedFormId && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
          <FileEdit className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select a form draft to review</p>
        </div>
      )}

      {/* Version compare panel */}
      {selectedFormId && compareMode && (
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/10 border-amber-200 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm flex items-center gap-2">
              <GitCompare className="h-4 w-4 text-amber-600" />
              Version Comparison
            </p>
            <Select value={compareVersion} onValueChange={setCompareVersion}>
              <SelectTrigger className="w-36 h-8" data-testid="select-compare-version">
                <SelectValue placeholder="Compare to…" />
              </SelectTrigger>
              <SelectContent>
                {versions.map(v => <SelectItem key={v} value={String(v)}>Version {v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {compareVersion && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">CURRENT VERSION</p>
                {currentVersionFields.map(f => (
                  <div key={f.field_key} className="text-xs py-1 border-b border-muted last:border-0">
                    <span className="font-mono text-muted-foreground">{f.field_key}</span>
                    <span className="mx-2">—</span>
                    <span>{f.label}</span>
                    <Badge variant="outline" className="ml-2 text-[10px]">{f.field_type}</Badge>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">VERSION {compareVersionNum}</p>
                {compareVersionFields.length === 0
                  ? <p className="text-xs text-muted-foreground">No schema data for this version</p>
                  : compareVersionFields.map(f => (
                    <div key={f.field_key} className="text-xs py-1 border-b border-muted last:border-0">
                      <span className="font-mono text-muted-foreground">{f.field_key}</span>
                      <span className="mx-2">—</span>
                      <span>{f.label}</span>
                      <Badge variant="outline" className="ml-2 text-[10px]">{f.field_type}</Badge>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add review comment */}
      {selectedFormId && !compareMode && (
        <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Plus className="h-4 w-4 text-primary" />
            Add Inline Review Comment
          </p>
          <div className="flex gap-3 flex-wrap">
            <Select value={newFieldKey} onValueChange={setNewFieldKey}>
              <SelectTrigger className="w-56" data-testid="select-field-for-review">
                <SelectValue placeholder="Question / field…" />
              </SelectTrigger>
              <SelectContent>
                {formSchema.map(f => (
                  <SelectItem key={f.field_key} value={f.field_key}>
                    <span className="font-mono text-xs text-muted-foreground mr-2">{f.field_key}</span>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 min-w-[220px]">
              <Textarea
                placeholder="Your review comment on this question…"
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                rows={2}
                data-testid="input-review-comment"
              />
            </div>
            <Button size="sm" className="self-end"
              disabled={!newFieldKey || !newComment.trim() || addReviewComment.isPending}
              onClick={() => addReviewComment.mutate()}
              data-testid="btn-submit-review-comment">
              <Send className="h-4 w-4 mr-1" />
              {addReviewComment.isPending ? 'Adding…' : 'Add Comment'}
            </Button>
          </div>
        </div>
      )}

      {/* Comments by field */}
      {selectedFormId && !isLoading && Object.keys(grouped).length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No {reviewFilter === 'all' ? '' : reviewFilter} review comments yet.
        </div>
      )}

      {selectedFormId && isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading review comments…
        </div>
      )}

      <div className="flex flex-col gap-4">
        {Object.entries(grouped).map(([fieldKey, fieldComments]) => {
          const schemaField = formSchema.find(f => f.field_key === fieldKey);
          const openOnes = fieldComments.filter(c => !c.is_resolved);
          return (
            <div key={fieldKey} className="rounded-lg border bg-card overflow-hidden"
              data-testid={`review-group-${fieldKey}`}>
              <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/40 border-b">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">{fieldKey}</span>
                {schemaField && (
                  <span className="text-sm font-medium">{schemaField.label}</span>
                )}
                {schemaField && (
                  <Badge variant="outline" className="text-xs">{schemaField.field_type}</Badge>
                )}
                <div className="ml-auto flex items-center gap-2">
                  {openOnes.length > 0 && (
                    <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200">
                      {openOnes.length} open
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col divide-y">
                {fieldComments.map(c => (
                  <div key={c.id} className={cn('flex items-start gap-3 px-4 py-3', c.is_resolved && 'opacity-60')}
                    data-testid={`review-comment-${c.id}`}>
                    <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                      <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                        {initials(c.reviewer_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{c.reviewer_name}</span>
                        <span className="text-xs text-muted-foreground">{ago(c.created_at)}</span>
                        {c.form_version && (
                          <Badge variant="outline" className="text-xs">v{c.form_version}</Badge>
                        )}
                        {c.is_resolved && (
                          <Badge variant="outline" className="text-xs text-green-700 border-green-300 bg-green-50">Resolved</Badge>
                        )}
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{c.body}</p>
                    </div>
                    {!c.is_resolved && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                        onClick={() => resolveReviewComment.mutate(c.id)}
                        title="Mark resolved"
                        data-testid={`btn-resolve-review-${c.id}`}>
                        <CheckCheck className="h-4 w-4 text-green-600" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
export default function FieldDataCollaboration() {
  const [tab, setTab] = useState<TabId>('comments');

  const TAB_CONFIG: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: 'comments', label: 'Submission Comments', icon: MessageSquare,
      desc: 'Threaded comments & @mentions on individual submissions' },
    { id: 'flags',    label: 'Submission Flags',    icon: Flag,
      desc: 'Flag suspicious, priority, or correction-needed submissions' },
    { id: 'review',   label: 'Form Draft Review',   icon: FileEdit,
      desc: 'Inline review comments on form questions before publishing' },
  ];

  const ActiveTab = tab === 'comments' ? SubmissionCommentsTab
                  : tab === 'flags'    ? SubmissionFlagsTab
                  : FormDraftReviewTab;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Collaboration &amp; Review
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Comment on submissions, flag data quality issues, and review form drafts before publishing.
        </p>
      </div>

      {/* Tab cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TAB_CONFIG.map(t => (
          <button key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'text-left rounded-xl border p-4 flex items-start gap-3 transition-all',
              tab === t.id
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border bg-card hover:border-primary/40 hover:bg-muted/30'
            )}
            data-testid={`tab-card-${t.id}`}>
            <div className={cn('rounded-lg p-2 flex-shrink-0',
              tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
              <t.icon className="h-5 w-5" />
            </div>
            <div>
              <p className={cn('font-semibold text-sm', tab === t.id && 'text-primary')}>{t.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div className="rounded-xl border bg-card p-5">
        <ActiveTab />
      </div>
    </div>
  );
}
