import React from 'react';
import { X, Eye } from 'lucide-react';
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

function roleLabel(role: string): string {
  const key = role.toLowerCase().replace(/[\s_-]/g, '');
  return ROLE_LABEL[key] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export const ViewAsBanner: React.FC = () => {
  const { viewAs, clearViewAs } = useViewAs();
  if (!viewAs) return null;

  return (
    <div className="sticky top-0 z-[60] w-full flex items-center justify-between gap-3 bg-amber-400 dark:bg-amber-500 px-4 py-2 shadow-md">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 text-amber-900 shrink-0" />
        <span className="text-sm font-semibold text-amber-900 truncate">
          Previewing as{' '}
          <span className="font-bold">
            {viewAs.mode === 'user'
              ? `${viewAs.displayName} (${roleLabel(viewAs.role)})`
              : roleLabel(viewAs.role)}
          </span>
          {' '}— navigation and permissions reflect this role.
        </span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        onClick={clearViewAs}
        className="shrink-0 h-7 px-3 text-amber-900 hover:bg-amber-300 dark:hover:bg-amber-600 font-semibold text-xs gap-1.5"
        data-testid="button-exit-view-as"
      >
        <X className="h-3.5 w-3.5" />
        Exit Preview
      </Button>
    </div>
  );
};
