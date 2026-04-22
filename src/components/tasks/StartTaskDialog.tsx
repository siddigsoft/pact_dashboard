import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, PlayCircle, Plus, X, Clock, Calendar, ListChecks, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StartDependency {
  label: string;
  kind: 'person' | 'department' | 'item';
  userId?: string;
  userName?: string;
  deptId?: string;
  deptName?: string;
  confirmed?: boolean;
  confirmed_at?: string;
  confirmed_by?: string;
  confirmed_by_name?: string;
}

export interface StartTaskPayload {
  estimatedHours: number;
  estimatedDays: number;
  requirements: string;
  dependencies: StartDependency[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  /** Existing task dependencies (task→task / user / dept) used to prefill the list. */
  prefillDependencies?: Array<{ label: string; type?: string; userId?: string; userName?: string; deptId?: string; deptName?: string }>;
  defaultEstimatedHours?: number | null;
  isPending?: boolean;
  onConfirm: (payload: StartTaskPayload) => Promise<void> | void;
}

export function StartTaskDialog({
  open,
  onOpenChange,
  taskTitle,
  prefillDependencies = [],
  defaultEstimatedHours,
  isPending,
  onConfirm,
}: Props) {
  const initialDeps = useMemo<StartDependency[]>(
    () =>
      prefillDependencies.map(d => ({
        label: d.label,
        kind: d.userId ? 'person' : d.deptId ? 'department' : 'item',
        userId: d.userId,
        userName: d.userName,
        deptId: d.deptId,
        deptName: d.deptName,
        confirmed: false,
      })),
    [prefillDependencies],
  );

  const [hours, setHours] = useState<string>(defaultEstimatedHours != null ? String(defaultEstimatedHours) : '');
  const [days, setDays] = useState<string>('');
  const [requirements, setRequirements] = useState<string>('');
  const [deps, setDeps] = useState<StartDependency[]>(initialDeps);
  const [newDepLabel, setNewDepLabel] = useState('');
  const [newDepKind, setNewDepKind] = useState<'person' | 'department' | 'item'>('item');

  const canSubmit =
    hours.trim() !== '' &&
    days.trim() !== '' &&
    Number(hours) > 0 &&
    Number(days) > 0;

  const addDep = () => {
    const label = newDepLabel.trim();
    if (!label) return;
    setDeps(prev => [...prev, { label, kind: newDepKind, confirmed: false }]);
    setNewDepLabel('');
  };

  const removeDep = (index: number) => {
    setDeps(prev => prev.filter((_, i) => i !== index));
  };

  const handleConfirm = async () => {
    if (!canSubmit) return;
    await onConfirm({
      estimatedHours: Number(hours),
      estimatedDays: Number(days),
      requirements: requirements.trim(),
      dependencies: deps,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-start-task">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#1D3461]">
            <PlayCircle className="w-5 h-5" /> Start the task
          </DialogTitle>
          <DialogDescription className="text-xs">
            Confirm your plan for <span className="font-semibold text-slate-700">"{taskTitle}"</span>.
            Once you start, these details lock — only an admin can change them. You'll still be able to update status and submit your output.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Hours + Days */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-hours" className="text-xs font-semibold flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Hours to complete
              </Label>
              <Input
                id="start-hours"
                type="number"
                min="0.25"
                step="0.25"
                value={hours}
                onChange={e => setHours(e.target.value)}
                placeholder="e.g. 8"
                data-testid="input-start-hours"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="start-days" className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" /> Days needed
              </Label>
              <Input
                id="start-days"
                type="number"
                min="1"
                step="1"
                value={days}
                onChange={e => setDays(e.target.value)}
                placeholder="e.g. 2"
                data-testid="input-start-days"
              />
            </div>
          </div>

          {/* Requirements */}
          <div className="space-y-1.5">
            <Label htmlFor="start-reqs" className="text-xs font-semibold flex items-center gap-1.5">
              <ListChecks className="w-3.5 h-3.5" /> Requirements you need
            </Label>
            <Textarea
              id="start-reqs"
              rows={3}
              value={requirements}
              onChange={e => setRequirements(e.target.value)}
              placeholder="Tools, info, files, access, anything you need to finish this…"
              className="resize-none text-sm"
              data-testid="input-start-requirements"
            />
          </div>

          {/* Dependencies */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Dependencies
              <span className="text-[10px] font-normal text-slate-400">(people / departments / items you depend on)</span>
            </Label>

            {deps.length > 0 && (
              <ul className="space-y-1.5 mb-2" data-testid="list-start-deps">
                {deps.map((d, i) => (
                  <li
                    key={`${d.label}-${i}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200"
                    data-testid={`dep-row-${i}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                          d.kind === 'person' ? 'bg-blue-100 text-blue-700'
                          : d.kind === 'department' ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-200 text-slate-600',
                        )}
                      >
                        {d.kind}
                      </span>
                      <span className="text-xs text-slate-700 truncate">{d.label}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDep(i)}
                      className="p-1 rounded hover:bg-rose-100 text-slate-400 hover:text-rose-600"
                      data-testid={`btn-remove-dep-${i}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-1.5">
              <select
                value={newDepKind}
                onChange={e => setNewDepKind(e.target.value as 'person' | 'department' | 'item')}
                className="h-9 px-2 rounded-lg border border-slate-200 text-xs bg-white"
                data-testid="select-dep-kind"
              >
                <option value="item">Item</option>
                <option value="person">Person</option>
                <option value="department">Department</option>
              </select>
              <Input
                value={newDepLabel}
                onChange={e => setNewDepLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDep(); } }}
                placeholder="Add dependency…"
                className="text-sm"
                data-testid="input-dep-label"
              />
              <Button type="button" variant="outline" size="sm" onClick={addDep} data-testid="btn-add-dep">
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending} data-testid="btn-cancel-start">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canSubmit || isPending}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
            data-testid="btn-confirm-start"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
            Start the task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
