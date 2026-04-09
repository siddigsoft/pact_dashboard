import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { 
  ClipboardList, 
  Users, 
  Calendar, 
  Briefcase,
  MapPin,
  FolderKanban,
  AlertTriangle,
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { MmpGlobalFilter } from './filters/MmpGlobalFilter';
import { ConnectionStatus } from './ConnectionStatus';
import { useLiveDashboard } from '@/hooks/useLiveDashboard';
import { useGlobalPresence } from '@/context/presence/GlobalPresenceContext';
import { Button } from '@/components/ui/button';
import { OnlineUsersPanel } from './OnlineUsersPanel';
import { EmergencySOS } from '@/components/mobile/EmergencySOS';

export type DashboardZone = 'operations' | 'team' | 'planning' | 'fom' | 'data-collector' | 'project-manager' | 'employee';

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
  const { isConnected, channels, totalEvents, lastUpdate } = useLiveDashboard();
  const { onlineUserIds } = useGlobalPresence();
  const [showOnlinePanel, setShowOnlinePanel] = useState(false);
  const [showSOS, setShowSOS] = useState(false);

  const onlineCount = onlineUserIds.length;

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
      {/* Unified Command + Zone Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between px-3 h-11 gap-2">

          {/* Left: Zone tabs (scrollable) */}
          <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide h-full flex-1 min-w-0">
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

          {/* Right: Online · SOS · Live status · MMP Filter */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Online users */}
            <button
              onClick={() => setShowOnlinePanel(true)}
              className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-sm"
              data-testid="button-online-users"
            >
              <span className="relative flex h-2 w-2">
                {onlineCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                <span className={cn("relative inline-flex rounded-full h-2 w-2", onlineCount > 0 ? "bg-green-500" : "bg-gray-400")} />
              </span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{onlineCount}</span>
              <span className="text-xs text-gray-400 hidden md:inline">online</span>
            </button>

            {/* SOS */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSOS(true)}
              className="h-7 px-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 gap-1 text-xs"
              data-testid="button-quick-sos"
              title="Emergency SOS"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="hidden md:inline">SOS</span>
            </Button>

            {/* Live connection status */}
            <ConnectionStatus
              isConnected={isConnected}
              channelCount={channels}
              lastUpdate={lastUpdate}
              totalEvents={totalEvents}
            />

            {/* Divider */}
            <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 mx-1" />

            {/* MMP Filter */}
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

      <OnlineUsersPanel isOpen={showOnlinePanel} onClose={() => setShowOnlinePanel(false)} />
      <EmergencySOS isVisible={showSOS} onClose={() => setShowSOS(false)} />
    </div>
  );
};
