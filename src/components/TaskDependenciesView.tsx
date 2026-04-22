import React, { useState, useEffect } from 'react';
import { getBlockingTasks, getDependentTasks, canTaskStart, removeTaskDependency } from '@/services/task-dependencies.service';
import { AlertCircle, CheckCircle, Link2, ArrowRight, Trash2, Lock } from 'lucide-react';

interface TaskLink {
  dependencyId: string;
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  leadTimeDays: number;
}

interface TaskDependenciesViewProps {
  taskId: string;
  readonly?: boolean;
}

export const TaskDependenciesView: React.FC<TaskDependenciesViewProps> = ({
  taskId,
  readonly = false,
}) => {
  const [blockingTasks, setBlockingTasks] = useState<TaskLink[]>([]);
  const [dependentTasks, setDependentTasks] = useState<TaskLink[]>([]);
  const [canStart, setCanStart] = useState(true);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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

    if (!blocking.error) {
      setBlockingTasks(blocking.blockingTasks);
    }
    if (!dependent.error) {
      setDependentTasks(dependent.dependentTasks);
    }
    if (!startCheck.error) {
      setCanStart(startCheck.canStart);
    }
    setLoading(false);
  };

  const handleDeleteDependency = async (dependencyId: string) => {
    if (!confirm('Remove this dependency?')) return;

    setDeleting(dependencyId);
    const { success, message } = await removeTaskDependency(dependencyId);
    if (success) {
      await loadDependencies();
    } else {
      alert(`Error: ${message}`);
    }
    setDeleting(null);
  };

  const getStatusBadgeColor = (status: string): string => {
    switch (status) {
      case 'done':
        return 'bg-green-100 text-green-800';
      case 'inprogress':
        return 'bg-blue-100 text-blue-800';
      case 'on_hold':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'high':
        return 'text-red-600';
      case 'medium':
        return 'text-orange-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-600';
    }
  };

  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading dependencies...</div>;
  }

  return (
    <div className="space-y-6">
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
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ArrowRight className="h-4 w-4" />
            Blocking Tasks ({blockingTasks.length})
          </h4>
          <div className="space-y-2">
            {blockingTasks.map((task) => (
              <div
                key={task.dependencyId}
                className="border border-gray-200 rounded-lg p-3 flex items-start justify-between hover:bg-gray-50 transition"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {task.status === 'done' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    )}
                    <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                    <span className={`px-2 py-0.5 rounded font-medium ${getStatusBadgeColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`font-medium ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span>
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {task.leadTimeDays > 0 && (
                      <span className="text-blue-600">+{task.leadTimeDays}d lead</span>
                    )}
                  </div>
                </div>
                {!readonly && (
                  <button
                    onClick={() => handleDeleteDependency(task.dependencyId)}
                    disabled={deleting === task.dependencyId}
                    className="ml-2 p-1.5 text-gray-400 hover:text-red-600 disabled:text-gray-300 transition flex-shrink-0"
                    title="Remove dependency"
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
          <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Dependent Tasks ({dependentTasks.length})
          </h4>
          <div className="space-y-2">
            {dependentTasks.map((task) => (
              <div
                key={task.dependencyId}
                className="border border-gray-200 rounded-lg p-3 flex items-start justify-between hover:bg-gray-50 transition"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {task.status === 'done' ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                    )}
                    <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                    <span className={`px-2 py-0.5 rounded font-medium ${getStatusBadgeColor(task.status)}`}>
                      {task.status}
                    </span>
                    <span className={`font-medium ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                    {task.dueDate && (
                      <span>
                        Due: {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    {task.leadTimeDays > 0 && (
                      <span className="text-blue-600">-{task.leadTimeDays}d before</span>
                    )}
                  </div>
                </div>
                {!readonly && (
                  <button
                    onClick={() => handleDeleteDependency(task.dependencyId)}
                    disabled={deleting === task.dependencyId}
                    className="ml-2 p-1.5 text-gray-400 hover:text-red-600 disabled:text-gray-300 transition flex-shrink-0"
                    title="Remove dependency"
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
        <div className="text-center py-6 text-gray-500">
          <Link2 className="mx-auto h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm">No dependencies configured for this task</p>
        </div>
      )}
    </div>
  );
};
