import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Download, MapPin, Users, User, Clock, CheckCircle2,
  XCircle, FileText, Activity, ShieldAlert, BarChart3, Loader2,
  LockKeyhole, Unlock,
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import {
  exportMmpStateReport,
  MmpReportData,
  ReportSiteRow,
  ReportCoordinatorRow,
  ReportCollectorRow,
  ReportAuditRow,
  AttentionRow,
} from '@/utils/mmpOperationalReportExport';

interface AdvanceInfo {
  id: string;
  status: string;
  requestedAmount: number;
  approvedAmount: number;
  totalPaid: number;
}

interface MmpStateReportProps {
  open: boolean;
  onClose: () => void;
  stateName: string;
  rawEntries: any[];
  coordinatorNames: Record<string, string>;
  advanceMap: Record<string, AdvanceInfo>;
  mmpId: string;
  mmpName: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (d: any) => {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy HH:mm'); } catch { return '—'; }
};
const fmtShort = (d: any) => {
  if (!d) return '—';
  try { return format(new Date(d), 'MMM d, yyyy'); } catch { return '—'; }
};
const daysSince = (d: any): number => {
  if (!d) return 0;
  try { return differenceInDays(new Date(), new Date(d)); } catch { return 0; }
};
const cleanName = (raw: any): string => {
  if (!raw) return '';
  return String(raw).trim().replace(/^["']|["']$/g, '').trim();
};
const nextStep = (status: string): string => {
  const s = status.toLowerCase();
  if (['verified', 'approved', 'approved and costed', 'completed', 'wfp_confirmed'].includes(s)) return 'Complete ✓';
  if (s === 'pending' || s === '' || s === 'not_covered') return 'Assign coordinator and dispatch';
  if (s === 'dispatched') return 'Waiting for collector to accept';
  if (['forwarded_to_coordinator', 'forwarded_to_coordinators', 'forwarded', 'assigned'].includes(s)) return 'Coordinator should dispatch to collector';
  if (s === 'accepted') return 'Collector should start visit';
  if (['in_progress', 'permits_attached'].includes(s)) return 'Complete visit and submit for verification';
  if (s === 'submitted' || s === 'submitted_for_review') return 'Pending supervisor verification';
  if (['returned', 'returned_to_fom', 'recalled', 'sent_back', 'sent_back_to_fom'].includes(s)) return 'Re-dispatch required';
  if (s === 'rejected') return 'Escalate or close — rejected';
  return 'Review status manually';
};

const VERIFIED_STATUSES   = new Set(['verified','approved','approved and costed','costed','completed','wfp_confirmed','submitted']);
const IN_PROGRESS_STATUSES = new Set(['in_progress','accepted','permits_attached','assigned','forwarded','forwarded_to_fom','forwarded_to_coordinator','forwarded_to_coordinators','dispatched']);
const RETURNED_STATUSES   = new Set(['returned','returned_to_fom','recalled','sent_back','sent_back_to_fom']);

function statusCategory(status: string): ReportSiteRow['statusCategory'] {
  const s = status.toLowerCase();
  if (VERIFIED_STATUSES.has(s))    return 'verified';
  if (RETURNED_STATUSES.has(s))    return 'returned';
  if (s === 'rejected')            return 'rejected';
  if (IN_PROGRESS_STATUSES.has(s)) return 'in_progress';
  return 'pending';
}

const STATUS_BADGE: Record<string, string> = {
  verified:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  returned:    'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  rejected:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  pending:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};
const STATUS_ROW: Record<string, string> = {
  verified:    'bg-green-50/40 dark:bg-green-950/10',
  in_progress: 'bg-blue-50/40 dark:bg-blue-950/10',
  returned:    'bg-orange-50/40 dark:bg-orange-950/10',
  rejected:    'bg-red-50/40 dark:bg-red-950/10',
  pending:     '',
};

const TABS = [
  { value: 'summary',      label: 'Summary',         icon: BarChart3  },
  { value: 'coordinators', label: 'Coordinators',     icon: Users      },
  { value: 'collectors',   label: 'Data Collectors',  icon: User       },
  { value: 'sites',        label: 'All Sites',        icon: MapPin     },
  { value: 'attention',    label: 'Attention',        icon: ShieldAlert},
  { value: 'audit',        label: 'Audit Log',        icon: Activity   },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function MmpStateReport({
  open, onClose, stateName, rawEntries, coordinatorNames, advanceMap, mmpId, mmpName,
}: MmpStateReportProps) {
  const { currentUser } = useUser();
  const [loading, setLoading]               = useState(false);
  const [auditLogs, setAuditLogs]           = useState<any[]>([]);
  const [advancesDetail, setAdvancesDetail] = useState<any[]>([]);
  const [userMap, setUserMap]               = useState<Record<string, string>>({});
  const [siteCollectorMap, setSiteCollectorMap] = useState<Record<string, string>>({});
  const [cycleStatus, setCycleStatus]       = useState<string>('active');
  const [exporting, setExporting]           = useState(false);
  const [activeTab, setActiveTab]           = useState('summary');

  // ── Fetch supplementary data when modal opens ──────────────────────────────
  useEffect(() => {
    if (!open || rawEntries.length === 0) return;
    const siteIds = rawEntries.map((e: any) => e.id).filter(Boolean);

    const run = async () => {
      setLoading(true);
      try {
        const [logsRes, advRes, entriesRes, cycleRes] = await Promise.all([
          supabase
            .from('audit_logs')
            .select('id,entity_id,entity_name,actor_id,actor_name,action,description,changes,timestamp')
            .in('entity_id', siteIds)
            .eq('module', 'mmp')
            .order('timestamp', { ascending: true })
            .limit(5000),
          supabase
            .from('down_payment_requests')
            .select('id,mmp_site_entry_id,status,requested_amount,approved_amount,total_paid_amount,requested_by,requested_at,hub_name')
            .in('mmp_site_entry_id', siteIds),
          // Fetch accepted_by (primary collector field) for all site entries —
          // SiteStatusDetail only carries claimedBy (claimed_by UUID) but most
          // sites store the collector in accepted_by (text: UUID, email or name)
          supabase
            .from('mmp_site_entries')
            .select('id,accepted_by,claimed_by,visit_started_by')
            .in('id', siteIds),
          // Fetch cycle status for this MMP
          mmpId
            ? supabase.from('mmp_files').select('cycle_status').eq('id', mmpId).single()
            : Promise.resolve({ data: null, error: null }),
        ]);

        const logs    = logsRes.data    || [];
        const adv     = advRes.data     || [];
        const entries = entriesRes.data || [];
        setAuditLogs(logs);
        setAdvancesDetail(adv);

        // Build siteId → collectorId map from accepted_by / claimed_by
        const isUuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const colMap: Record<string, string> = {};
        entries.forEach((row: any) => {
          if (!row.id) return;
          // Priority: accepted_by → claimed_by → visit_started_by
          const val = row.accepted_by || row.claimed_by || row.visit_started_by || '';
          if (val) colMap[row.id] = val;
        });
        setSiteCollectorMap(colMap);

        if (cycleRes.data) {
          setCycleStatus((cycleRes.data as any).cycle_status || 'active');
        }

        // Collect all unique user IDs for name resolution
        const idSet = new Set<string>();
        rawEntries.forEach((e: any) => {
          const ad = e.additional_data || e.additionalData || {};
          [
            e.dispatched_by,   e.dispatchedBy,
            e.forwarded_by_user_id, e.forwardedByUserId,
            e.forwarded_to_user_id, e.forwardedToUserId,
            e.accepted_by,     e.acceptedBy,
            e.claimedBy,                             // ← SiteStatusDetail field (claimed_by UUID)
            e.actionBy,                              // ← SiteStatusDetail last-actor field
            e.visit_started_by, e.visitStartedBy,
            e.visit_completed_by, e.visitCompletedBy,
            e.verified_by,     e.verifiedBy,
            e.rejected_by,     e.rejectedBy,
            ad.assigned_to,    ad.claimed_by,
          ].forEach(v => { if (typeof v === 'string' && v.length > 10 && isUuidRe.test(v)) idSet.add(v); });
        });
        // Also add accepted_by UUIDs from the direct DB fetch
        entries.forEach((row: any) => {
          ['accepted_by', 'claimed_by', 'visit_started_by'].forEach(f => {
            const v = row[f];
            if (typeof v === 'string' && isUuidRe.test(v)) idSet.add(v);
          });
        });
        logs.forEach((l: any) => { if (l.actor_id) idSet.add(l.actor_id); });
        adv.forEach((a: any)  => { if (a.requested_by) idSet.add(a.requested_by); });

        if (idSet.size > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id,full_name,email')
            .in('id', Array.from(idSet));
          const map: Record<string, string> = {};
          (profiles || []).forEach((p: any) => {
            map[p.id] = p.full_name || p.email || p.id.substring(0, 8);
          });
          setUserMap(map);
        }
      } finally {
        setLoading(false);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rawEntries]);

  // ── Name resolution ────────────────────────────────────────────────────────
  const resolveName = (id: any): string => {
    if (!id) return '—';
    if (typeof id !== 'string') return String(id);
    return coordinatorNames[id] || userMap[id] || (id.length > 10 ? id.substring(0, 8) + '…' : id);
  };

  // ── Derived: sites ─────────────────────────────────────────────────────────
  const sites = useMemo<ReportSiteRow[]>(() => {
    const isUuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return rawEntries.map((e: any) => {
      const ad     = e.additional_data || e.additionalData || {};
      const status = (e.status || '').toLowerCase().trim();
      const cat    = statusCategory(status);
      const adv    = advanceMap[e.id];

      const coordId = ad.assigned_to || e.forwarded_to_user_id || e.forwardedToUserId || '';

      // collectorRaw: accepted_by from DB (via siteCollectorMap) takes priority — it's the most
      // reliable collector identifier. Falls back to claimedBy (SiteStatusDetail UUID) and other fields.
      const collectorRaw =
        siteCollectorMap[e.id] ||          // DB accepted_by / claimed_by (UUID or text)
        e.claimedBy ||                     // SiteStatusDetail: claimed_by UUID
        e.accepted_by || e.acceptedBy ||   // raw DB row fallbacks
        ad.claimed_by ||
        e.visit_started_by || '';

      // Determine if the raw value is a UUID (look up in userMap) or a direct name
      const collectorIsUuid = isUuidRe.test(collectorRaw);
      const collectorId     = collectorIsUuid ? collectorRaw : '';
      const collectorDirect = !collectorIsUuid && collectorRaw ? cleanName(collectorRaw) : '';

      const timestamps = [
        e.dispatched_at, e.dispatchedAt,
        e.forwarded_at,  e.forwardedAt,
        e.accepted_at,   e.acceptedAt,
        e.actionAt,                        // SiteStatusDetail last-action timestamp
        e.visit_started_at, e.visit_completed_at,
        e.verified_at,   e.verifiedAt,
        e.updated_at,    e.updatedAt,
      ].filter(Boolean);
      const latestTs = timestamps.reduce((latest, ts) => {
        try { return new Date(ts) > new Date(latest) ? ts : latest; } catch { return latest; }
      }, timestamps[0] || '');

      // Resolve data collector name: UUID → userMap → coordinatorNames → direct text → '—'
      const collectorName =
        (collectorId ? (userMap[collectorId] || coordinatorNames[collectorId]) : '') ||
        collectorDirect ||
        cleanName(ad.collector_name || e.collectorName) ||
        '—';

      return {
        id: e.id || '',
        siteName:   cleanName(e.site_name || e.siteName || e.name || 'Unknown'),
        siteCode:   e.site_code || e.siteCode || '',
        locality:   cleanName(e.locality || e.localityName || ''),
        hub:        e.hub_office || e.hub_name || e.hubName || '',
        cpName:     e.cp_name || e.cpName || '',
        status:     status || 'unknown',
        statusCategory: cat,
        coordinatorName:   coordinatorNames[coordId] || userMap[coordId] || cleanName(ad.assigned_to_name || e.coordinator_name) || '—',
        dataCollectorName: collectorName,
        daysInCurrentStatus: daysSince(latestTs),
        planReceivedAt:  fmtShort(e.forwarded_at || e.forwardedAt || e.dispatched_at || e.dispatchedAt),
        dispatchedAt:    e.dispatched_at    || e.dispatchedAt    || '',
        acceptedAt:      e.accepted_at      || e.acceptedAt      || '',
        visitStartedAt:  e.visit_started_at || '',
        visitCompletedAt:e.visit_completed_at || e.completedAt   || '',
        verifiedAt:      e.verified_at      || e.verifiedAt      || '',
        rejectedAt:      e.rejected_at      || e.rejectedAt      || '',
        dispatchedBy:    resolveName(e.dispatched_by  || e.dispatchedBy),
        acceptedByName:  resolveName(e.accepted_by    || e.acceptedBy || e.claimedBy),
        verifiedByName:  resolveName(e.verified_by    || e.verifiedBy),
        advanceStatus:    adv?.status          || '',
        advanceRequested: adv?.requestedAmount || 0,
        advanceApproved:  adv?.approvedAmount  || 0,
        advancePaid:      adv?.totalPaid       || 0,
        transportBudget:  e.transport_fee != null ? Number(e.transport_fee) : 0,
        comments:   e.comments || '',
        nextStep:   nextStep(status),
        updatedAt:  latestTs,
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEntries, coordinatorNames, userMap, advanceMap, siteCollectorMap]);

  // ── Derived: coordinators ──────────────────────────────────────────────────
  const coordinatorRows = useMemo<ReportCoordinatorRow[]>(() => {
    const map = new Map<string, { name: string; sites: ReportSiteRow[]; receivedAt: string }>();
    sites.forEach(site => {
      const name = (!site.coordinatorName || site.coordinatorName === '—') ? 'Unassigned' : site.coordinatorName;
      if (!map.has(name)) map.set(name, { name, sites: [], receivedAt: site.planReceivedAt });
      map.get(name)!.sites.push(site);
    });
    return Array.from(map.values()).map(({ name, sites: cs, receivedAt }) => {
      const timestamps = cs.flatMap(s => [s.dispatchedAt, s.acceptedAt, s.visitStartedAt, s.verifiedAt].filter(v => v && v !== '—'));
      const firstAction = timestamps.length ? timestamps.reduce((a, b) => a < b ? a : b) : '—';
      const lastAction  = timestamps.length ? timestamps.reduce((a, b) => a > b ? a : b) : '—';
      const advTotal    = cs.reduce((sum, s) => sum + (s.advanceRequested || 0), 0);
      return {
        name,
        sitesAssigned:  cs.length,
        completed:      cs.filter(s => s.statusCategory === 'verified').length,
        inProgress:     cs.filter(s => s.statusCategory === 'in_progress').length,
        pending:        cs.filter(s => s.statusCategory === 'pending').length,
        returned:       cs.filter(s => s.statusCategory === 'returned' || s.statusCategory === 'rejected').length,
        planReceivedAt: receivedAt,
        firstActionAt:  firstAction !== '—' ? fmtShort(firstAction) : '—',
        lastActionAt:   lastAction  !== '—' ? fmtShort(lastAction)  : '—',
        daysActive:     firstAction !== '—' ? differenceInDays(new Date(), new Date(firstAction)) : 0,
        staleSites:     cs.filter(s => s.statusCategory === 'in_progress' && s.daysInCurrentStatus >= 7).length,
        advancesIssued: cs.filter(s => s.advanceStatus && !['cancelled','rejected',''].includes(s.advanceStatus)).length,
        totalAdvanceRequested: advTotal,
      };
    }).sort((a, b) => b.sitesAssigned - a.sitesAssigned);
  }, [sites]);

  // ── Derived: data collectors ───────────────────────────────────────────────
  const collectorRows = useMemo<ReportCollectorRow[]>(() => {
    const map = new Map<string, ReportSiteRow[]>();
    sites.forEach(site => {
      const name = site.dataCollectorName;
      if (!name || name === '—') return;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(site);
    });
    return Array.from(map.entries()).map(([name, cs]) => {
      const claimTimes = cs.map(s => s.acceptedAt).filter(v => v && v !== '—');
      const activityTimes = cs.flatMap(s => [s.acceptedAt, s.visitStartedAt, s.visitCompletedAt, s.verifiedAt].filter(v => v && v !== '—'));
      const advancesForCollector = advancesDetail.filter(a => {
        const site = sites.find(s => s.id === a.mmp_site_entry_id);
        return site?.dataCollectorName === name;
      });
      return {
        name,
        claimedSites:   cs.length,
        completedSites: cs.filter(s => s.statusCategory === 'verified').length,
        inProgressSites:cs.filter(s => s.statusCategory === 'in_progress').length,
        firstClaimAt:   claimTimes.length ? fmtShort(claimTimes.reduce((a, b) => a < b ? a : b)) : '—',
        lastActivityAt: activityTimes.length ? fmtShort(activityTimes.reduce((a, b) => a > b ? a : b)) : '—',
        advancesRequested: advancesForCollector.length,
        advancesApproved:  advancesForCollector.filter(a => ['approved','partially_paid','fully_paid'].includes(a.status)).length,
        totalAmountRequested: advancesForCollector.reduce((sum, a) => sum + (Number(a.requested_amount) || 0), 0),
      };
    }).sort((a, b) => b.claimedSites - a.claimedSites);
  }, [sites, advancesDetail]);

  // ── Derived: audit ─────────────────────────────────────────────────────────
  const auditRows = useMemo<ReportAuditRow[]>(() => {
    return [...auditLogs].reverse().map(log => {
      const changes    = log.changes || {};
      const fromStatus = changes?.status?.from || changes?.old_status || '';
      const toStatus   = changes?.status?.to   || changes?.new_status || '';
      return {
        timestamp:   fmt(log.timestamp),
        siteName:    log.entity_name || '—',
        actorName:   log.actor_name  || userMap[log.actor_id] || '—',
        action:      (log.action || '').replace(/_/g, ' '),
        description: log.description || '',
        fromStatus:  fromStatus || '—',
        toStatus:    toStatus   || '—',
      };
    });
  }, [auditLogs, userMap]);

  // ── Derived: attention items ────────────────────────────────────────────────
  const attentionItems = useMemo<AttentionRow[]>(() => {
    const items: AttentionRow[] = [];
    sites.forEach(site => {
      const d = site.daysInCurrentStatus;
      if (site.statusCategory === 'in_progress' && d >= 7)
        items.push({ category: 'Stale Site', siteName: site.siteName, locality: site.locality, coordinator: site.coordinatorName, dataCollector: site.dataCollectorName, detail: `In progress for ${d} days with no status change`, daysAffected: d });
      if (['in_progress','verified'].includes(site.statusCategory) && !site.advanceStatus)
        items.push({ category: 'Missing Advance', siteName: site.siteName, locality: site.locality, coordinator: site.coordinatorName, dataCollector: site.dataCollectorName, detail: 'Site accepted/completed but no advance fund requested', daysAffected: d });
      if (site.statusCategory === 'returned')
        items.push({ category: 'Returned – Needs Re-dispatch', siteName: site.siteName, locality: site.locality, coordinator: site.coordinatorName, dataCollector: site.dataCollectorName, detail: 'Site returned — awaiting coordinator re-dispatch', daysAffected: d });
      if (site.statusCategory === 'rejected')
        items.push({ category: 'Rejected Site', siteName: site.siteName, locality: site.locality, coordinator: site.coordinatorName, dataCollector: site.dataCollectorName, detail: 'Site rejected — requires escalation or closure', daysAffected: d });
      if (!site.coordinatorName || site.coordinatorName === '—' || site.coordinatorName === 'Unassigned')
        items.push({ category: 'Unassigned Site', siteName: site.siteName, locality: site.locality, coordinator: '—', dataCollector: '—', detail: 'No coordinator assigned to this site', daysAffected: d });
      if (site.statusCategory === 'pending' && d >= 14)
        items.push({ category: 'Pending Too Long', siteName: site.siteName, locality: site.locality, coordinator: site.coordinatorName, dataCollector: site.dataCollectorName, detail: `Pending for ${d} days — no movement`, daysAffected: d });
    });
    return items.sort((a, b) => b.daysAffected - a.daysAffected);
  }, [sites]);

  // ── Derived: summary numbers ───────────────────────────────────────────────
  const cycleSummary = useMemo(() => {
    const verified   = sites.filter(s => s.statusCategory === 'verified').length;
    const inProgress = sites.filter(s => s.statusCategory === 'in_progress').length;
    const returned   = sites.filter(s => s.statusCategory === 'returned').length;
    const rejected   = sites.filter(s => s.statusCategory === 'rejected').length;
    const pending    = sites.filter(s => s.statusCategory === 'pending').length;
    const total      = sites.length;
    const noAdvance  = sites.filter(s => !s.advanceStatus || s.advanceStatus === '' || ['cancelled','rejected'].includes(s.advanceStatus)).length;
    return {
      totalSites: total, verified, inProgress, returned, rejected, pending,
      coveragePct: total > 0 ? Math.round((verified / total) * 100) : 0,
      noAdvance,
      totalAdvanceRequested: advancesDetail.reduce((s, a) => s + (Number(a.requested_amount) || 0), 0),
      totalAdvanceApproved:  advancesDetail.reduce((s, a) => s + (Number(a.approved_amount)  || 0), 0),
      totalAdvancePaid:      advancesDetail.reduce((s, a) => s + (Number(a.total_paid_amount)|| 0), 0),
    };
  }, [sites, advancesDetail]);

  // ── Derived: cycle timeline ────────────────────────────────────────────────
  const cycleTimeline = useMemo(() => {
    const events: { milestone: string; dateTime: string }[] = [];
    const allTs = (field: string) => rawEntries.map((e: any) => e[field]).filter(Boolean).sort();
    const first = (arr: string[]) => arr[0]              ? fmt(arr[0])              : '—';
    const last  = (arr: string[]) => arr[arr.length - 1] ? fmt(arr[arr.length - 1]) : '—';
    const dispatched = allTs('dispatched_at');
    const forwarded  = allTs('forwarded_at');
    const accepted   = allTs('accepted_at');
    const started    = allTs('visit_started_at');
    const completed  = allTs('visit_completed_at');
    const verified   = allTs('verified_at');
    if (forwarded.length)  events.push({ milestone: 'Plan sent to coordinators',        dateTime: first(forwarded)  });
    if (dispatched.length) events.push({ milestone: 'First site dispatched',            dateTime: first(dispatched) });
    if (accepted.length)   events.push({ milestone: 'First site accepted by collector', dateTime: first(accepted)   });
    if (started.length)    events.push({ milestone: 'First visit started',              dateTime: first(started)    });
    if (completed.length)  events.push({ milestone: 'First visit completed',            dateTime: first(completed)  });
    if (verified.length) {
      events.push({ milestone: 'First site verified', dateTime: first(verified) });
      events.push({ milestone: 'Last site verified',  dateTime: last(verified)  });
    }
    return events;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawEntries]);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setExporting(true);
    try {
      const reportData: MmpReportData = {
        mmpName: mmpName || mmpId,
        stateName,
        generatedBy: currentUser?.name || currentUser?.email || 'Unknown',
        generatedAt: new Date(),
        sites, coordinators: coordinatorRows, collectors: collectorRows,
        auditLog: auditRows, attentionItems, cycleSummary, cycleTimeline,
      };
      exportMmpStateReport(reportData);
    } finally {
      setExporting(false);
    }
  };

  // ── Tab labels (dynamic counts) ────────────────────────────────────────────
  const tabLabel = (value: string) => {
    if (value === 'sites')      return `All Sites (${sites.length})`;
    if (value === 'attention')  return `Attention (${attentionItems.length})`;
    if (value === 'audit')      return `Audit Log (${auditRows.length})`;
    if (value === 'collectors') return `Data Collectors (${collectorRows.length})`;
    return TABS.find(t => t.value === value)?.label || value;
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-[98vw] w-[98vw] p-0 gap-0 overflow-hidden"
        style={{ height: '96vh', maxHeight: '96vh' }}
      >
        {/* Inner flex wrapper — DialogContent uses display:grid which fights flex-1/min-h-0.
            Wrapping in a plain div gives us a clean flex column that fills the fixed height. */}
        <div className="flex flex-col w-full overflow-hidden" style={{ height: '96vh' }}>

        {/* ── Fixed header ── */}
        <DialogHeader className="px-6 pt-4 pb-3 border-b flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-purple-600 shrink-0" />
                Operational Report — {stateName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {mmpName} · Generated {format(new Date(), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {/* Cycle open / closed badge */}
              {cycleStatus === 'closed' ? (
                <Badge className="gap-1 bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-xs px-2 py-0.5 border border-slate-300 dark:border-slate-600">
                  <LockKeyhole className="h-3 w-3" /> Cycle Closed
                </Badge>
              ) : cycleStatus === 'closing' ? (
                <Badge className="gap-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs px-2 py-0.5 border border-amber-300 dark:border-amber-700">
                  <Clock className="h-3 w-3" /> Closing
                </Badge>
              ) : cycleStatus === 'pending_approval' ? (
                <Badge className="gap-1 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs px-2 py-0.5 border border-purple-300 dark:border-purple-700">
                  <Clock className="h-3 w-3" /> Pending Approval
                </Badge>
              ) : (
                <Badge className="gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs px-2 py-0.5 border border-green-300 dark:border-green-700">
                  <Unlock className="h-3 w-3" /> Cycle Open
                </Badge>
              )}
              <Button
                onClick={handleExport}
                disabled={loading || exporting}
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs"
              >
                {exporting
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />}
                Export Excel (6 sheets)
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Quick-stat bar ── */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-6 py-2 bg-muted/30 border-b text-xs flex-shrink-0">
          {[
            { label: 'Total Sites',  value: cycleSummary.totalSites,   cls: 'font-bold text-foreground' },
            { label: 'Verified',     value: cycleSummary.verified,      cls: 'text-green-700 dark:text-green-400' },
            { label: 'In Progress',  value: cycleSummary.inProgress,    cls: 'text-blue-700 dark:text-blue-400' },
            { label: 'Pending',      value: cycleSummary.pending,       cls: 'text-amber-700 dark:text-amber-400' },
            { label: 'Returned',     value: cycleSummary.returned,      cls: 'text-orange-700 dark:text-orange-400' },
            { label: 'Rejected',     value: cycleSummary.rejected,      cls: 'text-red-700 dark:text-red-400' },
            { label: 'Coverage',     value: `${cycleSummary.coveragePct}%`, cls: 'text-purple-700 dark:text-purple-400 font-semibold' },
            { label: '⚑ Attention', value: attentionItems.length,       cls: attentionItems.length > 0 ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="flex items-center gap-1">
              <span className="text-muted-foreground">{label}:</span>
              <span className={cls}>{value}</span>
            </div>
          ))}
        </div>

        {/* ── Tab bar ── */}
        <div className="flex items-end border-b flex-shrink-0 overflow-x-auto px-4">
          {TABS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs whitespace-nowrap border-b-2 transition-colors ${
                activeTab === value
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {tabLabel(value)}
              {value === 'attention' && attentionItems.length > 0 && (
                <span className="ml-0.5 bg-red-500 text-white text-[10px] rounded-full px-1.5 leading-4">
                  {attentionItems.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Scrollable tab content ── */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">

          {/* Summary */}
          {activeTab === 'summary' && (
            <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Coverage */}
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-purple-500" />Coverage Dashboard
                </h3>
                <div className="space-y-1 text-sm">
                  {[
                    { label: 'Total Sites',           value: cycleSummary.totalSites,          cls: '' },
                    { label: 'Verified / Approved',   value: cycleSummary.verified,            cls: 'text-green-700 dark:text-green-400' },
                    { label: 'In Progress',           value: cycleSummary.inProgress,          cls: 'text-blue-700 dark:text-blue-400' },
                    { label: 'Pending / Not Started', value: cycleSummary.pending,             cls: 'text-amber-700 dark:text-amber-400' },
                    { label: 'Returned',              value: cycleSummary.returned,            cls: 'text-orange-700 dark:text-orange-400' },
                    { label: 'Rejected',              value: cycleSummary.rejected,            cls: 'text-red-700 dark:text-red-400' },
                    { label: 'Coverage %',            value: `${cycleSummary.coveragePct}%`,  cls: 'text-purple-700 dark:text-purple-400 font-bold' },
                    { label: 'Sites Without Advance', value: cycleSummary.noAdvance,           cls: 'text-orange-700 dark:text-orange-400' },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="flex justify-between border-b border-border/30 py-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={`font-medium ${cls}`}>{value}</span>
                    </div>
                  ))}
                </div>
                {cycleSummary.totalSites > 0 && (
                  <div className="mt-3 h-3 rounded-full overflow-hidden bg-muted flex">
                    <div className="bg-green-500" style={{ width: `${(cycleSummary.verified   / cycleSummary.totalSites) * 100}%` }} />
                    <div className="bg-blue-400"  style={{ width: `${(cycleSummary.inProgress / cycleSummary.totalSites) * 100}%` }} />
                    <div className="bg-amber-400" style={{ width: `${(cycleSummary.pending    / cycleSummary.totalSites) * 100}%` }} />
                    <div className="bg-orange-400"style={{ width: `${(cycleSummary.returned   / cycleSummary.totalSites) * 100}%` }} />
                    <div className="bg-red-500"   style={{ width: `${(cycleSummary.rejected   / cycleSummary.totalSites) * 100}%` }} />
                  </div>
                )}
              </div>

              {/* Financial */}
              <div>
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <FileText className="h-4 w-4 text-blue-500" />Financial Summary
                </h3>
                <div className="space-y-1 text-sm">
                  {[
                    { label: 'Advances Requested',    value: advancesDetail.length },
                    { label: 'Advances Approved',     value: advancesDetail.filter(a => ['approved','partially_paid','fully_paid'].includes(a.status)).length },
                    { label: 'Advances Pending',      value: advancesDetail.filter(a => ['pending_supervisor','pending_admin'].includes(a.status)).length },
                    { label: 'Advances Rejected',     value: advancesDetail.filter(a => a.status === 'rejected').length },
                    { label: 'Total Requested (SDG)', value: cycleSummary.totalAdvanceRequested.toLocaleString() },
                    { label: 'Total Approved (SDG)',  value: cycleSummary.totalAdvanceApproved.toLocaleString() },
                    { label: 'Total Paid (SDG)',       value: cycleSummary.totalAdvancePaid.toLocaleString() },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between border-b border-border/30 py-1">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Cycle timeline */}
              <div className="md:col-span-2">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-amber-500" />Cycle Timeline
                </h3>
                {cycleTimeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No timeline data available.</p>
                ) : (
                  <div className="relative border-l-2 border-purple-200 dark:border-purple-800 pl-4 space-y-3">
                    {cycleTimeline.map((tl, i) => (
                      <div key={i} className="relative">
                        <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-purple-400 border-2 border-background top-1" />
                        <p className="text-sm font-medium">{tl.milestone}</p>
                        <p className="text-xs text-muted-foreground">{tl.dateTime}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coordinators */}
          {activeTab === 'coordinators' && (
            <div className="px-4 py-3">
              {coordinatorRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <Users className="h-8 w-8" />
                  <p className="text-sm">No coordinator data available.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['Coordinator','Assigned','Completed','In Progress','Pending','Returned','Plan Received','First Action','Last Action','Days Active','Stale','Advances','Total Requested (SDG)'].map(h => (
                        <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coordinatorRows.map(coord => (
                      <TableRow key={coord.name} className={coord.staleSites > 0 ? 'bg-orange-50/40 dark:bg-orange-950/20' : ''}>
                        <TableCell className="font-medium text-sm">{coord.name}</TableCell>
                        <TableCell className="text-center">{coord.sitesAssigned}</TableCell>
                        <TableCell className="text-center text-green-700">{coord.completed}</TableCell>
                        <TableCell className="text-center text-blue-700">{coord.inProgress}</TableCell>
                        <TableCell className="text-center text-amber-700">{coord.pending}</TableCell>
                        <TableCell className="text-center text-orange-700">{coord.returned}</TableCell>
                        <TableCell className="text-xs">{coord.planReceivedAt}</TableCell>
                        <TableCell className="text-xs">{coord.firstActionAt}</TableCell>
                        <TableCell className="text-xs">{coord.lastActionAt}</TableCell>
                        <TableCell className="text-center">{coord.daysActive}</TableCell>
                        <TableCell className="text-center">
                          {coord.staleSites > 0
                            ? <Badge className="bg-orange-100 text-orange-700 text-[10px]">{coord.staleSites}</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">{coord.advancesIssued}</TableCell>
                        <TableCell className="text-right">{coord.totalAdvanceRequested.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* Data Collectors */}
          {activeTab === 'collectors' && (
            <div className="px-4 py-3">
              {loading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading collector data…</span>
                </div>
              ) : collectorRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
                  <User className="h-8 w-8" />
                  <p className="text-sm">No data collector activity recorded for this state.</p>
                  <p className="text-xs text-center max-w-sm">
                    Collectors are linked via the "accepted by" or "claimed by" fields on each site entry.
                    Sites must be accepted/claimed by a collector for them to appear here.
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['Data Collector / Enumerator','Claimed Sites','Completed','In Progress','First Claim','Last Activity','Advances Req.','Adv. Approved','Total Requested (SDG)'].map(h => (
                        <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collectorRows.map(col => (
                      <TableRow key={col.name}>
                        <TableCell className="font-medium text-sm">{col.name}</TableCell>
                        <TableCell className="text-center">{col.claimedSites}</TableCell>
                        <TableCell className="text-center text-green-700">{col.completedSites}</TableCell>
                        <TableCell className="text-center text-blue-700">{col.inProgressSites}</TableCell>
                        <TableCell className="text-xs">{col.firstClaimAt}</TableCell>
                        <TableCell className="text-xs">{col.lastActivityAt}</TableCell>
                        <TableCell className="text-center">{col.advancesRequested}</TableCell>
                        <TableCell className="text-center">{col.advancesApproved}</TableCell>
                        <TableCell className="text-right">{col.totalAmountRequested.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* All Sites */}
          {activeTab === 'sites' && (
            <div className="px-4 py-3">
              <Table>
                <TableHeader>
                  <TableRow>
                    {['#','Site Name','Locality','Status','Coordinator','Data Collector','Days in Status','Dispatched','Accepted','Verified/Done','Advance','Requested (SDG)','Next Step'].map(h => (
                      <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...sites].sort((a, b) => a.siteName.localeCompare(b.siteName)).map((site, idx) => (
                    <TableRow key={site.id} className={STATUS_ROW[site.statusCategory]}>
                      <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm max-w-[180px]">
                        <div className="truncate" title={site.siteName}>{site.siteName}</div>
                        {site.siteCode && <div className="text-[10px] text-muted-foreground">{site.siteCode}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{site.locality || '—'}</TableCell>
                      <TableCell>
                        <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_BADGE[site.statusCategory] || ''}`}>
                          {site.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-[140px]">
                        <div className="truncate">{site.coordinatorName}</div>
                      </TableCell>
                      <TableCell className="text-xs max-w-[140px]">
                        <div className="truncate">{site.dataCollectorName}</div>
                      </TableCell>
                      <TableCell className="text-center text-xs">
                        {site.daysInCurrentStatus > 7 && site.statusCategory === 'in_progress'
                          ? <Badge className="bg-orange-100 text-orange-700 text-[10px]">{site.daysInCurrentStatus}d</Badge>
                          : site.daysInCurrentStatus || '—'}
                      </TableCell>
                      <TableCell className="text-xs">{site.dispatchedAt    ? fmtShort(site.dispatchedAt)    : '—'}</TableCell>
                      <TableCell className="text-xs">{site.acceptedAt      ? fmtShort(site.acceptedAt)      : '—'}</TableCell>
                      <TableCell className="text-xs">{(site.verifiedAt || site.visitCompletedAt) ? fmtShort(site.verifiedAt || site.visitCompletedAt) : '—'}</TableCell>
                      <TableCell>
                        {site.advanceStatus ? (
                          <Badge className={`text-[10px] px-1.5 py-0 ${
                            site.advanceStatus === 'fully_paid'         ? 'bg-emerald-100 text-emerald-700' :
                            site.advanceStatus.startsWith('pending')    ? 'bg-amber-100 text-amber-700' :
                            'bg-blue-100 text-blue-700'}`}>
                            {site.advanceStatus.replace(/_/g, ' ')}
                          </Badge>
                        ) : <span className="text-[10px] text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs text-right">{site.advanceRequested > 0 ? site.advanceRequested.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        <div className="truncate" title={site.nextStep}>{site.nextStep}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Attention Items */}
          {activeTab === 'attention' && (
            <div className="px-4 py-3">
              {attentionItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-10 w-10" />
                  <p className="text-sm font-medium">No attention items — all sites are on track</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['Category','Site Name','Locality','Coordinator','Data Collector','Action Required','Days Affected'].map(h => (
                        <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attentionItems.map((item, idx) => {
                      const catColor: Record<string, string> = {
                        'Stale Site':                   'bg-orange-100 text-orange-700',
                        'Missing Advance':              'bg-yellow-100 text-yellow-700',
                        'Returned – Needs Re-dispatch': 'bg-orange-100 text-orange-700',
                        'Rejected Site':                'bg-red-100 text-red-700',
                        'Unassigned Site':              'bg-purple-100 text-purple-700',
                        'Pending Too Long':             'bg-pink-100 text-pink-700',
                      };
                      return (
                        <TableRow key={idx}>
                          <TableCell>
                            <Badge className={`text-[10px] px-1.5 py-0 ${catColor[item.category] || 'bg-muted'}`}>{item.category}</Badge>
                          </TableCell>
                          <TableCell className="font-medium text-sm">{item.siteName}</TableCell>
                          <TableCell className="text-xs">{item.locality || '—'}</TableCell>
                          <TableCell className="text-xs">{item.coordinator}</TableCell>
                          <TableCell className="text-xs">{item.dataCollector}</TableCell>
                          <TableCell className="text-xs max-w-[280px]">{item.detail}</TableCell>
                          <TableCell className="text-center">
                            <Badge className={`text-[10px] px-1.5 py-0 ${item.daysAffected >= 14 ? 'bg-red-100 text-red-700' : item.daysAffected >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>
                              {item.daysAffected}d
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* Audit Log */}
          {activeTab === 'audit' && (
            <div className="px-4 py-3">
              {loading ? (
                <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading audit history…</span>
                </div>
              ) : auditRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
                  <Activity className="h-8 w-8" />
                  <p className="text-sm">No audit events found for this state's sites.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {['Timestamp','Site Name','Changed By','Action','From Status','To Status','Description'].map(h => (
                        <TableHead key={h} className="text-xs whitespace-nowrap">{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditRows.map((log, idx) => (
                      <TableRow key={idx} className={idx % 2 === 0 ? '' : 'bg-muted/20'}>
                        <TableCell className="text-xs font-mono whitespace-nowrap">{log.timestamp}</TableCell>
                        <TableCell className="text-xs font-medium">{log.siteName}</TableCell>
                        <TableCell className="text-xs">{log.actorName}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{log.action}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{log.fromStatus}</TableCell>
                        <TableCell className="text-xs">{log.toStatus}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[300px]">{log.description}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

        </div>

        </div>{/* end inner flex wrapper */}
      </DialogContent>
    </Dialog>
  );
}
