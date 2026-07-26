import React from 'react';
import { X, Eye, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useViewAs } from '@/context/ViewAsContext';

const ROLE_LABEL: Record<string, string> = {
  superadmin:       'Super Admin',
  admin:            'Admin',
  ict:              'ICT',
  fom:              'Field Ops Manager',
  financialadmin:   'Financial Admin',
  financialauditor: 'Financial Auditor',
  auditor:          'Financial Auditor',
  supervisor:       'Supervisor',
  hubsupervisor:    'Hub Supervisor',
  coordinator:      'Coordinator',
  datacollector:    'Data Collector',
  datateam:         'Data Team',
  countrydirector:  'Country Director',
  projectmanager:   'Project Manager',
  employee:         'Employee',
  hr:               'HR',
  hrmanager:        'HR Manager',
};

const ROLE_COLOR: Record<string, string> = {
  datacollector:    'bg-blue-600',
  coordinator:      'bg-indigo-600',
  supervisor:       'bg-violet-600',
  fom:              'bg-purple-600',
  countrydirector:  'bg-rose-600',
  projectmanager:   'bg-orange-600',
  admin:            'bg-slate-700',
  financialadmin:   'bg-emerald-600',
  auditor:          'bg-amber-700',
  financialauditor: 'bg-amber-700',
  datateam:         'bg-cyan-600',
  ict:              'bg-teal-600',
  employee:         'bg-gray-500',
};

function roleLabel(role: string): string {
  const key = role.toLowerCase().replace(/[\s_-]/g, '');
  return ROLE_LABEL[key] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

function roleColor(role: string): string {
  const key = role.toLowerCase().replace(/[\s_-]/g, '');
  return ROLE_COLOR[key] ?? 'bg-slate-600';
}

export const ViewAsBanner: React.FC = () => {
  const { viewAs, clearViewAs, requestOpenPicker } = useViewAs();
  if (!viewAs) return null;

  const roleName = roleLabel(viewAs.role);
  const initials = viewAs.displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="sticky top-0 z-[60] w-full flex items-center gap-2.5 bg-amber-400 dark:bg-amber-500 px-3 py-1.5 shadow-md">
      <div className={`shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold ${roleColor(viewAs.role)}`}>
        {viewAs.mode === 'user' ? initials : <Eye className="h-2.5 w-2.5" />}
      </div>

      <div className="flex-1 min-w-0 leading-tight">
        <span className="text-xs font-semibold text-amber-900 truncate block">
          Previewing as{' '}
          <strong>
            {viewAs.mode === 'user'
              ? `${viewAs.displayName} · ${roleName}`
              : roleName}
          </strong>
          <span className="font-normal opacity-80"> — sidebar and controls reflect this role</span>
        </span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={requestOpenPicker}
          className="h-6 px-2 text-amber-900 hover:bg-amber-300 dark:hover:bg-amber-600 font-semibold text-[10px] gap-1"
          data-testid="button-switch-view-as"
        >
          <ArrowLeftRight className="h-2.5 w-2.5" />
          Switch
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={clearViewAs}
          className="h-6 px-2 text-amber-900 hover:bg-amber-300 dark:hover:bg-amber-600 font-semibold text-[10px] gap-1"
          data-testid="button-exit-view-as"
        >
          <X className="h-2.5 w-2.5" />
          Exit
        </Button>
      </div>
    </div>
  );
};
