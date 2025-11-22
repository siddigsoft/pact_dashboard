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

      {/* Sidebar Navigation */}
      <aside 
        className={cn(
          "fixed lg:sticky top-16 left-0 h-[calc(100vh-4rem)] bg-card border-r z-40 transition-transform duration-300",
          "flex flex-col w-64 p-4 space-y-2",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground px-3">Dashboard Zones</h3>
        </div>

        {availableZones.map((zone) => {
          const Icon = zone.icon;
          const isActive = activeZone === zone.id;

          return (
            <Button
              key={zone.id}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-3 h-auto py-3",
                isActive && "bg-muted"
              )}
              onClick={() => {
                onZoneChange(zone.id);
                setMobileNavOpen(false);
              }}
              data-testid={`button-zone-${zone.id}`}
            >
              <Icon className={cn("h-5 w-5", zone.color)} />
              <div className="flex flex-col items-start flex-1">
                <span className="font-medium">{zone.label}</span>
                <span className="text-xs text-muted-foreground">
                  {zone.description}
                </span>
              </div>
              {isActive && (
                <div className="w-1.5 h-8 bg-primary rounded-full" />
              )}
            </Button>
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
