import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield, Globe, Layers, Key, Database, Columns, Lock, Unlock,
  CheckCircle2, XCircle, AlertTriangle, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PAGE_DEFS, hasDefaultAccess } from '@/pages/PageAccessControl';
import { useSelectedUserAccess } from '@/context/role-management/SelectedUserAccessContext';
import { TabProps } from './types';
import { isHubTabSlug } from '@/lib/hub-tab-defs';

interface OverviewTabProps extends TabProps {
  onTabChange: (tab: string) => void;
}

const ROLE_DISPLAY: Record<string, string> = {
  superAdmin: 'Super Admin', admin: 'Admin', countryDirector: 'Country Director',
  ict: 'ICT', fom: 'Field Ops Manager', financialAdmin: 'Finance Admin',
  projectManager: 'Project Manager', seniorOperationsLead: 'Senior Ops Lead',
  supervisor: 'Supervisor', coordinator: 'Coordinator', dataTeam: 'Data Team',
  dataCollector: 'Data Collector', reviewer: 'Reviewer', auditor: 'Auditor',
};
const ROLE_COLORS: Record<string, string> = {
  superAdmin: 'bg-red-100 text-red-700', admin: 'bg-orange-100 text-orange-700',
  countryDirector: 'bg-amber-100 text-amber-700', ict: 'bg-purple-100 text-purple-700',
  fom: 'bg-indigo-100 text-indigo-700', financialAdmin: 'bg-yellow-100 text-yellow-700',
  projectManager: 'bg-blue-100 text-blue-700', supervisor: 'bg-teal-100 text-teal-700',
  coordinator: 'bg-emerald-100 text-emerald-700', dataTeam: 'bg-lime-100 text-lime-700',
  dataCollector: 'bg-green-100 text-green-700', auditor: 'bg-gray-100 text-gray-700',
};

