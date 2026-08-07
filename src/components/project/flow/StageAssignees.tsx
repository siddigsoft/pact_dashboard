import { useState } from 'react';
import { UserPlus, X, Loader2, Users, CheckCircle2, Clock, ArrowLeft, CalendarDays } from 'lucide-react';
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
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { workingDaysBetween, DEFAULT_WORKING_DAYS } from '@/utils/workingDays';

interface Props {
  projectId: string;
  stageId: string;
  stageLabel?: string;
  projectName?: string;
  currentUserId?: string;
  assignedByName?: string;
  canEdit: boolean;
  /** User IDs to notify (email + in-app) when an assignee clicks Acknowledge */
  notifyUserIds?: string[];
  /** Stage planned start — constrains assignee work-period start date */
  stageStart?: string | null;
  /** Stage planned end — constrains assignee work-period end date */
  stageEnd?: string | null;
  /** Project working-days calendar */
  workingDays?: number[];
  /** Project calendar exceptions */
  calendarExceptions?: string[];
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

function fmtShort(iso: string) {
  try { return format(parseISO(iso), 'd MMM'); } catch { return iso; }
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).map(n => n[0].toUpperCase()).slice(0, 2).join('');
}

export function StageAssignees({
  projectId, stageId, stageLabel = 'Stage', projectName = 'Project',
  currentUserId, assignedByName = 'A manager', canEdit, notifyUserIds = [],
  stageStart, stageEnd, workingDays = DEFAULT_WORKING_DAYS, calendarExceptions = [],
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { assignees, addAssignee, removeAssignee, acknowledgeAssignment, isAdding, isRemoving, isAcknowledging } =
    useStageAssignees(projectId, stageId);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [step, setStep] = useState<'search' | 'dates'>('search');
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [assignStart, setAssignStart] = useState('');
  const [assignEnd, setAssignEnd] = useState('');

  const { data: searchResults = [] } = useProfileSearch(search);

  const resetPopover = () => {
    setStep('search');
    setSelectedUser(null);
    setSearch('');
    setAssignStart('');
    setAssignEnd('');
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetPopover();
  };

  const handlePickUser = (userId: string, userName: string) => {
    if (assignees.some(a => a.userId === userId)) {
      toast({ title: 'Already assigned', variant: 'destructive' });
      return;
    }
    setSelectedUser({ id: userId, name: userName });
    setAssignStart(stageStart ?? '');
    setAssignEnd(stageEnd ?? '');
    setStep('dates');
  };

  const handleConfirmAdd = async () => {
    if (!selectedUser) return;
    try {
      await addAssignee(selectedUser.id, assignStart || null, assignEnd || null);
      qc.invalidateQueries({ queryKey: ['all_stage_assignees', projectId] });
      sendAssignmentNotification(
        selectedUser.id, selectedUser.name, stageLabel, projectName, projectId, assignedByName,
      ).catch(() => {});
      toast({ title: `${selectedUser.name} assigned to "${stageLabel}"` });
      setOpen(false);
      resetPopover();
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

      const recipients = notifyUserIds.filter(id => id !== currentUserId);
      if (recipients.length > 0) {
        const myName = myAssignment?.fullName ?? assignedByName;
        supabase.functions.invoke('dispatch-notification', {
          body: {
            event_type: 'project_stage_acknowledged',
            entity_type: 'project',
            entity_id: projectId,
            priority: 'normal',
            recipient_ids: recipients,
            title_en: `Stage assignment confirmed`,
            title_ar: `تم تأكيد التعيين`,
            message_en: `${myName} confirmed their assignment to "${stageLabel}" in project "${projectName}"`,
            message_ar: `قام ${myName} بتأكيد تعيينه في "${stageLabel}" في مشروع "${projectName}"`,
            action_url: `/projects/${projectId}`,
            send_email: true,
            metadata: { project_name: projectName, stage: stageLabel, actor: myName },
          },
        }).catch(() => {});
      }
    } catch {
      toast({ title: 'Failed to acknowledge', variant: 'destructive' });
    }
  };

  const myAssignment = assignees.find(a => a.userId === currentUserId);
  const myNeedsAck = myAssignment && !myAssignment.acknowledgedAt;
  const ackCount = assignees.filter(a => a.acknowledgedAt).length;

  // Live duration preview in date step
  const previewDays = assignStart && assignEnd
    ? workingDaysBetween(assignStart, assignEnd, workingDays, calendarExceptions)
    : null;

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
            <Popover open={open} onOpenChange={handleOpenChange}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
                  <UserPlus className="h-3 w-3 mr-1" /> Assign
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2 z-[200]" align="end">

                {/* Step 1: Search & select person */}
                {step === 'search' && (
                  <>
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
                            onClick={() => !alreadyAssigned && handlePickUser(p.id, p.full_name)}
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
                  </>
                )}

                {/* Step 2: Set work period */}
                {step === 'dates' && selectedUser && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStep('search')}
                        className="text-muted-foreground hover:text-foreground flex-shrink-0"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                          {selectedUser.name.charAt(0)}
                        </div>
                        <p className="text-sm font-semibold truncate">{selectedUser.name}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">
                        Work Period <span className="normal-case font-normal">(optional)</span>
                      </p>
                      {(stageStart || stageEnd) && (
                        <p className="text-[10px] text-muted-foreground px-0.5">
                          Stage: {stageStart ? fmtShort(stageStart) : '?'} → {stageEnd ? fmtShort(stageEnd) : '?'}
                        </p>
                      )}
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-7 font-medium text-right flex-shrink-0">Start</span>
                        <input
                          type="date"
                          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          value={assignStart}
                          min={stageStart ?? undefined}
                          max={(assignEnd || stageEnd) ?? undefined}
                          onChange={e => setAssignStart(e.target.value)}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="w-7 font-medium text-right flex-shrink-0">End</span>
                        <input
                          type="date"
                          className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          value={assignEnd}
                          min={(assignStart || stageStart) ?? undefined}
                          max={stageEnd ?? undefined}
                          onChange={e => setAssignEnd(e.target.value)}
                        />
                      </label>
                      {previewDays !== null && (
                        <p className="text-[10px] text-sky-600 dark:text-sky-400 px-0.5 flex items-center gap-1">
                          <CalendarDays className="h-2.5 w-2.5" />
                          {previewDays} working day{previewDays !== 1 ? 's' : ''} in this period
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={() => setStep('search')}
                      >
                        Back
                      </Button>
                      <Button
                        size="sm"
                        className="flex-1 h-8 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white"
                        onClick={handleConfirmAdd}
                        disabled={isAdding}
                      >
                        {isAdding ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Assign
                      </Button>
                    </div>
                  </div>
                )}
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
            const hasWorkPeriod = a.startDate || a.endDate;
            const periodWd = hasWorkPeriod
              ? workingDaysBetween(a.startDate, a.endDate, workingDays, calendarExceptions)
              : null;
            return (
              <div
                key={a.id}
                className={cn(
                  'flex flex-col rounded-xl pl-2 pr-2.5 py-1 border gap-0.5',
                  isAcked
                    ? 'bg-emerald-50 border-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-700'
                    : isMe
                    ? 'bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700'
                    : 'bg-muted border-transparent',
                )}
              >
                <div className="flex items-center gap-1.5">
                  <div className={cn(
                    'h-5 w-5 rounded-full text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                    isAcked ? 'bg-emerald-600' : 'bg-[#1D3461]',
                  )}>
                    {initials(a.fullName)}
                  </div>
                  <span className="text-xs font-medium">{a.fullName}</span>
                  {isAcked ? (
                    <CheckCircle2
                      className="h-3 w-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0"
                      title={`Confirmed ${format(new Date(a.acknowledgedAt!), 'dd MMM')}`}
                    />
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
                {/* Work period display */}
                {hasWorkPeriod && (
                  <div className="flex items-center gap-1 ml-6 flex-wrap">
                    {(a.startDate || a.endDate) && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <CalendarDays className="h-2.5 w-2.5" />
                        {a.startDate ? fmtShort(a.startDate) : '?'}
                        {a.startDate && a.endDate ? ' → ' : ''}
                        {a.endDate ? fmtShort(a.endDate) : ''}
                      </span>
                    )}
                    {periodWd !== null && (
                      <span className="text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded-full px-1.5 py-0 font-medium">
                        {periodWd} wd
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
