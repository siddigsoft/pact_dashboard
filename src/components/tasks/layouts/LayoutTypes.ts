import type { PersonalTask, PersonalTaskPriority, PersonalTaskStatus, AssignedProjectTask } from '@/hooks/usePersonalTasks';

export type { PersonalTask, PersonalTaskPriority, PersonalTaskStatus, AssignedProjectTask };

export interface TaskLayoutProps {
  tasks: PersonalTask[];
  allTasks: PersonalTask[];
  projectTasks: AssignedProjectTask[];
  isLoading: boolean;
  isUpdating: boolean;
  onToggleDone: (task: PersonalTask) => void;
  onEdit: (task: PersonalTask) => void;
  onAdd: () => void;
  currentUser: {
    fullName?: string | null;
    id?: string;
    role?: string | null;
  } | null;
  stats: {
    all: number;
    todo: number;
    inprogress: number;
    overdue: number;
    done: number;
  };
}

export type LayoutId = 1 | 2 | 3 | 4 | 5;

export const LAYOUT_META: Record<LayoutId, { label: string; icon: string; description: string }> = {
  1: { label: 'Command Split',   icon: 'Columns2',   description: 'Timeline + Priority stack' },
  2: { label: 'Mission Tabs',    icon: 'Layers',     description: 'Tabbed task grid' },
  3: { label: 'Board & Gantt',   icon: 'GanttChart', description: '14-day Gantt + Kanban' },
  4: { label: 'Eisenhower Matrix', icon: 'LayoutGrid', description: 'Priority quadrants' },
  5: { label: 'Daily Ops',       icon: 'Sun',        description: 'Column view + daily strip' },
};
