import { useState } from 'react';
import { UserPlus, X, Loader2, Users, CheckCircle2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStageAssignees } from '@/hooks/useStageData';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Props {
  projectId: string;
  stageId: string;
  stageLabel?: string;
  projectName?: string;
  currentUserId?: string;
  assignedByName?: string;
  canEdit: boolean;
}

function useProfileSearch(query: string) {
  return useQuery({
    queryKey: ['profile_search', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('status', 'approved')
        .ilike('full_name', `%${query}%`)
        .limit(8);
      return data ?? [];
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

async function sendAssignmentNotification(
  assigneeId: string,
  assigneeName: string,
  stageLabel: string,
  projectName: string,
  projectId: string,
  assignedByName: string,
) {
  const titleEn = `You've been assigned to a stage`;
  const titleAr = `تم تعيينك في مرحلة`;
  const msgEn = `${assignedByName} assigned you to "${stageLabel}" in project "${projectName}"`;
  const msgAr = `قام ${assignedByName} بتعيينك في "${stageLabel}" في مشروع "${projectName}"`;

  // Route through the central dispatcher so the notification is delivered
  // in-app + email + WhatsApp (subject to per-user opt-in preferences),
  // matching how task assignments are delivered. The dispatcher inserts
  // the notifications row itself — do NOT also insert here, or the
  // recipient's bell will show duplicates. The metadata keys
  // (recipient_name / project_name / stage / actor) line up with the
  // pact_status_update WhatsApp template registered for
  // `project_stage_assigned` in send-whatsapp/index.ts.
  await supabase.functions.invoke('dispatch-notification', {
    body: {
      event_type: 'project_stage_assigned',
      entity_type: 'project',
      entity_id: projectId,
      priority: 'high',
      recipient_ids: [assigneeId],
      title_en: titleEn,
      title_ar: titleAr,
      message_en: msgEn,
      message_ar: msgAr,
      action_url: `/projects/${projectId}`,
      send_email: true,
      metadata: {
        recipient_name: assigneeName,
        project_name: projectName,
        stage: stageLabel,
        actor: assignedByName,
      },
    },
  });
}

export function StageAssignees({
  projectId, stageId, stageLabel = 'Stage', projectName = 'Project',
  currentUserId, assignedByName = 'A manager', canEdit,
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { assignees, addAssignee, removeAssignee, acknowledgeAssignment, isAdding, isRemoving, isAcknowledging } =
    useStageAssignees(projectId, stageId);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: searchResults = [] } = useProfileSearch(search);

  const handleAdd = async (userId: string, userName: string) => {
    if (assignees.some(a => a.userId === userId)) {
      toast({ title: 'Already assigned', variant: 'destructive' });
      return;
    }
    try {
      await addAssignee(userId);
      qc.invalidateQueries({ queryKey: ['all_stage_assignees', projectId] });
      if (userId !== currentUserId) {
        sendAssignmentNotification(
          userId, userName, stageLabel, projectName, projectId, assignedByName,
        ).catch(() => {});
      }
      toast({ title: `${userName} assigned to "${stageLabel}"` });
      setSearch('');
      setOpen(false);
    } catch {
      toast({ title: 'Failed to add assignee', variant: 'destructive' });
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeAssignee(id);
      qc.invalidateQueries({ queryKey: ['all_stage_assignees', projectId] });
    } catch {
      toast({ title: 'Failed to remove assignee', variant: 'destructive' });
    }
  };

  const handleAcknowledge = async (assigneeId: string) => {
    if (!currentUserId) return;
    try {
      await acknowledgeAssignment(assigneeId, currentUserId);
      toast({ title: 'Stage assignment acknowledged', description: `You confirmed your assignment to "${stageLabel}"` });
    } catch {
      toast({ title: 'Failed to acknowledge', variant: 'destructive' });
    }
  };

  const myAssignment = assignees.find(a => a.userId === currentUserId);
  const myNeedsAck = myAssignment && !myAssignment.acknowledgedAt;
  const ackCount = assignees.filter(a => a.acknowledgedAt).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <Users className="h-3.5 w-3.5" />
          Assignees
          {assignees.length > 0 && (
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
              {assignees.length}
            </Badge>
          )}
          {assignees.length > 0 && (
            <span
              className={cn(
                'text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-0.5',
                ackCount === assignees.length
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
              )}
            >
              {ackCount}/{assignees.length} confirmed
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {myNeedsAck && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-xs px-2 border-amber-400 text-amber-700 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400"
              onClick={() => handleAcknowledge(myAssignment!.id)}
              disabled={isAcknowledging}
              data-testid="button-acknowledge-stage"
            >
              {isAcknowledging ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
              Acknowledge
            </Button>
          )}
          {canEdit && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                  <UserPlus className="h-3 w-3 mr-1" /> Assign
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2" align="end">
                <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
                  Assign to "{stageLabel}"
                </p>
                <Input
                  placeholder="Search staff by name..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="h-8 text-sm mb-2"
                  autoFocus
                />
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {searchResults.length === 0 && search.length >= 2 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">No results</p>
                  )}
                  {search.length < 2 && (
                    <p className="text-[10px] text-muted-foreground px-2 py-1">Type at least 2 characters…</p>
                  )}
                  {searchResults.map((p: any) => {
                    const alreadyAssigned = assignees.some(a => a.userId === p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`w-full flex items-center gap-2 text-left px-2 py-1.5 rounded text-sm ${alreadyAssigned ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted'}`}
                        onClick={() => !alreadyAssigned && handleAdd(p.id, p.full_name)}
                        disabled={isAdding || alreadyAssigned}
                      >
                        <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {p.full_name?.charAt(0) ?? '?'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{p.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate capitalize">{p.role?.replace(/_/g, ' ')}</p>
                        </div>
                        {alreadyAssigned && (
                          <span className="text-[9px] text-emerald-600 font-medium flex-shrink-0">✓ Assigned</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {assignees.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No assignees — click Assign to add team members</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map(a => {
            const isMe = a.userId === currentUserId;
            const isAcked = !!a.acknowledgedAt;
            return (
              <div
                key={a.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full pl-1 pr-2 py-0.5 border',
                  isAcked
                    ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700'
                    : isMe
                    ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700'
                    : 'bg-muted border-transparent',
                )}
                title={`${a.fullName} · ${a.role?.replace(/_/g, ' ')}${isAcked ? ` · Confirmed ${format(new Date(a.acknowledgedAt!), 'dd MMM yyyy')}` : ' · Pending confirmation'}`}
              >
                <div className={cn(
                  'h-5 w-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold',
                  isAcked ? 'bg-emerald-600' : 'bg-[#1D3461]',
                )}>
                  {a.fullName.charAt(0)}
                </div>
                <span className="text-xs font-medium">{a.fullName}</span>
                {isAcked ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" title={`Confirmed ${format(new Date(a.acknowledgedAt!), 'dd MMM')}`} />
                ) : (
                  <Clock className="h-3 w-3 text-amber-500 flex-shrink-0" title="Pending confirmation" />
                )}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    disabled={isRemoving}
                    className="text-muted-foreground hover:text-destructive ml-0.5"
                    title="Remove assignee"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
