import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';
import { dispatchNotification } from '@/lib/notify';

type TaskDependency = Database['public']['Tables']['task_dependencies']['Row'];
type TaskSchedule = Database['public']['Tables']['task_schedules']['Row'];

interface DependencyNode {
  taskId: string;
  taskName?: string;
  priority?: string;
  status?: string;
  dueDate?: string;
  dependencies: string[]; // Array of task IDs this task depends on
  dependents: string[]; // Array of task IDs that depend on this task
  isBlocking: boolean;
  isCriticalPath: boolean;
}

interface DependencyGraph {
  nodes: DependencyNode[];
  edges: Array<{ from: string; to: string; type: string }>;
  criticalPath?: string[];
}

/**
 * Add a dependency between two tasks
 */
export async function addTaskDependency(
  parentTaskId: string,
  dependentTaskId: string,
  dependencyType: string = 'blocks',
  leadTimeDays: number = 0,
  description?: string
): Promise<{ dependency: TaskDependency | null; error: string | null }> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { dependency: null, error: 'Not authenticated' };

    // Check for circular dependencies
    const { data: circularCheck, error: circularError } = await supabase.rpc(
      'check_circular_dependencies',
      {
        p_parent_id: parentTaskId,
        p_dependent_id: dependentTaskId,
      }
    );

    if (circularError || circularCheck)
      return { dependency: null, error: 'This would create a circular dependency' };

    const { data, error } = await supabase
      .from('task_dependencies')
      .insert({
        parent_task_id: parentTaskId,
        dependent_task_id: dependentTaskId,
        dependency_type: dependencyType,
        lead_time_days: leadTimeDays,
        description,
        created_by: userData.user.id,
      })
      .select()
      .single();

    if (error) return { dependency: null, error: error.message };

    // Recalculate schedules
    await supabase.rpc('recalculate_task_schedules');

    // ── Notify the people who own/are assigned to BOTH tasks ──────────────
    // The dependent-task's owner+assignee need to know they now have a blocker.
    // The parent-task's owner+assignee need to know someone is waiting on them.
    try {
      const { data: tasks } = await supabase
        .from('personal_tasks')
        .select('id, title, user_id, assigned_to, assigned_to_name, co_assignees, due_date, priority')
        .in('id', [parentTaskId, dependentTaskId]);

      const parent = tasks?.find((t: any) => t.id === parentTaskId);
      const dependent = tasks?.find((t: any) => t.id === dependentTaskId);
      const actorName = userData.user.user_metadata?.full_name || userData.user.email || 'A team member';

      const collectIds = (t: any): string[] => {
        if (!t) return [];
        const ids: string[] = [];
        if (t.user_id) ids.push(t.user_id);
        if (t.assigned_to) ids.push(t.assigned_to);
        const co = (t.co_assignees as Array<{ id: string }> | null) ?? [];
        co.forEach((c) => c?.id && ids.push(c.id));
        return ids;
      };

      const parentRecipients = collectIds(parent).filter((id) => id !== userData.user!.id);
      const dependentRecipients = collectIds(dependent).filter((id) => id !== userData.user!.id);

      const desc = description?.trim() || `${dependencyType.replace(/_/g, ' ')}`;

      // Notify parent-task owners: "Someone is waiting on your task"
      if (parentRecipients.length > 0 && parent && dependent) {
        await dispatchNotification({
          event: 'dependency_added',
          recipientIds: parentRecipients,
          titleEn: 'Someone is waiting on your task',
          titleAr: 'هناك من ينتظر إنجاز مهمتك',
          messageEn: `${actorName} marked "${dependent.title}" as depending on your task "${parent.title}". Requested: ${desc}.`,
          messageAr: `قام ${actorName} بربط المهمة "${dependent.title}" باعتمادها على مهمتك "${parent.title}". المطلوب: ${desc}.`,
          priority: 'high',
          entityType: 'task',
          entityId: parent.id,
          actionUrl: `/my-tasks/${parent.id}`,
          sendWhatsApp: true,
          triggeredBy: userData.user.id,
          triggeredByName: actorName,
          metadata: {
            dependent_task: dependent.title,
            parent_task: parent.title,
            dependency_type: dependencyType,
            requested: desc,
            lead_time_days: leadTimeDays,
            due_date: parent.due_date ?? '',
          },
        });
      }

      // Notify dependent-task owners: "Your task now has a new blocker"
      if (dependentRecipients.length > 0 && parent && dependent) {
        await dispatchNotification({
          event: 'dependency_blocked',
          recipientIds: dependentRecipients,
          titleEn: 'Your task now depends on another',
          titleAr: 'مهمتك أصبحت معتمدة على مهمة أخرى',
          messageEn: `"${dependent.title}" now requires "${parent.title}" to be completed first. Type: ${dependencyType}.`,
          messageAr: `المهمة "${dependent.title}" تتطلب الآن إنجاز "${parent.title}" أولاً. النوع: ${dependencyType}.`,
          priority: 'normal',
          entityType: 'task',
          entityId: dependent.id,
          actionUrl: `/my-tasks/${dependent.id}`,
          sendWhatsApp: false,
          triggeredBy: userData.user.id,
          triggeredByName: actorName,
          metadata: {
            blocking_task: parent.title,
            dependency_type: dependencyType,
            requested: desc,
            lead_time_days: leadTimeDays,
          },
        });
      }
    } catch (notifyErr) {
      // Notification failure must NEVER block the dependency creation
      console.warn('[task-dependencies] notify failed:', notifyErr);
    }

    return { dependency: data, error: null };
  } catch (err) {
    console.error('Error adding task dependency:', err);
    return { dependency: null, error: 'Failed to add dependency' };
  }
}

