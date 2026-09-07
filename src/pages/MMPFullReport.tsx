import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, Download, FileSpreadsheet, Loader2, MapPin,
  Users, CheckCircle2, Clock, AlertCircle, TrendingUp, Calendar, BarChart3,
} from 'lucide-react';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ── Status classification ────────────────────────────────────────────────────
// Only truly terminal statuses count as "Covered/Done":
//   wfp_confirmed — WFP confirmed receipt (gold standard)
//   completed     — legacy pre-Phase-A terminal value
// Everything else — including submitted, verified, approved, costed,
// approved_and_costed — is still in the approval/confirmation pipeline
// and must NOT count as covered. These were inflating coverage numbers.
const DONE_STATUSES = new Set([
  'wfp_confirmed',
  'completed',
]);
const IN_PROGRESS_STATUSES = new Set([
  'accepted', 'claimed', 'in_progress', 'ongoing', 'dispatched', 'assigned',
  'forwarded', 'forwarded_to_coordinator', 'forwarded_to_fom', 'permits_attached',
  'with_coordinators', 'submitted', 'submitted_for_review',
  // post-submission approval chain — NOT terminal completion
  'verified', 'approved', 'cp_verified', 'locality_permit_verified',
  'approved_and_costed', 'costed',
]);

function classifyStatus(status: string): 'done' | 'in_progress' | 'pending' {
  const s = (status || '').toLowerCase().trim();
  if (DONE_STATUSES.has(s)) return 'done';
  if (IN_PROGRESS_STATUSES.has(s)) return 'in_progress';
  return 'pending';
}

// ── Types ────────────────────────────────────────────────────────────────────
interface SiteEntry {
  id: string;
  site_name: string | null;
  site_code: string | null;
  status: string;
  hub_office: string | null;
  hub_name: string | null;
  forwarded_to_user_id: string | null;
  additional_data: Record<string, any> | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  cost: number | null;
  visit_completed_by: string | null;
}

interface StateStat {
  state: string;
  total: number;
  done: number;
  inProgress: number;
  pending: number;
  coveragePct: number;
  coordinatorIds: Set<string>;
  totalFees: number;
}

interface CoordStat {
  id: string;
  name: string;
  states: Set<string>;
  total: number;
  done: number;
  inProgress: number;
}

