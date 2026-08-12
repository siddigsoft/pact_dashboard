/**
 * SuperAdminButtonRegistry
 * Embedded inside the Super Admin Hub → Permissions & Audit → "Button Registry" tab.
 *
 * Surfaces the ModuleControlCenter (complete module → page → button/action permission matrix)
 * directly inside the Super Admin Hub so super-admins can see EVERY button in the platform
 * and audit which roles have access.
 *
 * Read-only view here — to toggle role-level permissions go to Role Management.
 * For per-user action overrides go to the Access Manager → Permissions tab.
 *
 * Drift detection: on mount the component compares MODULE_REGISTRY against PAGE_DEFS and
 * shows a warning banner when pages exist in PAGE_DEFS but are absent from the registry.
 */

import { useState, useMemo } from 'react';
import { Shield, LayoutGrid, ExternalLink, AlertTriangle, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { ModuleControlCenter } from '@/components/role-management/ModuleControlCenter';
import { getRegistryDriftReport, groupDriftedPages } from '@/lib/registry-drift';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

// Compute once at module load — pure function, no side-effects.
const DRIFT_REPORT = getRegistryDriftReport();

// ── Drift warning banner ──────────────────────────────────────────────────────
function DriftBanner() {
  const [dismissed, setDismissed] = useState(false);
  const [expanded,  setExpanded]  = useState(false);

  const grouped = useMemo(() => groupDriftedPages(DRIFT_REPORT.driftedPages), []);

  if (!DRIFT_REPORT.isDrifted || dismissed) return null;

  const { driftedPages, trackedCount, totalTrackableCount, coveragePercent } = DRIFT_REPORT;

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700 overflow-hidden">
      {/* Header row */}
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Registry coverage: {coveragePercent}% &nbsp;
            <span className="font-normal">
              ({trackedCount} of {totalTrackableCount} trackable pages have action entries)
            </span>
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            {driftedPages.length} page{driftedPages.length !== 1 ? 's' : ''} in the platform are not yet represented in MODULE_REGISTRY — the Button Registry silently omits their actions.
            To fix, add the missing pages with their actions to&nbsp;
            <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 rounded">src/types/moduleRegistry.ts</code>.
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400 hover:underline px-1"
          >
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {expanded ? 'Hide' : 'Show'} list
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 p-0.5 rounded"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable page list */}
      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-700 px-4 py-3 space-y-3 max-h-72 overflow-y-auto">
          {Object.entries(grouped).map(([group, pages]) => (
            <div key={group}>
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
                {group} ({pages.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pages.map(p => (
                  <Badge
                    key={p.slug}
                    variant="outline"
                    className="text-[11px] border-amber-300 dark:border-amber-600 text-amber-800 dark:text-amber-300 font-mono"
                    title={p.path}
                  >
                    {p.label}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function SuperAdminButtonRegistry() {
  const { isSuperAdmin } = useSuperAdmin();
  const navigate         = useNavigate();

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Shield className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">Only super-admins can view the button registry.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/20">
            <LayoutGrid className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Button & Permission Registry</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every module → page → button across the platform with per-role permission status
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/role-management')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Edit Role Permissions
          </Button>
        </div>
      </div>

      {/* Drift warning — shown whenever MODULE_REGISTRY doesn't cover all PAGE_DEFS pages */}
      <DriftBanner />

      {/* Info strip */}
      <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <span>Role has this permission</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-muted border" />
          <span>Role does not have this permission</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <span>Super Admin only</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-orange-400" />
          <span>Destructive action</span>
        </div>
        <span className={cn('ml-auto text-xs', DRIFT_REPORT.isDrifted ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-muted-foreground')}>
          {DRIFT_REPORT.coveragePercent}% page coverage ·{' '}
          {DRIFT_REPORT.trackedCount}/{DRIFT_REPORT.totalTrackableCount} pages tracked ·{' '}
          Read-only · Toggle permissions in Role Management
        </span>
      </div>

      {/* The full matrix */}
      <ModuleControlCenter canEdit={false} />
    </div>
  );
}
