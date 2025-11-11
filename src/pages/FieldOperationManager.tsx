import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { MMPStatus } from '@/types';

const FIELD_OP_ROLE = 'fieldOpManager'; // Adjust if your AppRole uses a different value

const FieldOperationManagerPage = () => {
  const { roles } = useAppContext();
  const { mmpFiles } = useMMP();
  const navigate = useNavigate();

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

  // Helper to normalize status for comparison
  const normalizeStatus = (status: MMPStatus) =>
    status?.replace(/_/g, '').toLowerCase();

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
          <h2 className="text-2xl font-semibold mb-6 text-blue-800 dark:text-blue-200">Total Sites Per Hub</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {Object.entries(sitesPerHub).map(([hub, count]) => (
              <div key={hub} className="bg-blue-100 dark:bg-blue-950 rounded-xl p-6 flex flex-col items-center shadow border border-blue-200 dark:border-blue-800">
                <div className="text-lg font-bold text-blue-900 dark:text-blue-200">{hub}</div>
                <div className="text-3xl font-extrabold text-blue-700 dark:text-blue-400">{count}</div>
                <div className="text-xs text-muted-foreground mt-1">Total Sites</div>
              </div>
            ))}
            {Object.keys(sitesPerHub).length === 0 && (
              <div className="text-center text-muted-foreground col-span-full">No data available.</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default FieldOperationManagerPage;
