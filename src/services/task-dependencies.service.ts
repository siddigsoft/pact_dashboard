import { supabase } from '@/lib/supabase';
import { Database } from '@/types/supabase';

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
 */
export async function getBlockingTasks(
  taskId: string
): Promise<{
  blockingTasks: any[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('task_dependencies')
      .select(
        `
        id,
        dependency_type,
        lead_time_days,
        parent_task_id,
        personal_tasks:parent_task_id(id, title, status, due_date, priority)
      `
      )
      .eq('dependent_task_id', taskId)
      .in('dependency_type', ['blocks', 'blocked_by']);

    if (error) return { blockingTasks: [], error: error.message };

    const blockingTasks = (data || [])
      .filter((d: any) => d.personal_tasks)
      .map((d: any) => ({
        ...d.personal_tasks,
        dependencyId: d.id,
        leadTimeDays: d.lead_time_days,
      }));

    return { blockingTasks, error: null };
  } catch (err) {
    console.error('Error fetching blocking tasks:', err);
    return { blockingTasks: [], error: 'Failed to fetch blocking tasks' };
  }
}

/**
 * Get dependent tasks (that depend on this task)
 */
export async function getDependentTasks(
  taskId: string
): Promise<{
  dependentTasks: any[];
  error: string | null;
}> {
  try {
    const { data, error } = await supabase
      .from('task_dependencies')
      .select(
        `
        id,
        dependency_type,
        lead_time_days,
        dependent_task_id,
        personal_tasks:dependent_task_id(id, title, status, due_date, priority)
      `
      )
      .eq('parent_task_id', taskId)
      .in('dependency_type', ['blocks', 'blocked_by']);

    if (error) return { dependentTasks: [], error: error.message };

    const dependentTasks = (data || [])
      .filter((d: any) => d.personal_tasks)
      .map((d: any) => ({
        ...d.personal_tasks,
        dependencyId: d.id,
        leadTimeDays: d.lead_time_days,
      }));

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
    let query = supabase.from('task_dependencies').select(
      `
      *,
      parent_tasks:parent_task_id(id, title, priority, status, due_date),
      dependent_tasks:dependent_task_id(id, title, priority, status, due_date)
    `
    );

    if (taskIds && taskIds.length > 0) {
      query = query.or(
        `parent_task_id.in.(${taskIds.join(',')}),dependent_task_id.in.(${taskIds.join(',')})`
      );
    }

    const { data, error } = await query;

    if (error) return { graph: null, error: error.message };

    const nodes = new Map<string, DependencyNode>();
    const edges: Array<{ from: string; to: string; type: string }> = [];

    // Build nodes and edges
    (data || []).forEach((dep: any) => {
      const parentId = dep.parent_task_id;
      const dependentId = dep.dependent_task_id;

      if (!nodes.has(parentId)) {
        nodes.set(parentId, {
          taskId: parentId,
          taskName: dep.parent_tasks?.title,
          priority: dep.parent_tasks?.priority,
          status: dep.parent_tasks?.status,
          dueDate: dep.parent_tasks?.due_date,
          dependencies: [],
          dependents: [],
          isBlocking: true,
          isCriticalPath: false,
        });
      }

      if (!nodes.has(dependentId)) {
        nodes.set(dependentId, {
          taskId: dependentId,
          taskName: dep.dependent_tasks?.title,
          priority: dep.dependent_tasks?.priority,
          status: dep.dependent_tasks?.status,
          dueDate: dep.dependent_tasks?.due_date,
          dependencies: [],
          dependents: [],
          isBlocking: false,
          isCriticalPath: false,
        });
      }

      // Update relationships
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
 * Check if a task can start (all dependencies met)
 */
export async function canTaskStart(taskId: string): Promise<{
  canStart: boolean;
  blockingTasks: any[];
  error: string | null;
}> {
  try {
    const { blockingTasks, error } = await getBlockingTasks(taskId);

    if (error || !blockingTasks) {
      return { canStart: false, blockingTasks: [], error };
    }

    const incompleteTasks = blockingTasks.filter((t) => t.status !== 'done');

    return {
      canStart: incompleteTasks.length === 0,
      blockingTasks: incompleteTasks,
      error: null,
    };
  } catch (err) {
    console.error('Error checking if task can start:', err);
    return { canStart: false, blockingTasks: [], error: 'Failed to check task status' };
  }
}
