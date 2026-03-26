import React from 'react';
import { cn } from '@/lib/utils';
import { 
  ClipboardList, 
  Users, 
  Calendar, 
  Briefcase,
  MapPin,
  FolderKanban
} from 'lucide-react';
import { useAppContext } from '@/shared/context/AppContext';
import { DashboardCommandBar } from './DashboardCommandBar';
import { MmpGlobalFilter } from '@/features/dashboard/components/filters/MmpGlobalFilter';

export type DashboardZone = 'operations' | 'team' | 'planning' | 'fom' | 'data-collector' | 'project-manager';

interface DashboardZoneLayoutProps {
  activeZone: DashboardZone;
  onZoneChange: (zone: DashboardZone) => void;
  children: React.ReactNode;
}

const zones = [
  {
    id: 'fom' as DashboardZone,
    label: 'FOM Dashboard',
    icon: Briefcase,
    description: 'Field operations manager',
    color: 'text-purple-500',
    roles: ['fom', 'fieldoperationmanager']
  },
  {
    id: 'data-collector' as DashboardZone,
    label: 'My Visits',
    icon: MapPin,
    description: 'Data collector',
    color: 'text-green-500',
    roles: ['datacollector', 'datacollector']
  },
  {
    id: 'operations' as DashboardZone,
    label: 'Operations',
    icon: ClipboardList,
    description: 'Field operations',
    color: 'text-blue-500',
    roles: ['admin', 'supervisor', 'coordinator']
  },
  {
    id: 'team' as DashboardZone,
    label: 'Team',
    icon: Users,
    description: 'Team coordination',
    color: 'text-purple-500',
    roles: ['admin', 'fom', 'supervisor', 'coordinator']
  },
  {
    id: 'planning' as DashboardZone,
    label: 'Planning',
    icon: Calendar,
    description: 'Strategic planning',
    color: 'text-green-500',
    roles: ['admin', 'fom', 'ict']
  },
  {
    id: 'project-manager' as DashboardZone,
    label: 'Project Manager',
    icon: FolderKanban,
    description: 'Project oversight',
    color: 'text-indigo-500',
    roles: ['admin', 'projectmanager']
  }
];

export const DashboardZoneLayout: React.FC<DashboardZoneLayoutProps> = ({
  activeZone,
  onZoneChange,
  children
}) => {
  const { roles } = useAppContext();

  const normalizeRoleForMatch = (role: string): string => {
    return role.toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[()]/g, '');
  };

  const hasRoleAccess = (zoneRoles: string[]) => {
    return roles?.some(r => {
      const normalized = normalizeRoleForMatch(r);
      return zoneRoles.some(zr => normalized.includes(zr) || zr === normalized);
    }) ?? false;
  };

  const availableZones = zones.filter(z => hasRoleAccess(z.roles));
  return (
    <div className="flex flex-col h-full">
      {/* Command Bar */}
      <div className="sticky top-0 z-50 hidden sm:block">
        <DashboardCommandBar />
      </div>

      {/* Zone Navigation */}
      <nav className="sticky top-0 sm:top-[41px] z-40 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-5 h-11">
          {/* Zone tabs */}
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide h-full">
            {availableZones.map((zone) => {
              const Icon = zone.icon;
              const isActive = activeZone === zone.id;
              return (
                <button
                  key={zone.id}
                  onClick={() => onZoneChange(zone.id)}
                  data-testid={`button-zone-${zone.id}`}
                  className={cn(
                    "relative flex items-center gap-1.5 px-3 h-full text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0",
                    isActive
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  )}
                >
                  <Icon className={cn("h-3.5 w-3.5", isActive ? zone.color : "")} />
                  <span className="hidden sm:inline">{zone.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-t-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* MMP Filter */}
          <div className="flex items-center gap-2 shrink-0 pl-4">
            <MmpGlobalFilter />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 px-4 pt-5 pb-16 lg:px-6 lg:pt-6 lg:pb-20 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        <div className="mx-auto w-full max-w-[1500px] px-1 sm:px-2 lg:px-3">
          {children}
        </div>
      </main>
    </div>
  );
};
