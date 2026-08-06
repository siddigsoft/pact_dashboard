import { useState } from 'react';
import {
  Plus, Trash2, CheckSquare, Square, Loader2, UserPlus, X, Check,
  CalendarDays, ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useStageChecklist } from '@/hooks/useStageData';
import { useProfilesByIds } from '@/hooks/useUserDirectory';
import { cn } from '@/lib/utils';
import { workingDaysBetween, DEFAULT_WORKING_DAYS } from '@/utils/workingDays';
import { format, parseISO } from 'date-fns';

interface Props {
  projectId: string;
  stageId: string;
  currentUserId?: string;
  /** Displayed name of the person doing the assigning — used in notifications */
  currentUserName?: string;
  canEdit: boolean;
  /** Pool of user IDs from the project team — shown in the assignee picker */
  teamUserIds?: string[];
  projectName?: string;
  stageName?: string;
  /** Stage planned start (constrains item dates) */
  stageStart?: string | null;
  /** Stage planned end (constrains item dates) */
  stageEnd?: string | null;
  /** Project working-days calendar (defaults to Mon–Fri) */
  workingDays?: number[];
  /** Project calendar exceptions (holiday dates) */
  calendarExceptions?: string[];
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

function fmtDate(iso: string) {
  try { return format(parseISO(iso), 'd MMM'); } catch { return iso; }
}

interface PendingAssign {
  itemId: string;
  itemText: string;
  profileId: string;
  profileName: string;
  start: string;
  end: string;
}

export function StageChecklist({
  projectId,
  stageId,
  currentUserId,
  currentUserName,
  canEdit,
  teamUserIds = [],
  projectName = '',
  stageName = '',
  stageStart,
  stageEnd,
  workingDays = DEFAULT_WORKING_DAYS,
  calendarExceptions = [],
}: Props) {
  const { toast } = useToast();
  const {
    items, doneCount, totalCount,
    addItem, toggleItem, deleteItem, assignItem,
    isAdding, isAssigning,
  } = useStageChecklist(projectId, stageId);

  const [newText, setNewText] = useState('');
  const [adding, setAdding] = useState(false);
  const [openAssignId, setOpenAssignId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAssign | null>(null);

  // Resolve team member profiles for the assignee picker
  const { data: teamProfiles = [] } = useProfilesByIds(teamUserIds);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    setNewText('');
    try {
      await addItem(text, currentUserId);
    } catch {
      setNewText(text);
      toast({ title: 'Failed to add item', variant: 'destructive' });
    }
  };

  const handleToggle = async (id: string, completed: boolean) => {
    try {
      await toggleItem(id, completed, currentUserId);
    } catch {
      toast({ title: 'Failed to update item', variant: 'destructive' });
    }
  };

  const handleDelete = async (item: { id: string; source: 'manual' | 'deliverable'; deliverableId?: string | null }) => {
    try {
      await deleteItem(item);
    } catch {
      toast({ title: 'Failed to delete item', variant: 'destructive' });
    }
  };

  /** Step 1: user picks a person → move to date step */
  const handlePickAssignee = (itemId: string, itemText: string, profileId: string, profileName: string) => {
    // Pre-fill with stage dates (or current item dates) as defaults
    const item = items.find(i => i.id === itemId);
    setPending({
      itemId,
      itemText,
      profileId,
      profileName,
      start: item?.plannedStart ?? stageStart ?? '',
      end: item?.plannedEnd ?? stageEnd ?? '',
    });
  };

  /** Step 2: user confirms (with optional dates) */
  const handleConfirmAssign = async () => {
    if (!pending) return;
    const { itemId, itemText, profileId, start, end } = pending;
    try {
      await assignItem(itemId, profileId, {
        assigneeText: itemText,
        assignedById: currentUserId ?? '',
        assignedByName: currentUserName ?? 'A manager',
        projName: projectName,
        stageName,
        plannedStart: start || null,
        plannedEnd: end || null,
      });
      const profile = teamProfiles.find(p => p.id === profileId);
      toast({
        title: 'Task assigned',
        description: `"${itemText}" assigned to ${profile?.full_name ?? profileId}`,
      });
      setOpenAssignId(null);
      setPending(null);
    } catch {
      toast({ title: 'Failed to assign item', variant: 'destructive' });
    }
  };

  /** Unassign */
  const handleUnassign = async (itemId: string, itemText: string) => {
    try {
      await assignItem(itemId, null, {
        assigneeText: itemText,
        assignedById: currentUserId ?? '',
        assignedByName: currentUserName ?? 'A manager',
        projName: projectName,
        stageName,
        plannedStart: null,
        plannedEnd: null,
      });
      setOpenAssignId(null);
      setPending(null);
    } catch {
      toast({ title: 'Failed to unassign item', variant: 'destructive' });
    }
  };

  const handlePopoverChange = (itemId: string, open: boolean) => {
    setOpenAssignId(open ? itemId : null);
    if (!open) setPending(null);
  };

  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
  const canAssign = canEdit && teamUserIds.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <CheckSquare className="h-3.5 w-3.5" />
          Checklist
          {totalCount > 0 && (
            <Badge
              className={cn(
                'text-[10px] px-1.5 py-0 ml-1',
                pct === 100
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
              )}
            >
              {doneCount}/{totalCount}
            </Badge>
          )}
        </div>
        {canEdit && !adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" /> Add Item
          </Button>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="w-full rounded-full bg-muted h-1.5 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              pct === 100 ? 'bg-emerald-500' : 'bg-[#1D3461]',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Items */}
      <div className="space-y-1">
        {items.map(item => {
          const assignedProfile = item.assignedTo
            ? teamProfiles.find(p => p.id === item.assignedTo)
            : null;

          // Duration badge for this item
          const itemDays = workingDaysBetween(item.plannedStart, item.plannedEnd, workingDays, calendarExceptions);

          return (
            <div key={item.id} className="flex items-start gap-2 group">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => handleToggle(item.id, !item.completed)}
                className="flex-shrink-0 text-muted-foreground hover:text-[#1D3461] transition-colors mt-0.5"
              >
                {item.completed ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>

              {/* Item text + date info */}
              <div className="flex-1 min-w-0">
                <span
                  className={cn(
                    'text-sm leading-snug',
                    item.completed && 'line-through text-muted-foreground',
                  )}
                >
                  {item.itemText}
                </span>
                {/* Date range + duration badge */}
                {(item.plannedStart || item.plannedEnd) && (
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {(item.plannedStart || item.plannedEnd) && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <CalendarDays className="h-2.5 w-2.5" />
                        {item.plannedStart ? fmtDate(item.plannedStart) : ''}
                        {item.plannedStart && item.plannedEnd ? ' → ' : ''}
                        {item.plannedEnd ? fmtDate(item.plannedEnd) : ''}
                      </span>
                    )}
                    {itemDays !== null && (
                      <span className="text-[10px] bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded-full px-1.5 py-0 font-medium">
                        {itemDays} wd
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Assignee picker */}
              {canAssign && !item.completed && (
                <Popover
                  open={openAssignId === item.id}
                  onOpenChange={open => handlePopoverChange(item.id, open)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex-shrink-0 flex items-center justify-center rounded-full transition-colors mt-0.5',
                        item.assignedTo
                          ? 'w-5 h-5 bg-amber-100 border border-amber-300 hover:bg-amber-200'
                          : 'w-5 h-5 opacity-0 group-hover:opacity-100 hover:bg-muted',
                      )}
                      title={item.assignedTo ? `Assigned to ${assignedProfile?.full_name ?? '…'} — click to change` : 'Assign to team member'}
                      disabled={isAssigning}
                    >
                      {item.assignedTo ? (
                        <span className="text-[9px] font-bold text-amber-700">
                          {assignedProfile ? initials(assignedProfile.full_name ?? '') : '?'}
                        </span>
                      ) : (
                        <UserPlus className="h-3 w-3 text-muted-foreground" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-2" align="end">
                    {/* Step 1: pick person */}
                    {(pending?.itemId !== item.id) && (
                      <>
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">
                          Assign to
                        </p>
                        {item.assignedTo && (
                          <button
                            type="button"
                            onClick={() => handleUnassign(item.id, item.itemText)}
                            className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted text-muted-foreground flex items-center gap-2 mb-1"
                          >
                            <X className="h-3 w-3 flex-shrink-0" />
                            Unassign
                          </button>
                        )}
                        {teamProfiles.map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => handlePickAssignee(item.id, item.itemText, p.id, p.full_name ?? p.id)}
                            className={cn(
                              'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted flex items-center gap-2',
                              item.assignedTo === p.id && 'bg-amber-50 text-amber-800 font-medium',
                            )}
                          >
                            <span className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-[9px] font-bold text-slate-600 flex-shrink-0">
                              {initials(p.full_name ?? '')}
                            </span>
                            <span className="flex-1 truncate">{p.full_name}</span>
                            {item.assignedTo === p.id && (
                              <Check className="h-3 w-3 text-amber-600 flex-shrink-0" />
                            )}
                          </button>
                        ))}
                        {teamProfiles.length === 0 && (
                          <p className="text-xs text-muted-foreground px-2 py-1 italic">
                            No team members on this project yet
                          </p>
                        )}
                      </>
                    )}

                    {/* Step 2: pick dates */}
                    {pending?.itemId === item.id && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPending(null)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <ArrowLeft className="h-3.5 w-3.5" />
                          </button>
                          <div className="flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                              {initials(pending.profileName)}
                            </span>
                            <p className="text-xs font-semibold truncate max-w-[140px]">{pending.profileName}</p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-0.5">
                            Task Period <span className="normal-case font-normal">(optional)</span>
                          </p>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="w-7 font-medium text-right flex-shrink-0">Start</span>
                            <input
                              type="date"
                              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              value={pending.start}
                              min={stageStart ?? undefined}
                              max={pending.end || stageEnd ?? undefined}
                              onChange={e => setPending(p => p ? { ...p, start: e.target.value } : p)}
                            />
                          </label>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="w-7 font-medium text-right flex-shrink-0">End</span>
                            <input
                              type="date"
                              className="flex-1 h-7 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                              value={pending.end}
                              min={pending.start || stageStart ?? undefined}
                              max={stageEnd ?? undefined}
                              onChange={e => setPending(p => p ? { ...p, end: e.target.value } : p)}
                            />
                          </label>
                          {/* Live duration */}
                          {pending.start && pending.end && (() => {
                            const wd = workingDaysBetween(pending.start, pending.end, workingDays, calendarExceptions);
                            return wd !== null ? (
                              <p className="text-[10px] text-sky-600 dark:text-sky-400 px-0.5 flex items-center gap-1">
                                <CalendarDays className="h-2.5 w-2.5" />
                                {wd} working day{wd !== 1 ? 's' : ''}
                              </p>
                            ) : null;
                          })()}
                        </div>

                        <Button
                          size="sm"
                          className="w-full h-7 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white"
                          onClick={handleConfirmAssign}
                          disabled={isAssigning}
                        >
                          {isAssigning ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                          Assign
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              )}

              {/* Show static assignee avatar when canAssign is off but item is assigned */}
              {!canAssign && item.assignedTo && !item.completed && assignedProfile && (
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[9px] font-bold text-amber-700 mt-0.5"
                  title={`Assigned to ${assignedProfile.full_name}`}
                >
                  {initials(assignedProfile.full_name ?? '')}
                </span>
              )}

              {/* Delete */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all flex-shrink-0 mt-0.5"
                  title={item.source === 'deliverable' ? 'Hide default deliverable' : 'Delete custom item'}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add new item */}
      {adding && (
        <div className="flex gap-2">
          <Input
            placeholder="New checklist item..."
            value={newText}
            onChange={e => setNewText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') { setAdding(false); setNewText(''); }
            }}
            className="h-8 text-sm flex-1"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8 px-3 bg-[#1D3461] hover:bg-[#0F2041] text-white"
            onClick={handleAdd}
            disabled={isAdding || !newText.trim()}
          >
            {isAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-3"
            onClick={() => { setAdding(false); setNewText(''); }}
          >
            Cancel
          </Button>
        </div>
      )}

      {items.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground italic">No checklist items yet</p>
      )}
    </div>
  );
}
