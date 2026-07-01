import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Trash2, DollarSign, AlertCircle } from 'lucide-react';
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PartialPaymentRow {
  id: string;
  site_name: string | null;
  hub: string | null;
  requested_amount: number;
  approved_amount: number | null;
  partial_pct: number | null;
  created_at: string;
}

const FieldOperationManagerPage = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles, deleteMMPFile } = useMMP();
  const { checkPermission, hasAnyRole } = useAuthorization();
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const [partialRows, setPartialRows] = useState<PartialPaymentRow[]>([]);
  const [partialLoading, setPartialLoading] = useState(true);

  const canDeleteMMP = checkPermission('mmp', 'delete') || hasAnyRole(['admin', 'ict']);

  const allowed = hasAnyRole(['admin', 'ict', 'fom', 'superAdmin']);

  useEffect(() => {
    const fetchPartials = async () => {
      setPartialLoading(true);
      const { data } = await supabase
        .from('down_payment_requests')
        .select('id, site_name, hub, requested_amount, approved_amount, partial_pct, created_at')
        .eq('status', 'partially_paid')
        .order('created_at', { ascending: false });
      setPartialRows((data as PartialPaymentRow[]) || []);
      setPartialLoading(false);
    };
    if (allowed) fetchPartials();
  }, [allowed]);

  const partialStats = useMemo(() => {
    const totalFull = partialRows.reduce((s, r) => s + (r.approved_amount || r.requested_amount), 0);
    const totalPaid = partialRows.reduce((s, r) => {
      const base = r.approved_amount || r.requested_amount;
      const pct = r.partial_pct ?? 50;
      return s + Math.round(base * pct / 100);
    }, 0);
    const totalRemaining = totalFull - totalPaid;

    const bySite: Record<string, { count: number; paid: number; remaining: number }> = {};
    partialRows.forEach(r => {
      const site = r.site_name || 'Unknown';
      const base = r.approved_amount || r.requested_amount;
      const pct = r.partial_pct ?? 50;
      const paid = Math.round(base * pct / 100);
      if (!bySite[site]) bySite[site] = { count: 0, paid: 0, remaining: 0 };
      bySite[site].count++;
      bySite[site].paid += paid;
      bySite[site].remaining += base - paid;
    });

    return { totalFull, totalPaid, totalRemaining, bySite };
  }, [partialRows]);

  const sitesPerHub = useMemo(() => {
    const map: Record<string, number> = {};
    (mmpFiles || []).forEach(mmp => {
      const hub = (mmp as any).hub || (mmp as any).projectHub || 'Unknown';
      const siteCount =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites.length
          : typeof (mmp as any).siteCount === 'number'
            ? (mmp as any).siteCount
            : 0;
      map[hub] = (map[hub] || 0) + siteCount;
    });
    return map;
  }, [mmpFiles]);

  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-white rounded-xl shadow text-center">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 md:p-10 space-y-8">
      <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2">
        Field Operation Manager Page
      </h1>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Review and forward MMPs to related hubs before site-level execution.
      </p>

      <Card className="mb-8 p-6">
        <h2 className="text-xl font-semibold mb-4">Uploaded MMPs</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="px-4 py-2 text-left">MMP Name</th>
                <th className="px-4 py-2 text-left">Upload Date</th>
                <th className="px-4 py-2 text-left">Uploaded By</th>
                <th className="px-4 py-2 text-left">Role</th>
                <th className="px-4 py-2 text-left">Hub</th>
                <th className="px-4 py-2 text-left">Total Sites</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {(mmpFiles || []).map(mmp => {
                const uploadedBy = (mmp as any).uploadedBy;
                let uploadedByName = '-';
                let uploadedByRole = '-';
                if (typeof uploadedBy === 'object' && uploadedBy !== null) {
                  uploadedByName = uploadedBy.name || uploadedBy.fullName || uploadedBy.email || '-';
                  uploadedByRole = uploadedBy.role || '-';
                } else if (typeof uploadedBy === 'string') {
                  const match = uploadedBy.match(/^(.*)\s*\(([^)]+)\)\s*$/);
                  if (match) {
                    uploadedByName = match[1].trim() || '-';
                    uploadedByRole = match[2].trim() || '-';
                  } else {
                    uploadedByName = uploadedBy;
                  }
                }
                const hub = (mmp as any).hub || (mmp as any).projectHub || '-';
                const siteCount =
                  Array.isArray((mmp as any).sites)
                    ? (mmp as any).sites.length
                    : typeof (mmp as any).siteCount === 'number'
                      ? (mmp as any).siteCount
                      : 0;
                return (
                  <tr key={mmp.id} className="border-b last:border-0">
                    <td className="px-4 py-2">{(mmp as any).projectName || mmp.mmpId}</td>
                    <td className="px-4 py-2">{mmp.uploadedAt ? new Date(mmp.uploadedAt).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-2">{uploadedByName}</td>
                    <td className="px-4 py-2">
                      <Badge variant={uploadedByRole === 'Admin' ? 'default' : 'outline'}>
                        {uploadedByRole}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">{hub}</td>
                    <td className="px-4 py-2">{siteCount}</td>
                    <td className="px-4 py-2 flex gap-2 items-center">
                      <button
                        className="text-primary hover:underline text-xs"
                        onClick={() => navigate(`/mmp/${mmp.id}`)}
                      >
                        View
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="destructive" className="ml-2" onClick={() => setDeleteId(mmp.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete MMP File "{(mmp as any).projectName || mmp.mmpId}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. The MMP file and all its data will be permanently deleted from the system.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              disabled={deleting}
                              onClick={async () => {
                                setDeleting(true);
                                await deleteMMPFile(mmp.id);
                                setDeleting(false);
                                setDeleteId(null);
                              }}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                );
              })}
              {(!mmpFiles || mmpFiles.length === 0) && (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-muted-foreground">
                    No MMPs uploaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Total Sites Per Hub</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(sitesPerHub).map(([hub, count]) => (
            <div key={hub} className="bg-blue-50 dark:bg-gray-800 rounded-lg p-4 flex flex-col items-center">
              <div className="text-lg font-bold">{hub}</div>
              <div className="text-2xl font-extrabold text-blue-700">{count}</div>
              <div className="text-xs text-muted-foreground">Total Sites</div>
            </div>
          ))}
          {Object.keys(sitesPerHub).length === 0 && (
            <div className="text-center text-muted-foreground col-span-full">No data available.</div>
          )}
        </div>
      </Card>

      {/* Partial Payments Report */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-5 w-5 text-amber-600" />
          <h2 className="text-xl font-semibold">Partial Payments Report / تقرير المدفوعات الجزئية</h2>
          {partialRows.length > 0 && (
            <Badge variant="outline" className="ml-auto text-amber-700 border-amber-400">
              {partialRows.length} site{partialRows.length !== 1 ? 's' : ''} partially paid
            </Badge>
          )}
        </div>

        {partialLoading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading partial payment data…</p>
        ) : partialRows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No partially paid requests at this time.</p>
        ) : (
          <div className="space-y-5">
            {/* KPI summary row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Approved (full)</p>
                <p className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  SDG {partialStats.totalFull.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Paid So Far</p>
                <p className="text-xl font-bold tabular-nums text-green-700 dark:text-green-400">
                  SDG {partialStats.totalPaid.toLocaleString()}
                </p>
              </div>
              <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-4 text-center">
                <p className="text-xs text-muted-foreground mb-1">Total Remaining</p>
                <p className="text-xl font-bold tabular-nums text-rose-700 dark:text-rose-400">
                  SDG {partialStats.totalRemaining.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Per-site breakdown table */}
            <div>
              <p className="text-sm font-medium mb-2 text-muted-foreground">Breakdown by Site</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-amber-50/60 dark:bg-amber-900/20 border-b">
                      <th className="px-4 py-2 text-left font-semibold">Site</th>
                      <th className="px-4 py-2 text-right font-semibold">Requests</th>
                      <th className="px-4 py-2 text-right font-semibold">Paid So Far (SDG)</th>
                      <th className="px-4 py-2 text-right font-semibold">Remaining (SDG)</th>
                      <th className="px-4 py-2 text-left font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(partialStats.bySite)
                      .sort((a, b) => b[1].paid - a[1].paid)
                      .map(([site, stats]) => (
                        <tr key={site} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-2 font-medium">{site}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{stats.count}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-green-700 dark:text-green-400 font-semibold">
                            {stats.paid.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                            {stats.remaining.toLocaleString()}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant="outline" className="text-amber-700 border-amber-400 text-xs">
                              Partially Paid
                            </Badge>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Alert if large remaining balance */}
            {partialStats.totalRemaining > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  <strong>SDG {partialStats.totalRemaining.toLocaleString()}</strong> is still pending across{' '}
                  {partialRows.length} request{partialRows.length !== 1 ? 's' : ''}. These sites remain in &quot;Partially Paid&quot; status until the remainder is processed.
                </span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default FieldOperationManagerPage;
