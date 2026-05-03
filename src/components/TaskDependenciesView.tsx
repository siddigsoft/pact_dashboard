import React, { useState, useEffect, useMemo } from 'react';
import {
  getBlockingTasks,
  getDependentTasks,
  canTaskStart,
  removeTaskDependency,
  addTaskDependency,
} from '@/services/task-dependencies.service';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import {
  AlertCircle, CheckCircle, Link2, ArrowRight, Trash2, Lock, Plus, Search, Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

interface TaskLink {
  dependencyId: string;
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  leadTimeDays: number;
}

interface PickerTask {
  id: string;
  title: string;
  status: string;
}

interface TaskDependenciesViewProps {
  taskId: string;
  readonly?: boolean;
  /** When true, suppress the inner "Dependencies" h3 + Add button so the
   * card can be embedded inside an outer titled container (e.g. a tab).
   * The Add button is re-exposed inline next to the empty state. */
  hideHeader?: boolean;
}

export const TaskDependenciesView: React.FC<TaskDependenciesViewProps> = ({
  taskId,
  readonly = false,
  hideHeader = false,
}) => {
  const [blockingTasks, setBlockingTasks] = useState<TaskLink[]>([]);
  const [dependentTasks, setDependentTasks] = useState<TaskLink[]>([]);
  const [canStart, setCanStart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const { toast } = useToast();
  const { currentUser } = useUser();

  // Add-dependency dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerTasks, setPickerTasks] = useState<PickerTask[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadDependencies();
  }, [taskId]);

  const loadDependencies = async () => {
    setLoading(true);
    const [blocking, dependent, startCheck] = await Promise.all([
      getBlockingTasks(taskId),
      getDependentTasks(taskId),
      canTaskStart(taskId),
    ]);
    if (!blocking.error) setBlockingTasks(blocking.blockingTasks);
    if (!dependent.error) setDependentTasks(dependent.dependentTasks);
    if (!startCheck.error) setCanStart(startCheck.canStart);
    setLoading(false);
  };

  const handleDeleteDependency = async (dependencyId: string) => {
    if (!confirm('Remove this dependency?')) return;
    setDeleting(dependencyId);
    const { success, message } = await removeTaskDependency(dependencyId);
    if (success) await loadDependencies();
    else toast({ title: 'Error', description: message, variant: 'destructive' });
    setDeleting(null);
  };

  // Excluded ids = self + already-blocking + already-dependent so user can't pick a duplicate
  const excludedIds = useMemo(() => {
    const s = new Set<string>([taskId]);
    blockingTasks.forEach(t => s.add(t.id));
    dependentTasks.forEach(t => s.add(t.id));
    return s;
  }, [taskId, blockingTasks, dependentTasks]);

  const openAddDialog = async () => {
    setAddOpen(true);
    setPickerSearch('');
    setPickedId(null);
    setLeadTimeDays(0);
    setPickerLoading(true);
    try {
      // Load candidate tasks: assigned to me, created by me, or where I'm a co-assignee.
      // Keep this small (top 100 most-recent) for quick browsing.
      const uid = currentUser?.id;
      let q = supabase
        .from('personal_tasks')
        .select('id, title, status')
        .order('created_at', { ascending: false })
        .limit(100);
      if (uid) {
        // The personal_tasks schema uses `assigned_to` (primary assignee) and
        // `user_id` (creator/owner). The previous `assignee_id` / `created_by`
        // columns don't exist, which made the dependency picker silently
        // return zero candidates and the "Add dependency" dialog feel broken.
        q = q.or(`assigned_to.eq.${uid},user_id.eq.${uid}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      setPickerTasks((data ?? []) as PickerTask[]);
    } catch (e: any) {
      toast({ title: 'Could not load tasks', description: e.message, variant: 'destructive' });
    } finally {
      setPickerLoading(false);
    }
  };

  const filteredPicker = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return pickerTasks
      .filter(t => !excludedIds.has(t.id))
      .filter(t => !q || t.title?.toLowerCase().includes(q));
  }, [pickerTasks, excludedIds, pickerSearch]);

  const submitAdd = async () => {
    if (!pickedId) return;
    setAdding(true);
    // parent_task_id = the predecessor that must finish first.
    // dependent_task_id = this task (the one we're viewing), which is blocked by parent.
    const { dependency, error } = await addTaskDependency(
      pickedId,        // parent (predecessor)
      taskId,          // dependent (current task)
      'blocks',
      Math.max(0, Number(leadTimeDays) || 0),
    );
    setAdding(false);
    if (error || !dependency) {
      toast({ title: 'Could not add dependency', description: error || 'Unknown error', variant: 'destructive' });
      return;
    }
    toast({ title: 'Dependency added', description: 'This task is now waiting on the selected predecessor.' });
    setAddOpen(false);
    await loadDependencies();
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'done':       return 'bg-green-100 text-green-800';
      case 'inprogress': return 'bg-blue-100 text-blue-800';
      case 'on_hold':    return 'bg-yellow-100 text-yellow-800';
      default:           return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':   return 'text-red-600';
      case 'medium': return 'text-orange-600';
      case 'low':    return 'text-green-600';
      default:       return 'text-gray-600';
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading dependencies...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header with Add button — hidden when embedded in a tabbed container
          that already provides its own title and add affordance. */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Link2 className="h-4 w-4" /> Dependencies
          </h3>
          {!readonly && (
            <Button size="sm" variant="outline" onClick={openAddDialog} data-testid="button-add-dependency">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add Dependency
            </Button>
          )}
        </div>
      )}
      {/* When the outer header is hidden but there ARE existing rows below,
          surface a compact Add button so the action is still reachable. */}
      {hideHeader && !readonly && (blockingTasks.length > 0 || dependentTasks.length > 0) && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={openAddDialog} data-testid="button-add-dependency-compact">
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Dependency
          </Button>
        </div>
      )}

      {/* Start Status Alert */}
      {!canStart && blockingTasks.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-start gap-2">
          <Lock className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              This task is blocked by {blockingTasks.length} incomplete task
              {blockingTasks.length !== 1 ? 's' : ''}
            </p>
            <p className="text-sm text-yellow-700 mt-1">Complete them first to start this task.</p>
          </div>
        </div>
      )}

      {/* Blocking Tasks */}
      {blockingTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-2 uppercase tracking-wide">
            <ArrowRight className="h-3.5 w-3.5" />
            Blocked by ({blockingTasks.length})
          </h4>
          <div className="space-y-2">
            {blockingTasks.map((task) => (
              <div
                key={task.dependencyId}
                className="border border-gray-200 rounded-lg p-3 flex items-start justify-between hover:bg-gray-50 transition"
                data-testid={`blocking-task-${task.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {task.status === 'done' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    )}
                    <a href={`/tasks/${task.id}`} className="font-medium text-gray-900 text-sm hover:underline truncate">
                      {task.title}
                    </a>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                    <span className={`px-2 py-0.5 rounded font-medium ${getStatusBadgeColor(task.status)}`}>{task.status}</span>
                    <span className={`font-medium ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                    {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                    {task.leadTimeDays > 0 && <span className="text-blue-600">+{task.leadTimeDays}d lead</span>}
                  </div>
                </div>
                {!readonly && (
                  <button
                    onClick={() => handleDeleteDependency(task.dependencyId)}
                    disabled={deleting === task.dependencyId}
                    className="ml-2 p-1.5 text-gray-400 hover:text-red-600 disabled:text-gray-300 transition flex-shrink-0"
                    title="Remove dependency"
                    data-testid={`button-remove-dep-${task.dependencyId}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dependent Tasks */}
      {dependentTasks.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-gray-700 flex items-center gap-2 uppercase tracking-wide">
            <Link2 className="h-3.5 w-3.5" />
            Blocks ({dependentTasks.length})
          </h4>
          <div className="space-y-2">
            {dependentTasks.map((task) => (
              <div
                key={task.dependencyId}
                className="border border-gray-200 rounded-lg p-3 flex items-start justify-between hover:bg-gray-50 transition"
                data-testid={`dependent-task-${task.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {task.status === 'done' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    )}
                    <a href={`/tasks/${task.id}`} className="font-medium text-gray-900 text-sm hover:underline truncate">
                      {task.title}
                    </a>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600 flex-wrap">
                    <span className={`px-2 py-0.5 rounded font-medium ${getStatusBadgeColor(task.status)}`}>{task.status}</span>
                    <span className={`font-medium ${getPriorityColor(task.priority)}`}>{task.priority}</span>
                    {task.dueDate && <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>}
                    {task.leadTimeDays > 0 && <span className="text-blue-600">-{task.leadTimeDays}d before</span>}
                  </div>
                </div>
                {!readonly && (
                  <button
                    onClick={() => handleDeleteDependency(task.dependencyId)}
                    disabled={deleting === task.dependencyId}
                    className="ml-2 p-1.5 text-gray-400 hover:text-red-600 disabled:text-gray-300 transition flex-shrink-0"
                    title="Remove dependency"
                    data-testid={`button-remove-dep-${task.dependencyId}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {blockingTasks.length === 0 && dependentTasks.length === 0 && (
        <div className="text-center py-6 text-gray-500 border border-dashed border-gray-200 rounded-lg">
          <Link2 className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm">No dependencies configured for this task</p>
          {!readonly && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={openAddDialog} data-testid="button-add-first-dependency">
              <Plus className="h-3.5 w-3.5 mr-1" /> Add the first one
            </Button>
          )}
        </div>
      )}

      {/* Add Dependency Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Add Predecessor Dependency</DialogTitle>
            <p className="text-xs text-muted-foreground">
              Pick a task that must be completed <strong>before</strong> this task can start.
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search tasks by title…"
                className="pl-9"
                data-testid="input-search-dependency"
              />
            </div>

            <div className="border rounded-lg max-h-[280px] overflow-y-auto">
              {pickerLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading tasks…
                </div>
              ) : filteredPicker.length === 0 ? (
                <div className="py-6 text-center text-gray-500 text-sm">
                  No matching tasks found.
                </div>
              ) : (
                <ul className="divide-y">
                  {filteredPicker.map(t => (
                    <li
                      key={t.id}
                      onClick={() => setPickedId(t.id)}
                      className={`px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center justify-between ${
                        pickedId === t.id ? 'bg-blue-50' : ''
                      }`}
                      data-testid={`option-task-${t.id}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.title || '(untitled)'}</p>
                        <span className={`inline-block mt-0.5 text-[11px] px-1.5 py-0.5 rounded ${getStatusBadgeColor(t.status)}`}>
                          {t.status}
                        </span>
                      </div>
                      {pickedId === t.id && <CheckCircle className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <Label htmlFor="leadTimeDays" className="text-xs">Lead time (days, optional)</Label>
              <Input
                id="leadTimeDays"
                type="number"
                min={0}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(Number(e.target.value))}
                className="mt-1"
                data-testid="input-lead-time-days"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Buffer between predecessor completion and this task starting.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={submitAdd}
              disabled={!pickedId || adding}
              data-testid="button-confirm-add-dependency"
            >
              {adding ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</> : 'Add Dependency'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
