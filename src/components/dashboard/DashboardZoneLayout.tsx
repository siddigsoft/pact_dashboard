import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardList, 
  Users, 
  Calendar, 
  Shield, 
  TrendingUp,
  Menu,
  X
} from 'lucide-react';
import { useAppContext } from '@/context/AppContext';

export type DashboardZone = 'operations' | 'team' | 'planning' | 'compliance' | 'performance';

interface DashboardZoneLayoutProps {
  activeZone: DashboardZone;
  onZoneChange: (zone: DashboardZone) => void;
  children: React.ReactNode;
}

const zones = [
  {
    id: 'operations' as DashboardZone,
    label: 'Operations',
    icon: ClipboardList,
    description: 'Field operations',
    color: 'text-blue-500',
    roles: ['admin', 'fom', 'supervisor', 'coordinator']
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
  }
];

export const DashboardZoneLayout: React.FC<DashboardZoneLayoutProps> = ({
  activeZone,
  onZoneChange,
  children
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { roles } = useAppContext();

  const hasRoleAccess = (zoneRoles: string[]) => {
    if (roles?.some(r => r.toLowerCase() === 'admin')) return true;
    return roles?.some(r => zoneRoles.includes(r.toLowerCase()));
  };

  const availableZones = zones.filter(z => hasRoleAccess(z.roles));

  return (
    <div className="flex h-full w-full">
      {/* Mobile Navigation Toggle */}
      <div className="lg:hidden fixed top-20 left-4 z-50">
        <Button
          size="icon"
          variant="outline"
          onClick={() => setMobileNavOpen(!mobileNavOpen)}
          data-testid="button-mobile-nav-toggle"
        >
          {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </Button>
      </div>

      {/* Sidebar Navigation - Compact Tech Style */}
      <aside 
        className={cn(
          "fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] bg-gradient-to-b from-card via-card to-muted/20 border-r border-border/50 z-40 transition-all duration-300 backdrop-blur-sm",
          "flex flex-col w-56 lg:w-64 p-3 space-y-1.5 shadow-lg",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="mb-2 px-2">
          <h3 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Command Zones</h3>
          <div className="h-px bg-gradient-to-r from-primary/50 via-primary to-transparent mt-1" />
        </div>

        {availableZones.map((zone) => {
          const Icon = zone.icon;
          const isActive = activeZone === zone.id;

          return (
            <button
              key={zone.id}
              onClick={() => {
                onZoneChange(zone.id);
                setMobileNavOpen(false);
              }}
              data-testid={`button-zone-${zone.id}`}
              className={cn(
                "group relative w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-200",
                "border border-transparent hover:border-border/50",
                isActive 
                  ? "bg-gradient-to-r from-primary/20 to-primary/10 border-primary/30 shadow-sm" 
                  : "hover:bg-muted/50 hover-elevate"
              )}
            >
              {/* Active Indicator */}
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-gradient-to-b from-primary via-primary to-primary/50 rounded-r-full" />
              )}
              
              {/* Icon with glow effect when active */}
              <div className={cn(
                "flex items-center justify-center w-8 h-8 rounded-md transition-all",
                isActive 
                  ? "bg-background shadow-sm ring-1 ring-primary/20" 
                  : "bg-muted/50 group-hover:bg-background"
              )}>
                <Icon className={cn(
                  "h-4 w-4 transition-colors",
                  isActive ? zone.color : "text-muted-foreground group-hover:text-foreground"
                )} />
              </div>
              
              {/* Text Content */}
              <div className="flex flex-col items-start flex-1 min-w-0">
                <span className={cn(
                  "text-sm font-semibold truncate",
                  isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  {zone.label}
                </span>
                <span className="text-[10px] text-muted-foreground truncate uppercase tracking-wide">
                  {zone.description}
                </span>
              </div>
              
              {/* Arrow indicator for active */}
              {isActive && (
                <div className="flex-shrink-0">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                </div>
              )}
            </button>
          );
        })}
      </aside>

      {/* Mobile Overlay */}
      {mobileNavOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        {children}
      </main>
    </div>
  );
};