/**
 * Remove a dependency
 */
export async function removeTaskDependency(
  dependencyId: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { error } = await supabase
      .from('task_dependencies')
      .delete()
      .eq('id', dependencyId);

    if (error) return { success: false, message: error.message };

    // Recalculate schedules
    await supabase.rpc('recalculate_task_schedules');

    return { success: true, message: 'Dependency removed' };
  } catch (err) {
    console.error('Error removing dependency:', err);
    return { success: false, message: 'Failed to remove dependency' };
  }
}

/**
 * Get all dependencies for a task
 */
export async function getTaskDependencies(
  taskId: string
): Promise<{
  dependencies: TaskDependency[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('task_dependencies')
      .select('*')
      .or(`parent_task_id.eq.${taskId},dependent_task_id.eq.${taskId}`)
      .order('created_at', { ascending: false });

    if (error) return { dependencies: [], error: error.message };
    return { dependencies: data || [], error: null };
  } catch (err) {
    console.error('Error fetching task dependencies:', err);
    return { dependencies: [], error: 'Failed to fetch dependencies' };
  }
}

/**
 * Get blocking tasks (that must be completed before this task can complete)
 *
 * IMPORTANT: this MUST NOT use a PostgREST embed of the form
 * `personal_tasks:parent_task_id(...)`. `task_dependencies` has TWO foreign
 * keys to `personal_tasks` (`parent_task_id` AND `dependent_task_id`), so
 * PostgREST returns "more than one relationship was found" — which then
 * propagates as `error` and trips the fail-closed dep-gate in TaskDetail
 * ("Couldn't verify dependencies"). We do two cheap queries instead.
 */
export async function getBlockingTasks(
  taskId: string
): Promise<{
  blockingTasks: any[];
  error: string | null;
}> {
  try {
    const { data: deps, error: depsError } = await supabase
      .from('task_dependencies')
      .select('id, dependency_type, lead_time_days, parent_task_id')
      .eq('dependent_task_id', taskId)
      .in('dependency_type', ['blocks', 'blocked_by']);

    if (depsError) return { blockingTasks: [], error: depsError.message };
    if (!deps || deps.length === 0) return { blockingTasks: [], error: null };

    const parentIds = Array.from(
      new Set(deps.map((d: any) => d.parent_task_id).filter(Boolean))
    );
    if (parentIds.length === 0) return { blockingTasks: [], error: null };

    const { data: parents, error: parentsError } = await supabase
      .from('personal_tasks')
      .select('id, title, status, due_date, priority')
      .in('id', parentIds);

    if (parentsError) return { blockingTasks: [], error: parentsError.message };

    const parentMap = new Map((parents || []).map((p: any) => [p.id, p]));
    const blockingTasks = deps
      .map((d: any) => {
        const p = parentMap.get(d.parent_task_id);
        if (!p) return null; // parent invisible to RLS — skip silently
        return {
          ...p,
          dependencyId: d.id,
          leadTimeDays: d.lead_time_days,
        };
      })
      .filter(Boolean);

    return { blockingTasks, error: null };
  } catch (err) {
    console.error('Error fetching blocking tasks:', err);
    return { blockingTasks: [], error: 'Failed to fetch blocking tasks' };
  }
}

/**
 * Get dependent tasks (that depend on this task)
 *
 * Same FK-ambiguity caveat as `getBlockingTasks` — do NOT reintroduce a
 * `personal_tasks:dependent_task_id(...)` embed, it will fail with
 * "more than one relationship was found".
 */