const MMPFullReport = () => {
  const { mmpId } = useParams<{ mmpId: string }>();
  const navigate = useNavigate();

  const [mmp, setMmp] = useState<any>(null);
  const [entries, setEntries] = useState<SiteEntry[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mmpId) return;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: reportError } = await supabase.rpc(
          'get_mmp_report_payload' as any,
          { p_mmp_id: mmpId } as any
        );
        if (reportError) throw reportError;
        const payload = (data || {}) as any;
        setMmp(payload.mmp || null);
        setEntries((payload.entries || []) as SiteEntry[]);
        setProfileMap(payload.profile_map || {});
      } catch (e: any) {
        setError(e?.message || 'You do not have access to this MMP report.');
      } finally {
        setLoading(false);
      }
    })();
  }, [mmpId]);

  // ── Derived stats ────────────────────────────────────────────────────────
  const { overall, byState, byCoordinator } = useMemo(() => {
    if (!entries.length) return { overall: null, byState: [], byCoordinator: [] };

    let totalDone = 0, totalInProgress = 0, totalPending = 0, totalFees = 0;
    const stateMap: Record<string, StateStat> = {};
    const coordMap: Record<string, CoordStat> = {};

    entries.forEach(e => {
      const stateName = e.hub_office || e.hub_name || 'Unknown State';
      const cls = classifyStatus(e.status);
      const fee = (Number(e.enumerator_fee || 0) + Number(e.transport_fee || 0)) || Number(e.cost || 0);
      totalFees += fee;

      if (cls === 'done') totalDone++;
      else if (cls === 'in_progress') totalInProgress++;
      else totalPending++;

      if (!stateMap[stateName]) {
        stateMap[stateName] = { state: stateName, total: 0, done: 0, inProgress: 0, pending: 0, coveragePct: 0, coordinatorIds: new Set(), totalFees: 0 };
      }
      const st = stateMap[stateName];
      st.total++;
      st.totalFees += fee;
      if (cls === 'done') st.done++;
      else if (cls === 'in_progress') st.inProgress++;
      else st.pending++;

      const coordId = (e.additional_data as any)?.assigned_to || e.forwarded_to_user_id;
      if (coordId) {
        st.coordinatorIds.add(coordId);

        if (!coordMap[coordId]) {
          coordMap[coordId] = { id: coordId, name: profileMap[coordId] || coordId, states: new Set(), total: 0, done: 0, inProgress: 0 };
        }
        const co = coordMap[coordId];
        co.states.add(stateName);
        co.total++;
        if (cls === 'done') co.done++;
        else if (cls === 'in_progress') co.inProgress++;
      }
    });

    const byState = Object.values(stateMap).map(s => ({
      ...s,
      coveragePct: s.total > 0 ? Math.round((s.done / s.total) * 100) : 0,
    })).sort((a, b) => b.total - a.total);

    const byCoordinator = Object.values(coordMap)
      .map(c => ({ ...c, name: profileMap[c.id] || c.id }))
      .sort((a, b) => b.total - a.total);

    return {
      overall: {
        total: entries.length,
        done: totalDone,
        inProgress: totalInProgress,
        pending: totalPending,
        coveragePct: entries.length > 0 ? Math.round((totalDone / entries.length) * 100) : 0,
        totalFees,
        states: Object.keys(stateMap).length,
        coordinators: Object.keys(coordMap).length,
      },
      byState,
      byCoordinator,
    };
  }, [entries, profileMap]);

  // ── PDF Export ───────────────────────────────────────────────────────────
  const exportPDF = () => {
    if (!overall || !mmp) return;
    const doc = new jsPDF({ orientation: 'landscape' });
    const title = mmp.name || mmp.mmp_id || 'MMP Report';
    const now = format(new Date(), 'dd MMM yyyy HH:mm');

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Full MMP Status Report`, 14, 16);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`${title} | ${(mmp.project as any)?.name || ''} | Generated: ${now}`, 14, 23);

    doc.setFontSize(10);
    doc.text(`Total Sites: ${overall.total}  |  Covered: ${overall.done} (${overall.coveragePct}%)  |  In Progress: ${overall.inProgress}  |  Pending: ${overall.pending}  |  States: ${overall.states}  |  Coordinators: ${overall.coordinators}`, 14, 30);

    // State table
    autoTable(doc, {
      startY: 36,
      head: [['State', 'Total Sites', 'Covered', 'In Progress', 'Pending', 'Coverage %', 'Coordinators']],
      body: byState.map(s => [
        s.state,
        s.total,
        s.done,
        s.inProgress,
        s.pending,
        `${s.coveragePct}%`,
        s.coordinatorIds.size,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 80, 160] },
      alternateRowStyles: { fillColor: [240, 244, 255] },
    });

    const afterState = (doc as any).lastAutoTable?.finalY + 10 || 80;

    // Coordinator table
    autoTable(doc, {
      startY: afterState,
      head: [['Coordinator', 'States', 'Total Sites', 'Covered', 'In Progress', 'Pending', 'Coverage %']],
      body: byCoordinator.map(c => [
        c.name,
        c.states.size,
        c.total,
        c.done,
        c.inProgress,
        c.total - c.done - c.inProgress,
        c.total > 0 ? `${Math.round((c.done / c.total) * 100)}%` : '0%',
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [60, 130, 80] },
      alternateRowStyles: { fillColor: [240, 255, 244] },
    });

    doc.save(`MMP-Full-Report-${mmp.mmp_id || mmpId}-${format(new Date(), 'yyyyMMdd')}.pdf`);
  };

  // ── Excel Export ─────────────────────────────────────────────────────────
  const exportExcel = () => {
    if (!overall || !mmp) return;
    const wb = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ['PACT Command Center — Full MMP Status Report'],
      [''],
      ['MMP Name', mmp.name || mmp.mmp_id || ''],
      ['Project', (mmp.project as any)?.name || ''],
      ['Status', mmp.status || ''],
      ['Generated', format(new Date(), 'dd MMM yyyy HH:mm')],
      [''],
      ['OVERALL SUMMARY'],
      ['Total Sites', overall.total],
      ['Covered (Done)', overall.done],
      ['Coverage %', `${overall.coveragePct}%`],
      ['In Progress', overall.inProgress],
      ['Pending', overall.pending],
      ['Total States', overall.states],
      ['Total Coordinators', overall.coordinators],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    // By-state sheet
    const stateRows = [
      ['State', 'Total Sites', 'Covered', 'In Progress', 'Pending', 'Coverage %', 'Coordinators', 'Total Fees (SDG)'],
      ...byState.map(s => [
        s.state, s.total, s.done, s.inProgress, s.pending,
        `${s.coveragePct}%`, s.coordinatorIds.size, s.totalFees,
      ]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(stateRows);
    XLSX.utils.book_append_sheet(wb, ws2, 'By State');

    // By-coordinator sheet
    const coordRows = [
      ['Coordinator', 'States Assigned', 'Total Sites', 'Covered', 'In Progress', 'Pending', 'Coverage %'],
      ...byCoordinator.map(c => [
        c.name, c.states.size, c.total, c.done, c.inProgress,
        c.total - c.done - c.inProgress,
        c.total > 0 ? `${Math.round((c.done / c.total) * 100)}%` : '0%',
      ]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(coordRows);
    XLSX.utils.book_append_sheet(wb, ws3, 'By Coordinator');

    // All sites sheet
    const siteRows = [
      ['Site Name', 'Site Code', 'State', 'Status', 'Category'],
      ...entries.map(e => [
        e.site_name || '', e.site_code || '',
        e.hub_office || e.hub_name || 'Unknown',
        e.status || '',
        classifyStatus(e.status),
      ]),
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(siteRows);
    XLSX.utils.book_append_sheet(wb, ws4, 'All Sites');

    XLSX.writeFile(wb, `MMP-Full-Report-${mmp.mmp_id || mmpId}-${format(new Date(), 'yyyyMMdd')}.xlsx`);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-3 text-muted-foreground">Loading MMP report…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-destructive font-medium">{error}</p>
        <Button variant="outline" onClick={() => navigate(mmpId ? `/mmp/${mmpId}` : '/mmp')}>Go Back</Button>
      </div>
    );
  }

  const mmpTitle = mmp?.name || mmp?.mmp_id || 'MMP Report';

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate(mmpId ? `/mmp/${mmpId}` : '/mmp')} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-bold text-lg leading-tight truncate">{mmpTitle}</h1>
            <p className="text-xs text-muted-foreground truncate">
              {(mmp?.project as any)?.name} {mmp?.created_at ? `· Uploaded ${format(new Date(mmp.created_at), 'dd MMM yyyy')}` : ''}
            </p>
          </div>
          {mmp?.status && (
            <Badge variant="outline" className="flex-shrink-0 capitalize">{mmp.status}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!overall} data-testid="button-export-excel">
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1.5" />
            Excel
          </Button>
          <Button variant="default" size="sm" onClick={exportPDF} disabled={!overall} data-testid="button-export-pdf">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            PDF
          </Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* ── Summary Cards ── */}
        {overall && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <Card className="col-span-2 sm:col-span-1 lg:col-span-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-muted-foreground">Total Sites</span>
                </div>
                <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">{overall.total.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">{overall.states} states · {overall.coordinators} coordinators</div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1 lg:col-span-2 border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-xs text-muted-foreground">Covered</span>
                </div>
                <div className="text-3xl font-bold text-green-700 dark:text-green-400">{overall.done.toLocaleString()}</div>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={overall.coveragePct} className="h-1.5 flex-1" />
                  <span className="text-xs font-medium text-green-600">{overall.coveragePct}%</span>
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1 lg:col-span-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-xs text-muted-foreground">In Progress</span>
                </div>
                <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">{overall.inProgress.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">{overall.total > 0 ? Math.round((overall.inProgress / overall.total) * 100) : 0}% of total</div>
              </CardContent>
            </Card>
            <Card className="col-span-2 sm:col-span-1 lg:col-span-2 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">Pending</span>
                </div>
                <div className="text-3xl font-bold text-red-600 dark:text-red-400">{overall.pending.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">{overall.total > 0 ? Math.round((overall.pending / overall.total) * 100) : 0}% of total</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── By State Table ── */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-base">Coverage by State</h2>
            <span className="text-xs text-muted-foreground">({byState.length} states)</span>
          </div>
          <div className="rounded-xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">State</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Total</th>
                    <th className="text-right px-3 py-2.5 font-medium text-green-700 dark:text-green-400">Covered</th>
                    <th className="text-right px-3 py-2.5 font-medium text-amber-700 dark:text-amber-400">In Progress</th>
                    <th className="text-right px-3 py-2.5 font-medium text-red-600 dark:text-red-400">Pending</th>
                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Coverage</th>
                    <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Coordinators</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {byState.map((s, i) => (
                    <tr key={s.state} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                      <td className="px-4 py-2.5 font-medium">{s.state}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{s.total}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400 font-medium">{s.done}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{s.inProgress}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{s.pending}</td>
                      <td className="px-4 py-2.5 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${s.coveragePct >= 70 ? 'bg-green-500' : s.coveragePct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${s.coveragePct}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold w-9 text-right tabular-nums">{s.coveragePct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{s.coordinatorIds.size}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  {overall && (
                    <tr className="bg-primary/5 font-semibold border-t-2">
                      <td className="px-4 py-2.5">Total</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{overall.total}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400">{overall.done}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{overall.inProgress}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{overall.pending}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-2 bg-primary rounded-full" style={{ width: `${overall.coveragePct}%` }} />
                          </div>
                          <span className="text-xs font-bold w-9 text-right">{overall.coveragePct}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{overall.coordinators}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── By Coordinator Table ── */}
        {byCoordinator.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-base">Coordinator Performance</h2>
              <span className="text-xs text-muted-foreground">({byCoordinator.length} coordinators)</span>
            </div>
            <div className="rounded-xl border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 border-b">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Coordinator</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">States</th>
                      <th className="text-right px-3 py-2.5 font-medium text-muted-foreground">Assigned</th>
                      <th className="text-right px-3 py-2.5 font-medium text-green-700 dark:text-green-400">Covered</th>
                      <th className="text-right px-3 py-2.5 font-medium text-amber-700 dark:text-amber-400">In Progress</th>
                      <th className="text-right px-3 py-2.5 font-medium text-red-600 dark:text-red-400">Pending</th>
                      <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {byCoordinator.map((c, i) => {
                      const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
                      const pending = c.total - c.done - c.inProgress;
                      return (
                        <tr key={c.id} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                          <td className="px-4 py-2.5 font-medium">{c.name}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{c.states.size}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{c.total}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-green-700 dark:text-green-400 font-medium">{c.done}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-amber-700 dark:text-amber-400">{c.inProgress}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{pending}</td>
                          <td className="px-4 py-2.5 min-w-[140px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                <div
                                  className={`h-2 rounded-full transition-all ${pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-semibold w-9 text-right tabular-nums">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ── Footer ── */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 pb-6 border-t">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Generated {format(new Date(), 'dd MMM yyyy, HH:mm')}
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            PACT Command Center — MMP Full Report
          </div>
        </div>
      </div>
    </div>
  );
};

export default MMPFullReport;
