import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MMPStatus } from '@/types';

const FIELD_OP_ROLE = 'fieldOpManager'; // Adjust if your AppRole uses a different value

const CATEGORY_LABELS = [
  { key: 'all', label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'pending', label: 'Pending' },
  { key: 'archived', label: 'Archived' },
];

const FieldOperationManagerPage = () => {
  const { roles } = useAppContext();
  const { mmpFiles } = useMMP();
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'approved' | 'pending' | 'archived'>('all');
  const [search, setSearch] = useState('');

  const allowed = roles?.includes('admin') || roles?.includes(FIELD_OP_ROLE as any);
  if (!allowed) {
    return (
      <div className="max-w-xl mx-auto mt-20 p-8 bg-white rounded-xl shadow text-center">
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    );
  }

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

  // Compute per-MMP summaries for the selected category (approved/pending/archived)
  const mmpSummaries = useMemo(() => {
    if (selectedCategory === 'all') return [];
    const summaries: Array<{
      mmpName: string;
      mmpId: string;
      covered: number;
      notCovered: number;
      total: number;
    }> = [];
    (mmpFiles || []).forEach(mmp => {
      let status: 'approved' | 'pending' | 'archived' = 'pending';
      const normStatus = (mmp.status || '').toLowerCase();
      if (normStatus === 'approved') status = 'approved';
      else if (normStatus === 'archived' || normStatus === 'deleted') status = 'archived';
      if (status !== selectedCategory) return;

      const mmpName = (mmp as any).projectName || mmp.name || 'Unnamed MMP';
      const mmpId = mmp.mmpId || 'N/A';

      const sites: any[] =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites
          : Array.isArray((mmp as any).siteEntries)
            ? (mmp as any).siteEntries
            : [];

      let covered = 0;
      let notCovered = 0;
      sites.forEach(site => {
        const isCovered =
          (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') ||
          site.covered === true;
        if (isCovered) covered += 1;
        else notCovered += 1;
      });
      summaries.push({
        mmpName,
        mmpId,
        covered,
        notCovered,
        total: sites.length,
      });
    });
    return summaries;
  }, [mmpFiles, selectedCategory]);

  // Compute per-MMP summaries for all categories (for "All" tab)
  const allMmpSummaries = useMemo(() => {
    const summaries: Array<{
      mmpName: string;
      mmpId: string;
      status: string;
      covered: number;
      notCovered: number;
      total: number;
    }> = [];
    (mmpFiles || []).forEach(mmp => {
      let status: 'approved' | 'pending' | 'archived' = 'pending';
      const normStatus = (mmp.status || '').toLowerCase();
      if (normStatus === 'approved') status = 'approved';
      else if (normStatus === 'archived' || normStatus === 'deleted') status = 'archived';

      const mmpName = (mmp as any).projectName || mmp.name || 'Unnamed MMP';
      const mmpId = mmp.mmpId || 'N/A';

      const sites: any[] =
        Array.isArray((mmp as any).sites)
          ? (mmp as any).sites
          : Array.isArray((mmp as any).siteEntries)
            ? (mmp as any).siteEntries
            : [];

      let covered = 0;
      let notCovered = 0;
      sites.forEach(site => {
        const isCovered =
          (typeof site.status === 'string' && site.status.toLowerCase() === 'covered') ||
          site.covered === true;
        if (isCovered) covered += 1;
        else notCovered += 1;
      });
      summaries.push({
        mmpName,
        mmpId,
        status,
        covered,
        notCovered,
        total: sites.length,
      });
    });
    return summaries;
  }, [mmpFiles]);

  // Helper to normalize status for comparison
  const normalizeStatus = (status: MMPStatus) =>
    status?.replace(/_/g, '').toLowerCase();

  // Filtered per-MMP summaries for selected category and search
  const filteredMmpSummaries = useMemo(() => {
    if (selectedCategory === 'all') return [];
    return mmpSummaries.filter(summary => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (summary.mmpName && summary.mmpName.toLowerCase().includes(q)) ||
        (summary.mmpId && summary.mmpId.toLowerCase().includes(q)) ||
        (summary.covered?.toString().includes(q)) ||
        (summary.notCovered?.toString().includes(q)) ||
        (summary.total?.toString().includes(q))
      );
    });
  }, [mmpSummaries, search, selectedCategory]);

  // Filtered allMmpSummaries for "All" tab and search
  const filteredAllMmpSummaries = useMemo(() => {
    if (selectedCategory !== 'all') return [];
    return allMmpSummaries.filter(summary => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        (summary.mmpName && summary.mmpName.toLowerCase().includes(q)) ||
        (summary.mmpId && summary.mmpId.toLowerCase().includes(q)) ||
        (summary.status && summary.status.toLowerCase().includes(q)) ||
        (summary.covered?.toString().includes(q)) ||
        (summary.notCovered?.toString().includes(q)) ||
        (summary.total?.toString().includes(q))
      );
    });
  }, [allMmpSummaries, search, selectedCategory]);

  return (
    <div className="min-h-screen py-10 px-2 md:px-8 bg-gradient-to-br from-slate-50 via-blue-50 to-blue-100 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900 space-y-10">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-blue-700/90 to-blue-500/80 dark:from-blue-900 dark:to-blue-700 p-8 rounded-2xl shadow-xl border border-blue-100 dark:border-blue-900 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-white to-blue-200 dark:from-blue-200 dark:to-blue-400 bg-clip-text text-transparent tracking-tight mb-2">
              Field Operation Manager
            </h1>
            <p className="text-blue-100 dark:text-blue-200/80 font-medium">
              Review and forward MMPs to related hubs before site-level execution.
            </p>
          </div>
        </div>
      </div>
      <div className="max-w-5xl mx-auto">
        <Card className="mb-10 p-8 bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-lg border border-blue-100 dark:border-blue-900">
          <h2 className="text-2xl font-semibold mb-6 text-blue-800 dark:text-blue-200">Uploaded MMPs</h2>
          <div className="overflow-x-auto rounded-lg">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-blue-50 dark:bg-blue-950 text-blue-900 dark:text-blue-100">
                  <th className="px-4 py-3 text-left font-semibold">MMP Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Upload Date</th>
                  <th className="px-4 py-3 text-left font-semibold">Uploaded By</th>
                  <th className="px-4 py-3 text-left font-semibold">Role</th>
                  <th className="px-4 py-3 text-left font-semibold">Hub</th>
                  <th className="px-4 py-3 text-left font-semibold">Total Sites</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                  <th className="px-4 py-3 text-left font-semibold">Logs</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {(mmpFiles || []).map(mmp => {
                  const uploadedBy = (mmp as any).uploadedBy;
                  const uploadedByName = typeof uploadedBy === 'object' && uploadedBy !== null
                    ? uploadedBy.name || '-'
                    : typeof uploadedBy === 'string'
                      ? uploadedBy
                      : '-';
                  const uploadedByRole = typeof uploadedBy === 'object' && uploadedBy !== null
                    ? uploadedBy.role || '-'
                    : '-';
                  const hub = (mmp as any).hub || (mmp as any).projectHub || '-';
                  const siteCount =
                    Array.isArray((mmp as any).sites)
                      ? (mmp as any).sites.length
                      : typeof (mmp as any).siteCount === 'number'
                        ? (mmp as any).siteCount
                        : 0;
                  return (
                    <tr key={mmp.id} className="border-b last:border-0 hover:bg-blue-50/40 dark:hover:bg-blue-900/40 transition">
                      <td className="px-4 py-3 font-medium">{(mmp as any).projectName || mmp.mmpId}</td>
                      <td className="px-4 py-3">{mmp.uploadedAt ? new Date(mmp.uploadedAt).toLocaleDateString() : '-'}</td>
                      <td className="px-4 py-3">{uploadedByName}</td>
                      <td className="px-4 py-3">
                        <Badge variant={uploadedByRole === 'admin' ? 'default' : 'outline'}>
                          {uploadedByRole}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{hub}</td>
                      <td className="px-4 py-3">{siteCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant={
                          normalizeStatus(mmp.status) === 'pendingreview' ? 'outline' :
                          normalizeStatus(mmp.status) === 'reviewed' ? 'default' :
                          normalizeStatus(mmp.status) === 'approved' ? 'success' : 'secondary'
                        }>
                          {mmp.status?.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <ul className="text-xs space-y-1">
                          {(mmp.logs?.slice(-2) || []).map((log, idx) => (
                            <li key={idx}>{log.action} by {log.by} on {new Date(log.date).toLocaleDateString()}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          className="text-blue-700 dark:text-blue-300 hover:underline text-xs font-semibold"
                          onClick={() => navigate(`/mmp/${mmp.id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {(!mmpFiles || mmpFiles.length === 0) && (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-muted-foreground">
                      No MMPs uploaded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-8 bg-white/90 dark:bg-gray-900/90 rounded-2xl shadow-lg border border-blue-100 dark:border-blue-900">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
            <h2 className="text-2xl font-semibold text-blue-800 dark:text-blue-200">
              Total Sites Per Hub
            </h2>
            {/* Search Box beside the title */}
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by MMP name, ID, or status..."
              className="w-full md:w-80 px-4 py-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-blue-950 text-blue-900 dark:text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {/* Category Tabs */}
          <div className="flex gap-2 mb-6">
            {CATEGORY_LABELS.map(cat => (
              <button
                key={cat.key}
                className={`px-4 py-2 rounded-full font-semibold transition-all duration-150
                  ${selectedCategory === cat.key
                    ? 'bg-blue-700 text-white shadow'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:hover:bg-blue-900'}
                `}
                onClick={() => setSelectedCategory(cat.key as any)}
              >
                {cat.label}
              </button>
            ))}
          </div>
          {/* Show per-MMP summary for selected category */}
          {selectedCategory !== 'all' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredMmpSummaries.length > 0 ? (
                filteredMmpSummaries.map((summary, idx) => (
                  <div key={summary.mmpId + idx} className="bg-blue-100 dark:bg-blue-950 rounded-xl p-6 flex flex-col items-center shadow border border-blue-200 dark:border-blue-800">
                    <div className="text-base font-semibold text-blue-900 dark:text-blue-200 mb-1">{summary.mmpName}</div>
                    <div className="text-xs text-muted-foreground mb-2">{summary.mmpId}</div>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Covered</span>
                        <span className="text-xl font-bold text-green-700">{summary.covered}</span>
                      </div>
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Not Covered</span>
                        <span className="text-xl font-bold text-amber-700">{summary.notCovered}</span>
                      </div>
                      <div className="flex justify-between w-full mt-2 border-t pt-2 border-blue-200 dark:border-blue-800">
                        <span className="text-xs font-semibold">Total</span>
                        <span className="text-lg font-extrabold text-blue-700 dark:text-blue-400">
                          {summary.total}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground col-span-full">No data available.</div>
              )}
            </div>
          ) : (
            // ALL: show all MMPs with their status, MMP name, and MMP ID
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {filteredAllMmpSummaries.length > 0 ? (
                filteredAllMmpSummaries.map((summary, idx) => (
                  <div key={summary.mmpId + summary.status + idx} className="bg-blue-100 dark:bg-blue-950 rounded-xl p-6 flex flex-col items-center shadow border border-blue-200 dark:border-blue-800">
                    <div className="text-base font-semibold text-blue-900 dark:text-blue-200 mb-1">{summary.mmpName}</div>
                    <div className="text-xs text-muted-foreground mb-1">{summary.mmpId}</div>
                    <div className="text-xs mb-1">
                      <span className={`px-2 py-0.5 rounded-full font-semibold
                        ${summary.status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : summary.status === 'pending'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-200 text-gray-700'}
                      `}>
                        {summary.status.charAt(0).toUpperCase() + summary.status.slice(1)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1 w-full">
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Covered</span>
                        <span className="text-xl font-bold text-green-700">{summary.covered}</span>
                      </div>
                      <div className="flex justify-between w-full">
                        <span className="text-xs text-muted-foreground">Not Covered</span>
                        <span className="text-xl font-bold text-amber-700">{summary.notCovered}</span>
                      </div>
                      <div className="flex justify-between w-full mt-2 border-t pt-2 border-blue-200 dark:border-blue-800">
                        <span className="text-xs font-semibold">Total</span>
                        <span className="text-lg font-extrabold text-blue-700 dark:text-blue-400">
                          {summary.total}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground col-span-full">No data available.</div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default FieldOperationManagerPage;