export function OverviewTab({ userId, userRole, userName, isSelectedSuperAdmin, onTabChange }: OverviewTabProps) {
  const { loading, pageOverrides, permOverrides, columnConfigs, dataScopeRows, pageOvMap, effectivePage } = useSelectedUserAccess();

  const kpis = useMemo(() => {
    // Pages accessible = role-yes + explicitly granted
    const accessiblePages = PAGE_DEFS.filter(p => {
      const ov = pageOvMap[p.slug];
      if (ov?.is_blocked) return false;
      if (ov && !ov.is_blocked) return true;
      return hasDefaultAccess(p, userRole);
    });

    const pageBlocks = pageOverrides.filter(o => !isHubTabSlug(o.page_slug) && o.is_blocked);
    const pageGrants = pageOverrides.filter(o => !isHubTabSlug(o.page_slug) && !o.is_blocked);
    const tabOverrides = pageOverrides.filter(o => isHubTabSlug(o.page_slug));
    const columnRules = columnConfigs.filter(c => c.user_id === userId);
    const roleColumnRules = columnConfigs.filter(c => c.role === userRole);
    const userScopeRules = dataScopeRows.filter(d => d.user_id === userId);
    const roleScopeRules = dataScopeRows.filter(d => d.role === userRole);

    return {
      accessiblePages: accessiblePages.length,
      totalPages: PAGE_DEFS.length,
      pageBlocks: pageBlocks.length,
      pageGrants: pageGrants.length,
      tabOverrides: tabOverrides.length,
      actionOverrides: permOverrides.length,
      columnRules: columnRules.length + roleColumnRules.length,
      scopeRules: userScopeRules.length + roleScopeRules.length,
    };
  }, [pageOverrides, permOverrides, columnConfigs, dataScopeRows, pageOvMap, userRole, userId]);

  const recentPageChanges = useMemo(() => {
    return [...pageOverrides]
      .filter(o => !isHubTabSlug(o.page_slug))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [pageOverrides]);

  const recentPermChanges = useMemo(() => {
    return [...permOverrides]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [permOverrides]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      {/* SA lock notice */}
      {isSelectedSuperAdmin && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs dark:bg-red-950/20 dark:border-red-800/40 dark:text-red-300">
          <Shield className="h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Super Admin — Override Protection Active</span>
            <p className="opacity-70 mt-0.5">Super Admins always have full access. No overrides can be applied or viewed for this account.</p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={Globe}
          label="Pages Accessible"
          value={`${kpis.accessiblePages} / ${kpis.totalPages}`}
          sub={`${kpis.pageGrants} granted · ${kpis.pageBlocks} blocked`}
          color="blue"
          onClick={() => onTabChange('pages')}
        />
        <KpiCard
          icon={Layers}
          label="Tab Overrides"
          value={kpis.tabOverrides}
          sub={`custom hub-tab visibility rules`}
          color="purple"
          onClick={() => onTabChange('tabs')}
        />
        <KpiCard
          icon={Key}
          label="Action Overrides"
          value={kpis.actionOverrides}
          sub={`create/edit/delete/approve changes`}
          color="amber"
          onClick={() => onTabChange('permissions')}
        />
        <KpiCard
          icon={Database}
          label="Data Scope Rules"
          value={kpis.scopeRules}
          sub={`+ ${kpis.columnRules} column visibility rules`}
          color={kpis.scopeRules > 0 ? 'orange' : 'gray'}
          onClick={() => onTabChange('scope')}
        />
      </div>

      {/* Recent changes grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent page overrides */}
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Recent Page Overrides
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => onTabChange('pages')}>
              View all <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          <CardContent className="p-3 space-y-1.5">
            {recentPageChanges.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No page overrides</p>
            ) : recentPageChanges.map(ov => {
              const def = PAGE_DEFS.find(p => p.slug === ov.page_slug);
              return (
                <div key={ov.id} className="flex items-center gap-2 py-1">
                  {ov.is_blocked
                    ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  }
                  <p className="text-xs flex-1 truncate">{def?.label ?? ov.page_slug}</p>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    ov.is_blocked ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                  )}>
                    {ov.is_blocked ? 'Blocked' : 'Granted'}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Recent permission overrides */}
        <Card className="border-border/60">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="text-xs font-semibold flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5 text-muted-foreground" />
              Recent Action Overrides
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => onTabChange('permissions')}>
              View all <ChevronRight className="h-3 w-3 ml-0.5" />
            </Button>
          </div>
          <CardContent className="p-3 space-y-1.5">
            {recentPermChanges.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">No action overrides</p>
            ) : recentPermChanges.map(ov => (
              <div key={ov.id} className="flex items-center gap-2 py-1">
                {ov.is_granted
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                }
                <p className="text-xs flex-1 truncate font-mono">{ov.action} → {ov.resource}</p>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                  ov.is_granted ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                )}>
                  {ov.is_granted ? 'Granted' : 'Blocked'}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">QUICK ACTIONS</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => onTabChange('pages')}>
            <Globe className="h-3 w-3" /> Manage Page Access
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => onTabChange('tabs')}>
            <Layers className="h-3 w-3" /> Manage Tab Access
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => onTabChange('permissions')}>
            <Key className="h-3 w-3" /> Manage Permissions
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => onTabChange('scope')}>
            <Database className="h-3 w-3" /> Manage Data Scope
          </Button>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color, onClick }: {
  icon: any; label: string; value: string | number; sub: string;
  color: 'blue' | 'purple' | 'amber' | 'orange' | 'gray'; onClick: () => void;
}) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300',
    purple: 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300',
    amber:  'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
    orange: 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300',
    gray:   'bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <button onClick={onClick}
      className="text-left p-3 rounded-xl border border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all w-full">
      <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center mb-2', colorMap[color])}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-xl font-bold leading-none">{value}</p>
      <p className="text-[10px] font-semibold text-foreground mt-1">{label}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>
    </button>
  );
}
