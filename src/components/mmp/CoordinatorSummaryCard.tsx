import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Users, User, MapPin, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Clock, XCircle, Wallet, Plus, Pencil, FileText } from 'lucide-react';
import MmpStateReport from '@/components/mmp/MmpStateReport';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';

const cleanName = (raw: any): string => {
  if (!raw) return '';
  const s = String(raw).trim();
  return s.replace(/^["']|["']$/g, '').trim();
};

interface AdvanceInfo {
  id: string;
  status: string;
  requestedAmount: number;
  approvedAmount: number;
  totalPaid: number;
  justification?: string;
}

interface SiteStatusDetail {
  id: string;
  name: string;
  siteCode: string;
  status: string;
  statusLabel: string;
  statusCategory: 'verified' | 'returned' | 'rejected' | 'in_progress' | 'pending';
  locality: string;
  stateName: string;
  hubName: string;
  transportBudget?: number;
  reason: string;
  actionBy: string;
  actionAt: string;
  claimedBy: string;
}

interface CoordinatorInfo {
  id: string;
  name: string;
  sitesAssigned: number;
  sitesVerified: number;
  sitesReturned: number;
  sitesInProgress: number;
  sitesPending: number;
  /** Per-status counts for this coordinator (exact status values, lowercase) */
  statusCounts: Record<string, number>;
  receivedAt?: string;
  siteDetails: SiteStatusDetail[];
}

interface StateCoordinatorGroup {
  state: string;
  coordinators: CoordinatorInfo[];
  totalSites: number;
  verifiedSites: number;
  returnedSites: number;
  inProgressSites: number;
  pendingSites: number;
  /** Per-status counts for the whole state */
  statusCounts: Record<string, number>;
}

// ─── Status display helpers ───────────────────────────────────────────────────
const STATUS_DISPLAY_CFG: Record<string, { label: string; color: string }> = {
  completed:                  { label: 'Completed',        color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  verified:                   { label: 'Verified',         color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  approved:                   { label: 'Approved',         color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  'approved and costed':      { label: 'Approved & Costed',color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  wfp_confirmed:              { label: 'WFP Confirmed',    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  submitted:                  { label: 'Submitted',        color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  accepted:                   { label: 'Accepted',         color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  dispatched:                 { label: 'Dispatched',       color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  assigned:                   { label: 'Assigned',         color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  in_progress:                { label: 'In Progress',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  permits_attached:           { label: 'Permits Attached', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  forwarded_to_coordinator:   { label: 'With Coordinator', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  forwarded_to_coordinators:  { label: 'With Coordinators',color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  pending:                    { label: 'Pending',          color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  not_covered:                { label: 'Not Covered',      color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  returned_to_fom:            { label: 'Returned',         color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  returned:                   { label: 'Returned',         color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  recalled:                   { label: 'Recalled',         color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  rejected:                   { label: 'Rejected',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  cancelled:                  { label: 'Cancelled',        color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};
const STATUS_DISPLAY_ORDER = [
  'completed','verified','approved','approved and costed','wfp_confirmed','submitted',
  'accepted','dispatched','assigned','in_progress','permits_attached',
  'forwarded_to_coordinator','forwarded_to_coordinators',
  'pending','not_covered','returned_to_fom','returned','recalled','rejected','cancelled',
];
function getStatusCfg(s: string) {
  return STATUS_DISPLAY_CFG[s] ?? {
    label: s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };
}
/** Returns [ [status, count], ... ] sorted by STATUS_DISPLAY_ORDER then alphabetically */
function sortedStatusEntries(counts: Record<string, number>): [string, number][] {
  const ordered = STATUS_DISPLAY_ORDER
    .filter(s => (counts[s] ?? 0) > 0)
    .map(s => [s, counts[s]] as [string, number]);
  const extra = Object.entries(counts)
    .filter(([s, n]) => n > 0 && !STATUS_DISPLAY_ORDER.includes(s))
    .sort(([a], [b]) => a.localeCompare(b));
  return [...ordered, ...extra];
}

interface CoordinatorSummaryCardProps {
  siteEntries: any[];
  mmpId?: string;
  mmpName?: string;
}

const ADVANCE_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_supervisor: { label: 'Advance: Pending Supervisor', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  pending_admin:      { label: 'Advance: Pending Admin',      color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  approved:           { label: 'Advance: Approved',           color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  finance_processing: { label: 'Advance: Finance Processing', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  fully_paid:         { label: 'Advance: Fully Paid',         color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  partially_paid:     { label: 'Advance: Partially Paid',     color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  cancelled:          { label: 'Advance: Cancelled',          color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  rejected:           { label: 'Advance: Rejected',           color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function SiteDetailRow({ site, userNames, advance, onRequestFund, onEditFund }: { site: SiteStatusDetail; userNames: Record<string, string>; advance?: AdvanceInfo; onRequestFund?: (site: SiteStatusDetail) => void; onEditFund?: (site: SiteStatusDetail, advance: AdvanceInfo) => void }) {
  const categoryColors: Record<string, string> = {
    verified: 'bg-green-50/80 dark:bg-green-900/15 border-green-100 dark:border-green-900/30',
    returned: 'bg-orange-50/80 dark:bg-orange-900/15 border-orange-100 dark:border-orange-900/30',
    rejected: 'bg-red-50/80 dark:bg-red-900/15 border-red-100 dark:border-red-900/30',
    in_progress: 'bg-blue-50/80 dark:bg-blue-900/15 border-blue-100 dark:border-blue-900/30',
    pending: 'bg-muted/50 border-border',
  };
  const statusRowOverrides: Record<string, string> = {
    submitted: 'bg-indigo-50/80 dark:bg-indigo-900/15 border-indigo-100 dark:border-indigo-900/30',
    wfp_confirmed: 'bg-cyan-50/80 dark:bg-cyan-900/15 border-cyan-100 dark:border-cyan-900/30',
    not_covered: 'bg-orange-50/80 dark:bg-orange-900/15 border-orange-100 dark:border-orange-900/30',
  };
  const badgeColors: Record<string, string> = {
    verified: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    returned: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    pending: 'bg-muted text-muted-foreground',
  };
  const statusBadgeOverrides: Record<string, string> = {
    submitted: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    wfp_confirmed: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    not_covered: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  const rowColor = statusRowOverrides[site.status] ?? categoryColors[site.statusCategory] ?? 'bg-muted/50 border-border';
  const badgeColor = statusBadgeOverrides[site.status] ?? badgeColors[site.statusCategory] ?? 'bg-muted text-muted-foreground';

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) return format(d, 'MMM d, yyyy HH:mm');
    } catch { /* ignore */ }
    return '';
  };

  const resolvedActionBy = site.actionBy
    ? (userNames[site.actionBy] || site.actionBy)
    : '';

  const isUuid = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const advanceCfg = advance ? ADVANCE_STATUS_CONFIG[advance.status] : null;

  return (
    <div className={`flex items-start gap-2 p-2 rounded border text-sm ${rowColor}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{site.name}</span>
          {site.siteCode && <span className="text-xs text-muted-foreground">({site.siteCode})</span>}
          <Badge variant="secondary" className={`text-[11px] px-1.5 py-0 ${badgeColor}`}>
            {site.statusLabel}
          </Badge>
          {site.statusCategory === 'in_progress' && site.actionAt && (() => {
            try {
              const d = new Date(site.actionAt);
              if (!isNaN(d.getTime())) {
                const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
                if (diffDays >= 7) return (
                  <Badge variant="outline" className="text-[11px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                    <Clock className="h-3 w-3" />
                    Stale {diffDays}d
                  </Badge>
                );
              }
            } catch { /* ignore */ }
            return null;
          })()}
          {advance && advanceCfg ? (
            <div className="flex items-center gap-1">
              <Badge variant="secondary" className={`text-[11px] px-1.5 py-0 flex items-center gap-1 ${advanceCfg.color}`}>
                <Wallet className="h-3 w-3" />
                {advanceCfg.label}
                {advance.requestedAmount > 0 && (
                  <span className="ml-0.5 opacity-80">
                    {advance.totalPaid > 0
                      ? `(${advance.totalPaid.toLocaleString()} / ${advance.requestedAmount.toLocaleString()} SDG)`
                      : advance.approvedAmount > 0
                        ? `(${advance.approvedAmount.toLocaleString()} SDG)`
                        : `(${advance.requestedAmount.toLocaleString()} SDG)`}
                  </span>
                )}
              </Badge>
              {onEditFund && ['pending_supervisor', 'pending_admin'].includes(advance.status) && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEditFund(site, advance); }}
                  className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-amber-400/60 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                  title="Edit this advance request"
                >
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 flex items-center gap-1 text-muted-foreground border-dashed">
                <Wallet className="h-3 w-3" />
                No Advance Request
              </Badge>
              {onRequestFund && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRequestFund(site); }}
                  className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors"
                  title="Request transport advance for this site"
                >
                  <Plus className="h-3 w-3" />
                  Request Fund
                </button>
              )}
            </div>
          )}
        </div>
        {site.reason && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {site.reason}
          </p>
        )}
        {(resolvedActionBy || site.actionAt) && (
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {resolvedActionBy && !isUuid(resolvedActionBy) && <>By: {resolvedActionBy}</>}
            {site.actionAt && <>{resolvedActionBy ? ' ' : ''}{formatDate(site.actionAt)}</>}
          </p>
        )}
        {site.claimedBy && (
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            DC: {userNames[site.claimedBy] || (isUuid(site.claimedBy) ? site.claimedBy.slice(0, 8) + '…' : site.claimedBy)}
          </p>
        )}
      </div>
    </div>
  );
}

function LocalityGroup({ locality, sites, userNames, advanceMap, onRequestFund, onEditFund }: { locality: string; sites: SiteStatusDetail[]; userNames: Record<string, string>; advanceMap: Record<string, AdvanceInfo>; onRequestFund?: (site: SiteStatusDetail) => void; onEditFund?: (site: SiteStatusDetail, advance: AdvanceInfo) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid={`locality-group-${locality}`}>
      <CollapsibleTrigger className="w-full group">
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/60 border border-border/50 hover:bg-muted hover:border-border transition-colors">
          <MapPin className="h-3.5 w-3.5 text-primary/70 flex-shrink-0" />
          <span className="text-[12px] font-semibold text-foreground flex-1 text-left">{locality}</span>
          <span className="text-[11px] font-medium bg-background border border-border/60 rounded-full px-1.5 py-0.5 text-muted-foreground leading-none">{sites.length}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1 mt-1 ml-3 pl-2 border-l-2 border-border/40">
          {sites.map((site) => (
            <SiteDetailRow key={site.id} site={site} userNames={userNames} advance={advanceMap[site.id]} onRequestFund={onRequestFund} onEditFund={onEditFund} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function StatusCategorySection({ 
  category, 
  sites, 
  userNames,
  advanceMap,
  onRequestFund,
  onEditFund,
}: { 
  category: 'verified' | 'returned' | 'rejected' | 'in_progress' | 'pending'; 
  sites: SiteStatusDetail[]; 
  userNames: Record<string, string>;
  advanceMap: Record<string, AdvanceInfo>;
  onRequestFund?: (site: SiteStatusDetail) => void;
  onEditFund?: (site: SiteStatusDetail, advance: AdvanceInfo) => void;
}) {
  if (sites.length === 0) return null;

  const categoryConfig: Record<string, { label: string; icon: any; colorClass: string }> = {
    verified: { label: 'Verified', icon: CheckCircle2, colorClass: 'text-green-700 dark:text-green-400' },
    returned: { label: 'Returned', icon: XCircle, colorClass: 'text-orange-700 dark:text-orange-400' },
    rejected: { label: 'Rejected', icon: XCircle, colorClass: 'text-red-700 dark:text-red-400' },
    in_progress: { label: 'In Progress', icon: Clock, colorClass: 'text-blue-700 dark:text-blue-400' },
    pending: { label: 'Pending', icon: AlertCircle, colorClass: 'text-muted-foreground' },
  };

  const config = categoryConfig[category];
  const Icon = config.icon;
  const [open, setOpen] = useState(true);

  const bgMap: Record<string, string> = {
    verified: 'bg-green-50/60 dark:bg-green-950/20 border-green-200/60 dark:border-green-800/40',
    returned: 'bg-orange-50/60 dark:bg-orange-950/20 border-orange-200/60 dark:border-orange-800/40',
    rejected: 'bg-red-50/60 dark:bg-red-950/20 border-red-200/60 dark:border-red-800/40',
    in_progress: 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200/60 dark:border-blue-800/40',
    pending: 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-800/40',
  };
  const stripMap: Record<string, string> = {
    verified: 'bg-green-500',
    returned: 'bg-orange-500',
    rejected: 'bg-red-500',
    in_progress: 'bg-blue-500',
    pending: 'bg-amber-400',
  };

  const byLocality = new Map<string, SiteStatusDetail[]>();
  sites.forEach(site => {
    const loc = cleanName(site.locality) || 'Unknown Locality';
    if (!byLocality.has(loc)) byLocality.set(loc, []);
    byLocality.get(loc)!.push(site);
  });

  const sortedLocalities = Array.from(byLocality.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full group">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-md border ${bgMap[category]} hover:opacity-90 transition-opacity`}>
          <span className={`w-1 h-4 rounded-full flex-shrink-0 ${stripMap[category]}`} />
          <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${config.colorClass}`} />
          <span className={`text-[12px] font-bold flex-1 text-left ${config.colorClass}`}>{config.label}</span>
          <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full border ${bgMap[category]} ${config.colorClass}`}>{sites.length}</span>
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform flex-shrink-0 ${open ? '' : '-rotate-90'}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1.5 mt-1.5 ml-1">
          {sortedLocalities.map(([locality, locSites]) => (
            <LocalityGroup key={locality} locality={locality} sites={locSites} userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} onEditFund={onEditFund} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CoordExpandedContent({
  coord,
  userNames,
  advanceMap,
  onRequestFund,
  onEditFund,
}: {
  coord: CoordinatorInfo;
  userNames: Record<string, string>;
  advanceMap: Record<string, AdvanceInfo>;
  onRequestFund?: (site: SiteStatusDetail) => void;
  onEditFund?: (site: SiteStatusDetail, advance: AdvanceInfo) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const noAdvanceCount = coord.siteDetails.filter(s => {
    const adv = advanceMap[s.id];
    return !adv || adv.status === 'cancelled' || adv.status === 'rejected';
  }).length;

  const filteredDetails = statusFilter === '__no_advance__'
    ? coord.siteDetails.filter(s => {
        const adv = advanceMap[s.id];
        return !adv || adv.status === 'cancelled' || adv.status === 'rejected';
      })
    : statusFilter === 'all'
      ? coord.siteDetails
      : coord.siteDetails.filter(s => s.status === statusFilter);

  const verifiedSites   = filteredDetails.filter(s => s.statusCategory === 'verified');
  const returnedSites   = filteredDetails.filter(s => s.statusCategory === 'returned');
  const rejectedSites   = filteredDetails.filter(s => s.statusCategory === 'rejected');
  const inProgressSites = filteredDetails.filter(s => s.statusCategory === 'in_progress');
  const pendingSites    = filteredDetails.filter(s => s.statusCategory === 'pending');

  return (
    <div className="px-2 pb-2 mt-2 space-y-3">
      {/* ── Filter pills ── */}
      <div className="flex flex-wrap gap-1.5 border-b pb-2">
        <button
          onClick={() => setStatusFilter('all')}
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-foreground text-background border-foreground'
              : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground'
          }`}
        >
          All ({coord.sitesAssigned})
        </button>
        {sortedStatusEntries(coord.statusCounts).map(([status, count]) => {
          const cfg = getStatusCfg(status);
          const isActive = statusFilter === status;
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(isActive ? 'all' : status)}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                isActive
                  ? `${cfg.color} border-transparent`
                  : `border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground`
              }`}
            >
              {count} {cfg.label}
            </button>
          );
        })}
        {noAdvanceCount > 0 && (
          <button
            onClick={() => setStatusFilter(statusFilter === '__no_advance__' ? 'all' : '__no_advance__')}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              statusFilter === '__no_advance__'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-transparent'
                : 'border-dashed border-orange-300 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20'
            }`}
          >
            <Wallet className="h-2.5 w-2.5" />
            No Advance ({noAdvanceCount})
          </button>
        )}
      </div>
      {/* ── Overall totals summary ── */}
      {(() => {
        const allVerified   = coord.siteDetails.filter(s => s.statusCategory === 'verified').length;
        const allInProgress = coord.siteDetails.filter(s => s.statusCategory === 'in_progress').length;
        const allPending    = coord.siteDetails.filter(s => s.statusCategory === 'pending').length;
        const allReturned   = coord.siteDetails.filter(s => s.statusCategory === 'returned').length;
        const allRejected   = coord.siteDetails.filter(s => s.statusCategory === 'rejected').length;
        const total = coord.siteDetails.length;
        const chips = [
          allInProgress > 0 && { label: 'In Progress', count: allInProgress, dot: 'bg-blue-500',   text: 'text-blue-700 dark:text-blue-400' },
          allPending    > 0 && { label: 'Pending',     count: allPending,    dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400' },
          allVerified   > 0 && { label: 'Verified',    count: allVerified,   dot: 'bg-green-500',   text: 'text-green-700 dark:text-green-400' },
          allReturned   > 0 && { label: 'Returned',    count: allReturned,   dot: 'bg-orange-500',  text: 'text-orange-700 dark:text-orange-400' },
          allRejected   > 0 && { label: 'Rejected',    count: allRejected,   dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-400' },
        ].filter(Boolean) as { label: string; count: number; dot: string; text: string }[];
        return (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 rounded-md bg-muted/40 border border-border/40 text-[11px]">
            <span className="font-bold text-foreground">{total} sites total</span>
            <span className="text-border">|</span>
            {chips.map(chip => (
              <span key={chip.label} className={`flex items-center gap-1 ${chip.text}`}>
                <span className={`w-2 h-2 rounded-full inline-block ${chip.dot}`} />
                <span className="font-semibold">{chip.count}</span>
                <span className="text-muted-foreground">{chip.label}</span>
              </span>
            ))}
          </div>
        );
      })()}
      {/* ── Filtered sections ── */}
      <div className="space-y-1">
        <StatusCategorySection category="in_progress" sites={inProgressSites} userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} onEditFund={onEditFund} />
        <StatusCategorySection category="pending"     sites={pendingSites}    userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} onEditFund={onEditFund} />
        <StatusCategorySection category="verified"    sites={verifiedSites}   userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} onEditFund={onEditFund} />
        <StatusCategorySection category="returned"    sites={returnedSites}   userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} onEditFund={onEditFund} />
        <StatusCategorySection category="rejected"    sites={rejectedSites}   userNames={userNames} advanceMap={advanceMap} onRequestFund={onRequestFund} onEditFund={onEditFund} />
      </div>
    </div>
  );
}

export default function CoordinatorSummaryCard({ siteEntries, mmpId, mmpName = '' }: CoordinatorSummaryCardProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [coordinatorNames, setCoordinatorNames] = useState<Record<string, string>>({});
  const [actionByNames, setActionByNames] = useState<Record<string, string>>({});
  const [advanceMap, setAdvanceMap] = useState<Record<string, AdvanceInfo>>({});
  const [reportState, setReportState] = useState<{ stateName: string; rawEntries: any[] } | null>(null);

  const { createRequest, editRequest } = useDownPayment();
  const { currentUser } = useUser();

  const [fundDialog, setFundDialog] = useState<{ open: boolean; site: SiteStatusDetail | null; editMode: boolean; existingAdvance: AdvanceInfo | null }>({ open: false, site: null, editMode: false, existingAdvance: null });
  const [fundAmount, setFundAmount] = useState('');
  const [fundJustification, setFundJustification] = useState('');
  const [fundEditReason, setFundEditReason] = useState('');
  const [fundSubmitting, setFundSubmitting] = useState(false);
  const [fundFetchedBudget, setFundFetchedBudget] = useState<number | null>(null);
  const [fundBudgetLoading, setFundBudgetLoading] = useState(false);

  const handleOpenRequestFund = (site: SiteStatusDetail) => {
    setFundDialog({ open: true, site, editMode: false, existingAdvance: null });
    setFundAmount('');
    setFundJustification('');
    setFundEditReason('');
    setFundFetchedBudget(site.transportBudget && site.transportBudget > 0 ? site.transportBudget : null);
  };

  const handleOpenEditFund = (site: SiteStatusDetail, advance: AdvanceInfo) => {
    setFundDialog({ open: true, site, editMode: true, existingAdvance: advance });
    setFundAmount(advance.requestedAmount > 0 ? String(advance.requestedAmount) : '');
    setFundJustification(advance.justification || '');
    setFundEditReason('');
    setFundFetchedBudget(site.transportBudget && site.transportBudget > 0 ? site.transportBudget : null);
  };

  // Live-fetch transport_budget_total from mmp_site_entries when dialog opens
  useEffect(() => {
    const site = fundDialog.site;
    if (!fundDialog.open || !site?.id) return;
    let cancelled = false;
    const fetchBudget = async () => {
      setFundBudgetLoading(true);
      const { data } = await supabase
        .from('mmp_site_entries')
        .select('transport_fee, transport_budget_total')
        .eq('id', site.id)
        .maybeSingle();
      if (!cancelled) {
        const raw = data?.transport_fee ?? data?.transport_budget_total;
        const val = raw != null ? Number(raw) : null;
        if (val && val > 0) setFundFetchedBudget(val);
        setFundBudgetLoading(false);
      }
    };
    fetchBudget();
    return () => { cancelled = true; };
  }, [fundDialog.open, fundDialog.site?.id]);

  const handleSubmitFundRequest = async () => {
    const site = fundDialog.site;
    if (!site || !currentUser) return;
    const amount = parseFloat(fundAmount);
    const budget = (fundFetchedBudget && fundFetchedBudget > 0) ? fundFetchedBudget : amount;
    if (!amount || amount <= 0) return;
    if (!fundJustification.trim()) return;
    if (fundDialog.editMode && !fundEditReason.trim()) return;
    setFundSubmitting(true);
    try {
      if (fundDialog.editMode && fundDialog.existingAdvance) {
        await editRequest({
          requestId: fundDialog.existingAdvance.id,
          editedBy: currentUser.id,
          reason: fundEditReason.trim(),
          changes: {
            requestedAmount: amount,
            justification: fundJustification.trim(),
          },
        });
      } else {
        const enumeratorId = site.claimedBy || currentUser.id;
        await createRequest({
          mmpSiteEntryId: site.id,
          siteName: site.name,
          requestedBy: enumeratorId,
          requesterRole: 'dataCollector',
          hubName: site.hubName || '',
          stateName: site.stateName || '',
          localityName: site.locality || '',
          totalTransportationBudget: budget,
          requestedAmount: amount,
          paymentType: 'full_advance',
          justification: fundJustification.trim(),
        });
      }
      setFundDialog({ open: false, site: null, editMode: false, existingAdvance: null });
      // Refresh advance map using the SECURITY DEFINER helper
      const entryIds = siteEntries.map((e: any) => e.id).filter((id: any) => typeof id === 'string' && id.length > 0);
      if (entryIds.length > 0) {
        const allAdv = await fetchAdvancesByEntryIds(entryIds);
        if (allAdv.length > 0) {
          const map: Record<string, AdvanceInfo> = {};
          allAdv.forEach((row: any) => {
            const eid = row.mmp_site_entry_id;
            if (!eid) return;
            const existing = map[eid];
            const isCancelled = row.status === 'cancelled' || row.status === 'rejected';
            if (!existing || (!isCancelled && (existing.status === 'cancelled' || existing.status === 'rejected'))) {
              map[eid] = { id: row.id, status: row.status || 'pending_supervisor', requestedAmount: Number(row.requested_amount) || 0, approvedAmount: Number(row.approved_amount) || 0, totalPaid: Number(row.total_paid_amount) || 0, justification: row.justification || '' };
            }
          });
          setAdvanceMap(map);
        }
      }
    } finally {
      setFundSubmitting(false);
    }
  };

  const coordinatorsByState = useMemo(() => {
    if (!siteEntries || siteEntries.length === 0) return [];

    const stateMap = new Map<string, StateCoordinatorGroup>();

    // Normalise status to lowercase for reliable matching regardless of DB casing
    // (DB stores: 'Accepted', 'Pending', 'Completed', 'Approved and Costed', 'In Progress', etc.)
    const verifiedStatuses = new Set([
      'verified', 'approved', 'approved and costed', 'costed',
      'completed', 'partially_paid', 'fully_paid',
      'pending_admin', 'pending_supervisor',
      'submitted', 'wfp_confirmed', 'not_covered',
    ]);
    const returnedStatuses = new Set([
      'returned_to_fom', 'returned', 'recalled', 'sent_back', 'sent_back_to_fom',
    ]);
    const rejectedStatuses = new Set(['rejected']);
    const inProgressStatuses = new Set([
      'in_progress', 'accepted', 'permits_attached', 'assigned',
      'forwarded', 'forwarded_to_fom', 'forwarded_to_coordinator', 'forwarded_to_coordinators',
    ]);

    // Human-readable labels for every known status (keyed by normalised lowercase)
    const statusLabels: Record<string, string> = {
      verified: 'Verified',
      approved: 'Approved',
      'approved and costed': 'Approved & Costed',
      costed: 'Costed',
      dispatched: 'Dispatched',
      completed: 'Completed',
      partially_paid: 'Partially Paid',
      fully_paid: 'Fully Paid',
      pending_admin: 'Pending Admin',
      pending_supervisor: 'Pending Supervisor',
      returned_to_fom: 'Returned to FOM',
      returned: 'Returned',
      rejected: 'Rejected',
      recalled: 'Recalled',
      sent_back: 'Sent Back',
      sent_back_to_fom: 'Sent Back to FOM',
      in_progress: 'In Progress',
      accepted: 'Accepted',
      permits_attached: 'Permits Attached',
      assigned: 'Assigned',
      forwarded: 'Forwarded',
      forwarded_to_fom: 'With FOM',
      forwarded_to_coordinator: 'With Coordinator',
      forwarded_to_coordinators: 'With Coordinators',
      submitted: 'Submitted',
      wfp_confirmed: 'WFP Confirmed',
      not_covered: 'Not Covered',
      pending: 'Pending',
    };

    siteEntries.forEach((entry: any) => {
      const stateName = cleanName(entry.state || entry.stateName) || 'Unknown State';
      
      if (!stateMap.has(stateName)) {
        stateMap.set(stateName, {
          state: stateName,
          coordinators: [],
          totalSites: 0,
          verifiedSites: 0,
          returnedSites: 0,
          inProgressSites: 0,
          pendingSites: 0,
          statusCounts: {},
        });
      }

      const stateData = stateMap.get(stateName)!;
      stateData.totalSites++;

      // Normalise to lowercase for all set lookups — MUST be declared before any use below
      const entryStatus = (entry.status || '').toLowerCase().trim();

      // Increment per-status count for this state
      stateData.statusCounts[entryStatus] = (stateData.statusCounts[entryStatus] ?? 0) + 1;

      const coordId = entry.additional_data?.assigned_to || 
                     entry.additionalData?.assigned_to ||
                     entry.forwarded_to_user_id || 
                     entry.forwardedToUserId;
      const coordName = entry.additional_data?.assigned_to_name || 
                       entry.additionalData?.assigned_to_name ||
                       entry.coordinator_name || 
                       entry.coordinatorName;
      const receivedAt = entry.forwarded_at || entry.forwardedAt || entry.dispatched_at || entry.dispatchedAt;
      const isVerified = verifiedStatuses.has(entryStatus);
      const isReturned = returnedStatuses.has(entryStatus);
      const isRejected = rejectedStatuses.has(entryStatus);
      const isInProgress = inProgressStatuses.has(entryStatus);
      
      if (isVerified) stateData.verifiedSites++;
      if (isReturned || isRejected) stateData.returnedSites++;
      if (isInProgress) stateData.inProgressSites++;
      if (!isVerified && !isReturned && !isRejected && !isInProgress) stateData.pendingSites++;

      const ad = entry.additional_data || entry.additionalData || {};
      const statusCategory: SiteStatusDetail['statusCategory'] = isVerified
        ? 'verified'
        : isRejected
          ? 'rejected'
          : isReturned
            ? 'returned'
            : isInProgress
              ? 'in_progress'
              : 'pending';

      const actionByRaw = isVerified 
        ? (entry.verified_by || '') 
        : (isReturned || isRejected)
          ? (entry.verified_by || ad.sent_back_by || entry.rejected_by || ad.rejected_by || '') 
          : '';

      const siteDetail: SiteStatusDetail = {
        id: entry.id || '',
        name: entry.site_name || entry.siteName || 'Unknown',
        siteCode: entry.site_code || entry.siteCode || '',
        status: entryStatus,
        statusLabel: statusLabels[entryStatus] || (entry.status || entryStatus).replace(/_/g, ' '),
        statusCategory,
        locality: cleanName(entry.locality || entry.localityName) || '',
        stateName: cleanName(entry.state || entry.stateName) || stateName,
        hubName: entry.hub_office || entry.hub_name || entry.hubName || '',
        transportBudget: entry.transport_fee != null ? Number(entry.transport_fee) : (entry.transport_budget_total != null ? Number(entry.transport_budget_total) : (ad.transport_budget_total != null ? Number(ad.transport_budget_total) : undefined)),
        reason: entry.verification_notes || ad.rejection_comments || ad.rejection_reason || ad.return_reason || entry.rejection_comments || '',
        actionBy: actionByRaw,
        actionAt: isVerified
          ? (entry.verified_at || '')
          : isReturned
            ? (entry.verified_at || entry.rejected_at || ad.rejected_at || ad.sent_back_at || '')
            : (entry.dispatched_at || entry.forwarded_at || ''),
        claimedBy: ad.claimed_by || entry.claimed_by || entry.accepted_by || '',
      };

      // Sites with no coordinator (directly dispatched to DCs) go under a special group
      const effectiveCoordId = coordId || '__direct__';
      const effectiveCoordName = coordId
        ? (coordName || coordinatorNames[coordId] || coordId.substring(0, 8))
        : 'Claimed Without Coordinator';

      const existingCoord = stateData.coordinators.find(c => c.id === effectiveCoordId);

      if (existingCoord) {
        existingCoord.sitesAssigned++;
        if (isVerified) existingCoord.sitesVerified++;
        if (isReturned || isRejected) existingCoord.sitesReturned++;
        if (isInProgress) existingCoord.sitesInProgress++;
        if (!isVerified && !isReturned && !isRejected && !isInProgress) existingCoord.sitesPending++;
        existingCoord.statusCounts[entryStatus] = (existingCoord.statusCounts[entryStatus] ?? 0) + 1;
        existingCoord.siteDetails.push(siteDetail);
      } else {
        stateData.coordinators.push({
          id: effectiveCoordId,
          name: effectiveCoordName,
          sitesAssigned: 1,
          sitesVerified: isVerified ? 1 : 0,
          sitesReturned: (isReturned || isRejected) ? 1 : 0,
          sitesInProgress: isInProgress ? 1 : 0,
          sitesPending: (!isVerified && !isReturned && !isRejected && !isInProgress) ? 1 : 0,
          statusCounts: { [entryStatus]: 1 },
          receivedAt: receivedAt,
          siteDetails: [siteDetail],
        });
      }
    });

    // When a state has exactly 1 real coordinator + an unassigned group,
    // fold the unassigned sites into that coordinator's row.
    stateMap.forEach((stateData) => {
      const directIdx = stateData.coordinators.findIndex(c => c.id === '__direct__');
      if (directIdx === -1) return;
      const realCoords = stateData.coordinators.filter(c => c.id !== '__direct__');
      if (realCoords.length === 1) {
        const direct = stateData.coordinators[directIdx];
        const coord = realCoords[0];
        coord.sitesAssigned   += direct.sitesAssigned;
        coord.sitesVerified   += direct.sitesVerified;
        coord.sitesReturned   += direct.sitesReturned;
        coord.sitesInProgress += direct.sitesInProgress;
        coord.sitesPending    += direct.sitesPending;
        Object.entries(direct.statusCounts).forEach(([s, n]) => {
          coord.statusCounts[s] = (coord.statusCounts[s] ?? 0) + n;
        });
        coord.siteDetails.push(...direct.siteDetails);
        stateData.coordinators.splice(directIdx, 1);
      }
    });

    // Within each state, sort coordinators: most urgent first
    // (returned/rejected → least complete → __direct__ always last)
    stateMap.forEach((stateData) => {
      stateData.coordinators.sort((a, b) => {
        if (a.id === '__direct__') return 1;
        if (b.id === '__direct__') return -1;
        if (b.sitesReturned !== a.sitesReturned) return b.sitesReturned - a.sitesReturned;
        const aRatio = a.sitesAssigned > 0 ? a.sitesVerified / a.sitesAssigned : 0;
        const bRatio = b.sitesAssigned > 0 ? b.sitesVerified / b.sitesAssigned : 0;
        return aRatio - bRatio;
      });
    });

    return Array.from(stateMap.values())
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [siteEntries, coordinatorNames]);

  useEffect(() => {
    const fetchNames = async () => {
      const coordIds = new Set<string>();
      const actionByIds = new Set<string>();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      siteEntries.forEach((entry: any) => {
        const coordId = entry.additional_data?.assigned_to || 
                       entry.additionalData?.assigned_to ||
                       entry.forwarded_to_user_id || 
                       entry.forwardedToUserId;
        if (coordId && !entry.additional_data?.assigned_to_name && !entry.coordinator_name) {
          coordIds.add(coordId);
        }

        const actionFields = [
          entry.verified_by,
          entry.rejected_by,
          entry.additional_data?.sent_back_by,
          entry.additional_data?.rejected_by,
          entry.additionalData?.sent_back_by,
          entry.additionalData?.rejected_by,
          entry.additional_data?.claimed_by,
          entry.additionalData?.claimed_by,
          entry.claimed_by,
          entry.accepted_by,
        ];
        actionFields.forEach(id => {
          if (id && uuidRegex.test(id)) {
            actionByIds.add(id);
          }
        });
      });

      const allIds = new Set([...coordIds, ...actionByIds]);
      if (allIds.size === 0) return;

      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', Array.from(allIds));

      if (data) {
        const coordNameMap: Record<string, string> = {};
        const actionNameMap: Record<string, string> = {};
        data.forEach((p: any) => {
          const name = p.full_name || p.id.substring(0, 8);
          if (coordIds.has(p.id)) coordNameMap[p.id] = name;
          if (actionByIds.has(p.id)) actionNameMap[p.id] = name;
          actionNameMap[p.id] = name;
        });
        setCoordinatorNames(coordNameMap);
        setActionByNames(actionNameMap);
      }
    };

    if (siteEntries.length > 0) {
      fetchNames();
    }
  }, [siteEntries]);

  // Helper: fetch advance data for a list of entry IDs via SECURITY DEFINER
  // RPC (bypasses RLS on down_payment_requests so all advances are visible).
  // Falls back to a direct query if the RPC doesn't exist yet.
  const fetchAdvancesByEntryIds = async (entryIds: string[]): Promise<any[]> => {
    const { data: rpcData, error: rpcErr } = await (supabase as any).rpc(
      'get_advances_by_entry_ids',
      { entry_ids: entryIds },
    );
    if (!rpcErr && rpcData) return rpcData as any[];

    // Fallback: direct query (subject to RLS — use until migration is applied)
    console.warn('[CoordCard] RPC get_advances_by_entry_ids not available, falling back:', rpcErr?.message);
    const PAGE = 1000;
    let allData: any[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('down_payment_requests')
        .select('id, mmp_site_entry_id, status, requested_amount, approved_amount, total_paid_amount, justification')
        .in('mmp_site_entry_id', entryIds)
        .range(from, from + PAGE - 1);
      if (error) break;
      allData = [...allData, ...(data || [])];
      if (!data || data.length < PAGE) break;
    }
    return allData;
  };

  // Fetch advance/down-payment status for all site entries in this MMP
  useEffect(() => {
    const fetchAdvanceStatus = async () => {
      const entryIds = siteEntries
        .map((e: any) => e.id)
        .filter((id: any) => typeof id === 'string' && id.length > 0);

      if (entryIds.length === 0) return;

      const data = await fetchAdvancesByEntryIds(entryIds);
      if (data.length === 0) return;

      // Build a map: site_entry_id → most-relevant advance record
      // If there are multiple requests per site, prefer the one that is not cancelled/rejected
      const map: Record<string, AdvanceInfo> = {};
      data.forEach((row: any) => {
        const eid = row.mmp_site_entry_id;
        if (!eid) return;
        const existing = map[eid];
        // Prefer active/pending records over cancelled ones
        const isCancelled = row.status === 'cancelled' || row.status === 'rejected';
        if (!existing || (!isCancelled && (existing.status === 'cancelled' || existing.status === 'rejected'))) {
          map[eid] = {
            id: row.id,
            status: row.status || 'pending_supervisor',
            requestedAmount: Number(row.requested_amount) || 0,
            approvedAmount: Number(row.approved_amount) || 0,
            totalPaid: Number(row.total_paid_amount) || 0,
            justification: row.justification || '',
          };
        }
      });

      setAdvanceMap(map);
    };

    if (siteEntries.length > 0) {
      fetchAdvanceStatus();
    }
  }, [siteEntries]);

  const totalCoordinators = useMemo(() => {
    const uniqueCoords = new Set<string>();
    coordinatorsByState.forEach(state => {
      state.coordinators.forEach(c => { if (c.id !== '__direct__') uniqueCoords.add(c.id); });
    });
    return uniqueCoords.size;
  }, [coordinatorsByState]);

  const totalAssigned = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => sum + state.totalSites, 0);
  }, [coordinatorsByState]);

  const totalVerified = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => sum + state.verifiedSites, 0);
  }, [coordinatorsByState]);

  const totalInProgress = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => sum + state.inProgressSites, 0);
  }, [coordinatorsByState]);

  const totalPending = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => sum + state.pendingSites, 0);
  }, [coordinatorsByState]);

  const totalReturned = useMemo(() => {
    return coordinatorsByState.reduce((sum, state) => sum + state.returnedSites, 0);
  }, [coordinatorsByState]);

  if (coordinatorsByState.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900/30 dark:to-slate-800/20 border-slate-200 dark:border-slate-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            Coordinator Assignments
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            No coordinators assigned yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/30 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            Coordinator Assignments
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-purple-100 dark:bg-purple-900/50">
              {totalCoordinators} coordinator{totalCoordinators !== 1 ? 's' : ''}
            </Badge>
            <Badge variant="outline" className="border-purple-300 dark:border-purple-700">
              {coordinatorsByState.length} state{coordinatorsByState.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 text-xs flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-muted-foreground">{totalVerified} done</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-400" />
            <span className="text-muted-foreground">{totalInProgress} in progress</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-muted-foreground">{totalPending} pending</span>
          </div>
          {totalReturned > 0 && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-muted-foreground">{totalReturned} returned</span>
            </div>
          )}
          <div className="flex items-center gap-2 flex-1 min-w-[100px] max-w-[160px]">
            <div className="flex h-2 rounded-full overflow-hidden bg-muted flex-1">
              {totalAssigned > 0 && (
                <>
                  <div className="bg-green-500 transition-all" style={{ width: `${(totalVerified   / totalAssigned) * 100}%` }} />
                  <div className="bg-blue-400 transition-all"  style={{ width: `${(totalInProgress / totalAssigned) * 100}%` }} />
                  <div className="bg-amber-400 transition-all" style={{ width: `${(totalPending    / totalAssigned) * 100}%` }} />
                  <div className="bg-red-500 transition-all"   style={{ width: `${(totalReturned   / totalAssigned) * 100}%` }} />
                </>
              )}
            </div>
            {totalAssigned > 0 && (
              <span className="text-[10px] text-muted-foreground font-medium flex-shrink-0">
                {Math.round((totalVerified / totalAssigned) * 100)}%
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger 
            className="flex items-center gap-2 text-sm font-medium hover-elevate rounded px-2 py-1 -mx-2 w-full"
            data-testid="trigger-coordinator-summary"
          >
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            <span>View by State</span>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-3">
            {coordinatorsByState.map((stateData) => (
              <div 
                key={stateData.state} 
                className="border border-purple-200 dark:border-purple-800 rounded-md p-3 bg-background/80"
                data-testid={`coordinator-state-${stateData.state}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="font-medium text-sm">{stateData.state}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const stateEntries = siteEntries.filter((en: any) =>
                          (cleanName(en.state || en.stateName) || 'Unknown State') === stateData.state
                        );
                        setReportState({ stateName: stateData.state, rawEntries: stateEntries });
                      }}
                      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                      title="Generate operational report for this state"
                    >
                      <FileText className="h-3 w-3" />
                      Report
                    </button>
                    {sortedStatusEntries(stateData.statusCounts).map(([status, count]) => {
                      const cfg = getStatusCfg(status);
                      return (
                        <Badge key={status} variant="secondary" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                          {cfg.label}: {count}
                        </Badge>
                      );
                    })}
                    {(() => {
                      const realCoordCount = stateData.coordinators.filter(c => c.id !== '__direct__').length;
                      const unassignedGroup = stateData.coordinators.find(c => c.id === '__direct__');
                      return (
                        <>
                          <Badge variant="outline" className="text-xs">
                            {stateData.totalSites} sites total
                          </Badge>
                          <Badge variant="outline" className="text-xs ml-1">
                            {realCoordCount} coordinator{realCoordCount !== 1 ? 's' : ''}
                            {unassignedGroup ? ` · ${unassignedGroup.sitesAssigned} unassigned` : ''}
                          </Badge>
                        </>
                      );
                    })()}
                  </div>
                </div>
                
                {stateData.totalSites > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex h-2 rounded-full overflow-hidden bg-muted flex-1">
                      <div className="bg-green-500 transition-all" style={{ width: `${(stateData.verifiedSites / stateData.totalSites) * 100}%` }} />
                      <div className="bg-blue-400 transition-all"  style={{ width: `${(stateData.inProgressSites / stateData.totalSites) * 100}%` }} />
                      <div className="bg-amber-400 transition-all" style={{ width: `${(stateData.pendingSites / stateData.totalSites) * 100}%` }} />
                      <div className="bg-red-500 transition-all"   style={{ width: `${(stateData.returnedSites / stateData.totalSites) * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap font-medium flex-shrink-0">
                      {Math.round((stateData.verifiedSites / stateData.totalSites) * 100)}% done
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {stateData.coordinators.map((coord) => {
                    return (
                    <Collapsible 
                      key={coord.id}
                      data-testid={`coordinator-${coord.id}`}
                    >
                      <CollapsibleTrigger className="w-full rounded-md bg-muted/50 text-sm hover-elevate">
                        <div className="flex items-center justify-between gap-2 p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                              coord.id === '__direct__'
                                ? 'bg-amber-100 dark:bg-amber-900/40'
                                : 'bg-purple-200 dark:bg-purple-800'
                            }`}>
                              {coord.id === '__direct__'
                                ? <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                                : <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                              }
                            </div>
                            <div className="min-w-0 text-left">
                              <p className="font-medium truncate">
                                {coordinatorNames[coord.id] || coord.name}
                              </p>
                              {coord.receivedAt && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {(() => {
                                    try {
                                      const date = new Date(coord.receivedAt);
                                      if (!isNaN(date.getTime())) {
                                        return format(date, 'MMM d, yyyy');
                                      }
                                    } catch {
                                      return null;
                                    }
                                    return '';
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <div className="flex items-center gap-1 flex-wrap justify-end max-w-[280px]">
                              {coord.sitesReturned > 0 && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 flex items-center gap-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 animate-pulse">
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  {coord.sitesReturned} need action
                                </Badge>
                              )}
                              {sortedStatusEntries(coord.statusCounts).map(([status, count]) => {
                                const cfg = getStatusCfg(status);
                                return (
                                  <Badge key={status} variant="secondary" className={`text-[10px] px-1.5 py-0 ${cfg.color}`}>
                                    {count} {cfg.label}
                                  </Badge>
                                );
                              })}
                              {(() => {
                                const withAdvance = coord.siteDetails.filter(s => advanceMap[s.id] && advanceMap[s.id].status !== 'cancelled' && advanceMap[s.id].status !== 'rejected').length;
                                const fullyPaid = coord.siteDetails.filter(s => advanceMap[s.id]?.status === 'fully_paid').length;
                                const noRequest = coord.sitesAssigned - withAdvance;
                                if (withAdvance === 0) return (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex items-center gap-0.5 text-muted-foreground border-dashed">
                                    <Wallet className="h-2.5 w-2.5" />
                                    No Advances
                                  </Badge>
                                );
                                return (
                                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 flex items-center gap-0.5 ${fullyPaid === withAdvance ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                                    <Wallet className="h-2.5 w-2.5" />
                                    {withAdvance}/{coord.sitesAssigned} advances{noRequest > 0 ? ` · ${noRequest} pending` : ''}
                                  </Badge>
                                );
                              })()}
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-xs text-muted-foreground whitespace-nowrap">
                                {coord.sitesVerified > 0
                                  ? <><span className="text-green-600 dark:text-green-400 font-medium">{coord.sitesVerified} done</span> / {coord.sitesAssigned} sites</>
                                  : <>{coord.sitesAssigned} sites</>
                                }
                              </div>
                              {(() => {
                                const lastActivity = coord.siteDetails
                                  .map(s => s.actionAt)
                                  .filter(Boolean)
                                  .sort()
                                  .at(-1);
                                if (!lastActivity) return null;
                                try {
                                  const d = new Date(lastActivity);
                                  if (isNaN(d.getTime())) return null;
                                  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
                                  const label = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : `${diffDays}d ago`;
                                  const color = diffDays <= 2 ? 'text-green-600 dark:text-green-400' : diffDays <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-red-500 dark:text-red-400';
                                  return <div className={`text-[10px] ${color}`}>Last activity: {label}</div>;
                                } catch { return null; }
                              })()}
                            </div>
                            <div className="w-14 flex-shrink-0">
                              <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                                <div className="bg-green-500 transition-all" style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesVerified / coord.sitesAssigned) * 100 : 0}%` }} />
                                <div className="bg-blue-400 transition-all"  style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesInProgress / coord.sitesAssigned) * 100 : 0}%` }} />
                                <div className="bg-amber-400 transition-all" style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesPending / coord.sitesAssigned) * 100 : 0}%` }} />
                                <div className="bg-red-500 transition-all"   style={{ width: `${coord.sitesAssigned > 0 ? (coord.sitesReturned / coord.sitesAssigned) * 100 : 0}%` }} />
                              </div>
                              <div className="text-[9px] text-muted-foreground text-right mt-0.5">
                                {coord.sitesAssigned > 0 ? Math.round((coord.sitesVerified / coord.sitesAssigned) * 100) : 0}%
                              </div>
                            </div>
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CoordExpandedContent
                          coord={coord}
                          userNames={actionByNames}
                          advanceMap={advanceMap}
                          onRequestFund={handleOpenRequestFund}
                          onEditFund={handleOpenEditFund}
                        />
                      </CollapsibleContent>
                    </Collapsible>
                    );
                  })}
                </div>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>

      {/* Request Fund Dialog */}
      <Dialog open={fundDialog.open} onOpenChange={(open) => !open && setFundDialog({ open: false, site: null, editMode: false, existingAdvance: null })}>
        <DialogContent className="max-w-md" data-testid="dialog-request-fund">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {fundDialog.editMode ? <Pencil className="h-5 w-5 text-amber-600" /> : <Wallet className="h-5 w-5 text-primary" />}
              {fundDialog.editMode ? 'Edit Advance Request' : 'Request Transport Advance'}
            </DialogTitle>
            <DialogDescription>
              {fundDialog.editMode ? 'Update the requested amount or justification for this advance request.' : 'Submit an advance fund request for this site visit.'}
            </DialogDescription>
          </DialogHeader>

          {fundDialog.site && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 p-3 space-y-1 text-sm">
                <p><span className="font-medium">Site:</span> {fundDialog.site.name}</p>
                {fundDialog.site.stateName && <p><span className="font-medium">State:</span> {fundDialog.site.stateName}</p>}
                {fundDialog.site.locality && <p><span className="font-medium">Locality:</span> {fundDialog.site.locality}</p>}
                {fundDialog.site.hubName && <p><span className="font-medium">Hub:</span> {fundDialog.site.hubName}</p>}
                {fundDialog.site.claimedBy && (
                  <p><span className="font-medium">Data Collector:</span> {actionByNames[fundDialog.site.claimedBy] || coordinatorNames[fundDialog.site.claimedBy] || fundDialog.site.claimedBy.slice(0, 8) + '…'}</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-sm">
                <span className="text-muted-foreground font-medium">Approved Transportation Budget</span>
                {fundBudgetLoading ? (
                  <span className="text-muted-foreground italic text-xs">Loading…</span>
                ) : fundFetchedBudget && fundFetchedBudget > 0 ? (
                  <span className="font-semibold text-blue-700 dark:text-blue-300">
                    {fundFetchedBudget.toLocaleString()} SDG
                  </span>
                ) : (
                  <span className="text-muted-foreground italic text-xs">Not set</span>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fund-amount">Requested Amount (SDG) <span className="text-destructive">*</span></Label>
                <Input
                  id="fund-amount"
                  type="number"
                  min="1"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="e.g. 50000"
                  data-testid="input-fund-amount"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="fund-justification">Justification <span className="text-destructive">*</span></Label>
                <Textarea
                  id="fund-justification"
                  value={fundJustification}
                  onChange={(e) => setFundJustification(e.target.value)}
                  placeholder="Reason for transport advance request…"
                  rows={3}
                  data-testid="textarea-fund-justification"
                />
              </div>

              {fundDialog.editMode && (
                <div className="space-y-2">
                  <Label htmlFor="fund-edit-reason">Reason for Edit <span className="text-destructive">*</span></Label>
                  <Input
                    id="fund-edit-reason"
                    value={fundEditReason}
                    onChange={(e) => setFundEditReason(e.target.value)}
                    placeholder="Why are you editing this request?"
                    data-testid="input-fund-edit-reason"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFundDialog({ open: false, site: null, editMode: false, existingAdvance: null })} disabled={fundSubmitting} data-testid="button-cancel-fund-request">
              Cancel
            </Button>
            <Button
              onClick={handleSubmitFundRequest}
              disabled={fundSubmitting || !fundAmount || parseFloat(fundAmount) <= 0 || !fundJustification.trim() || (fundDialog.editMode && !fundEditReason.trim())}
              data-testid="button-submit-fund-request"
            >
              {fundSubmitting ? 'Submitting…' : fundDialog.editMode ? 'Save Changes' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── State Operational Report modal ── */}
      {reportState && (
        <MmpStateReport
          open={!!reportState}
          onClose={() => setReportState(null)}
          stateName={reportState.stateName}
          rawEntries={reportState.rawEntries}
          coordinatorNames={coordinatorNames}
          advanceMap={advanceMap}
          mmpId={mmpId || ''}
          mmpName={mmpName}
        />
      )}
    </Card>
  );
}