import { useState } from 'react';
import { Plus, Trash2, CheckSquare, Square, Loader2, UserPlus, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useStageChecklist } from '@/hooks/useStageData';
import { useProfilesByIds } from '@/hooks/useUserDirectory';
import { cn } from '@/lib/utils';

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
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .slice(0, 2)
    .join('');
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

  const handleAssign = async (itemId: string, itemText: string, assigneeId: string | null) => {
    const assignee = assigneeId ? teamProfiles.find(p => p.id === assigneeId) : null;
    try {
      await assignItem(itemId, assigneeId, {
        assigneeText: itemText,
        assignedById: currentUserId ?? '',
        assignedByName: currentUserName ?? 'A manager',
        projName: projectName,
        stageName,
      });
      setOpenAssignId(null);
      if (assigneeId && assignee) {
        toast({
          title: 'Task assigned',
          description: `"${itemText}" assigned to ${assignee.full_name}`,
        });
      }
    } catch {
      toast({ title: 'Failed to assign item', variant: 'destructive' });
    }
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

          return (
            <div key={item.id} className="flex items-center gap-2 group">
              {/* Checkbox */}
              <button
                type="button"
                onClick={() => handleToggle(item.id, !item.completed)}
                className="flex-shrink-0 text-muted-foreground hover:text-[#1D3461] transition-colors"
              >
                {item.completed ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </button>

              {/* Item text */}
              <span
                className={cn(
                  'flex-1 text-sm',
                  item.completed && 'line-through text-muted-foreground',
                )}
              >
                {item.itemText}
              </span>

              {/* Assignee picker */}
              {canAssign && !item.completed && (
                <Popover
                  open={openAssignId === item.id}
                  onOpenChange={open => setOpenAssignId(open ? item.id : null)}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'flex-shrink-0 flex items-center justify-center rounded-full transition-colors',
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
                  <PopoverContent className="w-52 p-2" align="end">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5 px-1">
                      Assign to
                    </p>
                    {item.assignedTo && (
                      <button
                        type="button"
                        onClick={() => handleAssign(item.id, item.itemText, null)}
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
                        onClick={() => handleAssign(item.id, item.itemText, p.id)}
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
                  </PopoverContent>
                </Popover>
              )}

              {/* Show static assignee avatar when canAssign is off but item is assigned */}
              {!canAssign && item.assignedTo && !item.completed && assignedProfile && (
                <span
                  className="flex-shrink-0 w-5 h-5 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center text-[9px] font-bold text-amber-700"
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
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all flex-shrink-0"
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