export async function getDependentTasks(
  taskId: string
): Promise<{
  dependentTasks: any[];
  error: string | null;
}> {
  try {
    const { data: deps, error: depsError } = await supabase
      .from('task_dependencies')
      .select('id, dependency_type, lead_time_days, dependent_task_id')
      .eq('parent_task_id', taskId)
      .in('dependency_type', ['blocks', 'blocked_by']);

    if (depsError) return { dependentTasks: [], error: depsError.message };
    if (!deps || deps.length === 0) return { dependentTasks: [], error: null };

    const childIds = Array.from(
      new Set(deps.map((d: any) => d.dependent_task_id).filter(Boolean))
    );
    if (childIds.length === 0) return { dependentTasks: [], error: null };

    const { data: children, error: childrenError } = await supabase
      .from('personal_tasks')
      .select('id, title, status, due_date, priority')
      .in('id', childIds);

    if (childrenError) return { dependentTasks: [], error: childrenError.message };

    const childMap = new Map((children || []).map((c: any) => [c.id, c]));
    const dependentTasks = deps
      .map((d: any) => {
        const c = childMap.get(d.dependent_task_id);
        if (!c) return null;
        return {
          ...c,
          dependencyId: d.id,
          leadTimeDays: d.lead_time_days,
        };
      })
      .filter(Boolean);

    return { dependentTasks, error: null };
  } catch (err) {
    console.error('Error fetching dependent tasks:', err);
    return { dependentTasks: [], error: 'Failed to fetch dependent tasks' };
  }
}

/**
 * Get task schedule
 */
export async function getTaskSchedule(
  taskId: string
): Promise<{
  schedule: TaskSchedule | null;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('task_schedules')
      .select('*')
      .eq('task_id', taskId)
      .single();

    if (error && error.code !== 'PGRST116')
      return { schedule: null, error: error.message };
    return { schedule: data, error: null };
  } catch (err) {
    console.error('Error fetching task schedule:', err);
    return { schedule: null, error: 'Failed to fetch schedule' };
  }
}

/**
 * Recalculate all task schedules
 */
export async function recalculateSchedules(
  projectId?: string
): Promise<{
  recalculated: number;
  violations: number;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('recalculate_task_schedules', {
      p_project_id: projectId || null,
    });

    if (error)
      return {
        recalculated: 0,
        violations: 0,
        error: error.message,
      };

    return {
      recalculated: data?.recalculated_tasks || 0,
      violations: data?.violations || 0,
      error: null,
    };
  } catch (err) {
    console.error('Error recalculating schedules:', err);
    return {
      recalculated: 0,
      violations: 0,
      error: 'Failed to recalculate schedules',
    };
  }
}

/**
 * Find critical path
 */
export async function findCriticalPath(
  projectId?: string
): Promise<{
  found: boolean;
  pathLength: number;
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('find_critical_path', {
      p_project_id: projectId || null,
    });

    if (error) return { found: false, pathLength: 0, error: error.message };

    return {
      found: data?.critical_path_found || false,
      pathLength: data?.path_length || 0,
      error: null,
    };
  } catch (err) {
    console.error('Error finding critical path:', err);
    return { found: false, pathLength: 0, error: 'Failed to find critical path' };
  }
}

/**
 * Build dependency graph for visualization
 */
