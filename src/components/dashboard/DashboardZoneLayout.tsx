import React from 'react';
import { cn } from '@/lib/utils';
import { 
  ClipboardList, 
  Users, 
  Calendar, 
  Shield, 
  TrendingUp,
  Briefcase,
  MapPin,
  DollarSign,
  Server,
  FolderKanban
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { DashboardCommandBar } from './DashboardCommandBar';

export type DashboardZone = 'operations' | 'team' | 'planning' | 'compliance' | 'performance' | 'fom' | 'data-collector' | 'financial' | 'ict' | 'project-manager';

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
    id: 'compliance' as DashboardZone,
    label: 'Compliance',
    icon: Shield,
    description: 'Risk & compliance',
    color: 'text-orange-500',
    roles: ['admin', 'ict', 'reviewer']
  },
  {
    id: 'performance' as DashboardZone,
    label: 'Performance',
    icon: TrendingUp,
    description: 'Analytics & goals',
    color: 'text-indigo-500',
    roles: ['admin', 'fom', 'financialadmin']
  },
  {
    id: 'financial' as DashboardZone,
    label: 'Financial',
    icon: DollarSign,
    description: 'Budget & costs',
    color: 'text-green-500',
    roles: ['admin', 'financialadmin']
  },
  {
    id: 'ict' as DashboardZone,
    label: 'ICT',
    icon: Server,
    description: 'System health',
    color: 'text-cyan-500',
    roles: ['admin', 'ict']
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
      {/* Command Bar - Top most */}
      <div className="sticky top-0 z-50 border-b border-border/50">
        <DashboardCommandBar />
      </div>

      {/* Horizontal Zone Navigation - Tech Style */}
      <nav className="sticky top-[49px] z-40 bg-gradient-to-r from-card via-background to-card border-b border-border/50 backdrop-blur-sm shadow-sm">
        <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-hide">
          <div className="flex-shrink-0 mr-2 hidden md:block">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Zones:</span>
          </div>
          
          {availableZones.map((zone) => {
            const Icon = zone.icon;
            const isActive = activeZone === zone.id;

            return (
              <button
                key={zone.id}
                onClick={() => onZoneChange(zone.id)}
                data-testid={`button-zone-${zone.id}`}
                className={cn(
                  "group relative flex items-center gap-2 px-3 py-1.5 rounded-md transition-all duration-200 flex-shrink-0",
                  "border border-transparent hover:border-border/50",
                  isActive 
                    ? "bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30 shadow-sm" 
                    : "hover:bg-muted/50 hover-elevate"
                )}
              >
                {/* Active Indicator Bottom Line */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent rounded-full" />
                )}
                
                {/* Icon */}
                <div className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md transition-all",
                  isActive 
                    ? "bg-background shadow-sm ring-1 ring-primary/20" 
                    : "bg-muted/50 group-hover:bg-background"
                )}>
                  <Icon className={cn(
                    "h-3.5 w-3.5 transition-colors",
                    isActive ? zone.color : "text-muted-foreground group-hover:text-foreground"
                  )} />
                </div>
                
                {/* Text Content - Hidden on mobile */}
                <div className="hidden sm:flex flex-col items-start">
                  <span className={cn(
                    "text-xs font-semibold whitespace-nowrap",
                    isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                  )}>
                    {zone.label}
                  </span>
                </div>
                
                {/* Active Pulse Dot */}
                {isActive && (
                  <div className="flex-shrink-0 hidden sm:block">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main Content Area - Scrollable */}
      <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
        {children}
      </main>
    </div>
  );
};
