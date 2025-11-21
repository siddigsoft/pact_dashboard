import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface SiteVisitRow {
  id: string;
  mmpId: string;
  siteName: string;
  siteCode?: string;
  state?: string;
  locality?: string;
  status: string;
  feesTotal?: number;
  enumeratorId?: string;
  assignedTo?: string;
  assignedAt?: string;
  completedAt?: string;
  rejectionReason?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

interface MMPCategorySitesTableProps {
  title: string;
  description?: string;
  rows: SiteVisitRow[];
  emptyMessage?: string;
  maxHeightPx?: number; // limit visible rows area height; rest scrolls
}

const statusBadge = (status: string) => {
  const base = status.toLowerCase();
  let cls = 'bg-gray-100 text-gray-700';
  if (base === 'assigned') cls = 'bg-blue-100 text-blue-700';
  else if (base === 'inprogress' || base === 'accepted') cls = 'bg-indigo-100 text-indigo-700';
  else if (base === 'completed' || base === 'verified') cls = 'bg-green-100 text-green-700';
  else if (base === 'rejected' || base === 'declined') cls = 'bg-red-100 text-red-700';
  else if (base === 'pending') cls = 'bg-yellow-100 text-yellow-700';
  return <Badge className={cls}>{status}</Badge>;
};

export const MMPCategorySitesTable: React.FC<MMPCategorySitesTableProps> = ({ title, description, rows, emptyMessage, maxHeightPx = 520 }) => {
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">{emptyMessage || 'No sites in this category yet.'}</div>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ maxHeight: maxHeightPx, overflowY: 'auto' }} className="relative">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-white dark:bg-gray-900">
                <tr className="text-left border-b">
                  <th className="py-2 pr-4 font-medium">Site</th>
                  <th className="py-2 pr-4 font-medium">State / Locality</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 pr-4 font-medium">Verified By</th>
                  <th className="py-2 pr-4 font-medium">Cost</th>
                  <th className="py-2 pr-4 font-medium">Assigned</th>
                  <th className="py-2 pr-4 font-medium">Completed</th>
                  <th className="py-2 pr-4 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-none hover:bg-muted/40">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{r.siteName || r.siteCode || r.id}</div>
                      {r.siteCode && <div className="text-xs text-muted-foreground">{r.siteCode}</div>}
                    </td>
                    <td className="py-2 pr-4">
                      <div>{r.state || '-'}</div>
                      {r.locality && <div className="text-xs text-muted-foreground">{r.locality}</div>}
                    </td>
                    <td className="py-2 pr-4">{statusBadge(r.status)}</td>
                    <td className="py-2 pr-4">
                      {r.verifiedBy ? (
                        <div>
                          <div className="font-medium">{r.verifiedBy}</div>
                          {r.verifiedAt && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(r.verifiedAt).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{r.feesTotal ? `${r.feesTotal}` : <span className="text-muted-foreground">0</span>}</td>
                    <td className="py-2 pr-4">
                      {r.assignedAt ? new Date(r.assignedAt).toLocaleDateString() : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 pr-4">
                      {r.completedAt ? new Date(r.completedAt).toLocaleDateString() : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="py-2 pr-4 max-w-xs truncate">
                      {r.rejectionReason ? (
                        <span className="text-red-600" title={r.rejectionReason}>{r.rejectionReason}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MMPCategorySitesTable;