export async function buildDependencyGraph(
  taskIds?: string[]
): Promise<{
  graph: DependencyGraph | null;
  error: string | null;
}> {
  try {
    // Step 1: pull dependency edges WITHOUT any PostgREST embed.
    // Same FK-ambiguity hazard as getBlockingTasks/getDependentTasks: an embed
    // like `parent_tasks:parent_task_id(...)` collapses to an alias and leaves
    // the FK ambiguous (two FKs from this table point at personal_tasks).
    let query = supabase
      .from('task_dependencies')
      .select(
        'id, dependency_type, lead_time_days, parent_task_id, dependent_task_id, is_critical, description, created_by, created_at'
      );

    if (taskIds && taskIds.length > 0) {
      query = query.or(
        `parent_task_id.in.(${taskIds.join(',')}),dependent_task_id.in.(${taskIds.join(',')})`
      );
    }

    const { data: deps, error: depsError } = await query;
    if (depsError) return { graph: null, error: depsError.message };

    const allTaskIds = Array.from(
      new Set(
        (deps || [])
          .flatMap((d: any) => [d.parent_task_id, d.dependent_task_id])
          .filter(Boolean)
      )
    );

    // Step 2: hydrate task metadata in a single follow-up query.
    let taskMetaMap = new Map<string, any>();
    if (allTaskIds.length > 0) {
      const { data: tasks, error: tasksError } = await supabase
        .from('personal_tasks')
        .select('id, title, priority, status, due_date')
        .in('id', allTaskIds);
      if (tasksError) return { graph: null, error: tasksError.message };
      taskMetaMap = new Map((tasks || []).map((t: any) => [t.id, t]));
    }

    const nodes = new Map<string, DependencyNode>();
    const edges: Array<{ from: string; to: string; type: string }> = [];

    (deps || []).forEach((dep: any) => {
      const parentId = dep.parent_task_id;
      const dependentId = dep.dependent_task_id;
      const parentMeta = taskMetaMap.get(parentId);
      const dependentMeta = taskMetaMap.get(dependentId);

      if (!nodes.has(parentId)) {
        nodes.set(parentId, {
          taskId: parentId,
          taskName: parentMeta?.title,
          priority: parentMeta?.priority,
          status: parentMeta?.status,
          dueDate: parentMeta?.due_date,
          dependencies: [],
          dependents: [],
          isBlocking: true,
          isCriticalPath: false,
        });
      }

      if (!nodes.has(dependentId)) {
        nodes.set(dependentId, {
          taskId: dependentId,
          taskName: dependentMeta?.title,
          priority: dependentMeta?.priority,
          status: dependentMeta?.status,
          dueDate: dependentMeta?.due_date,
          dependencies: [],
          dependents: [],
          isBlocking: false,
          isCriticalPath: false,
        });
      }

      const parentNode = nodes.get(parentId)!;
      const dependentNode = nodes.get(dependentId)!;
      parentNode.dependents.push(dependentId);
      dependentNode.dependencies.push(parentId);

      edges.push({
        from: parentId,
        to: dependentId,
        type: dep.dependency_type,
      });
    });

    return {
      graph: {
        nodes: Array.from(nodes.values()),
        edges,
      },
      error: null,
    };
  } catch (err) {
    console.error('Error building dependency graph:', err);
    return { graph: null, error: 'Failed to build dependency graph' };
  }
}

/**
 * Check if a task can start (all predecessor dependencies are 'done').
 *
 * Calls the SECURITY DEFINER RPC `task_can_start` (see migration
 * 20260426_task_can_start_rpc.sql). The RPC reads task_dependencies and
 * personal_tasks server-side, so an admin/superadmin viewing a task whose
 * predecessors they cannot see via RLS still gets a correct answer instead
 * of tripping the fail-closed dep-gate.
 *
 * Contract:
 *   - On RPC error: { canStart: false, ..., error: <msg> }  (fail closed)
 *   - On success with empty blocking list: { canStart: true, blockingTasks: [], error: null }
 *   - On success with blocking list: { canStart: false, blockingTasks: [...], error: null }
 *
 * The RPC's `blocking` array only contains predecessors whose status is
 * NOT 'done' — i.e. the ones actually blocking the start.
 */
function isMissingRpcError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === 'PGRST202' || err.code === '42883') return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('could not find the function')
    || m.includes('schema cache')
    || m.includes('does not exist');
}

async function canTaskStartFallback(taskId: string): Promise<{
  canStart: boolean;
  blockingTasks: any[];
  error: string | null;
}> {
  const { blockingTasks, error } = await getBlockingTasks(taskId);
  if (error) {
    return { canStart: false, blockingTasks: [], error };
  }
  const stillBlocking = (blockingTasks || []).filter((t: any) => t?.status !== 'done');
  return {
    canStart: stillBlocking.length === 0,
    blockingTasks: stillBlocking,
    error: null,
  };
}

export async function canTaskStart(taskId: string): Promise<{
  canStart: boolean;
  blockingTasks: any[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase.rpc('task_can_start' as any, {
      p_task_id: taskId,
    } as any);

    if (error) {
      if (isMissingRpcError(error)) {
        console.warn('[task_can_start] RPC not present in pactdb — falling back to client-side check. Paste supabase/migrations/20260426_task_can_start_rpc.sql to enable the SECURITY DEFINER path.');
        return await canTaskStartFallback(taskId);
      }
      console.error('[task_can_start] RPC error:', error);
      return {
        canStart: false,
        blockingTasks: [],
        error: error.message || 'Failed to verify dependencies',
      };
    }

    const payload = (data ?? {}) as { can_start?: boolean; blocking?: any[] };
    const blocking = Array.isArray(payload.blocking) ? payload.blocking : [];
    const canStart = payload.can_start === true && blocking.length === 0;

    return {
      canStart,
      blockingTasks: blocking,
      error: null,
    };
  } catch (err: any) {
    if (isMissingRpcError(err)) {
      console.warn('[task_can_start] RPC missing — falling back to client-side check.');
      try { return await canTaskStartFallback(taskId); } catch { /* fall through */ }
    }
    console.error('Error checking if task can start:', err);
    return {
      canStart: false,
      blockingTasks: [],
      error: err?.message || 'Failed to check task status',
    };
  }
}
