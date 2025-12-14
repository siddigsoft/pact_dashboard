import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';

interface ForwardedItem {
  id: string;
  name?: string | null;
  mmp_id?: string | null;
  status?: string | null;
  workflow?: any;
  uploaded_at?: string | null;
  project?: { name?: string | null } | null;
}

const ForwardedMMPsCard: React.FC = () => {
  const { currentUser } = useAppContext();
  const { mmpFiles, loading } = useMMP();

  // Filter forwarded MMPs from context data
  const items = useMemo(() => {
    if (!currentUser?.id || !mmpFiles) return [];
    
    return mmpFiles
      .filter((mmp: any) => {
        const workflow = mmp.workflow || {};
        const forwardedIds = workflow.forwardedToFomIds || [];
        return Array.isArray(forwardedIds) && forwardedIds.includes(currentUser.id);
      })
      .map((mmp: any) => ({
        id: mmp.id,
        name: mmp.name,
        mmp_id: mmp.mmpId || mmp.mmp_id,
        status: mmp.status,
        workflow: mmp.workflow,
        uploaded_at: mmp.uploadedAt || mmp.uploaded_at,
        project: mmp.projectName ? { name: mmp.projectName } : (mmp.project || null),
      }))
      .sort((a: any, b: any) => {
        const aDate = a.uploaded_at || a.workflow?.forwardedAt || '';
        const bDate = b.uploaded_at || b.workflow?.forwardedAt || '';
        return bDate.localeCompare(aDate);
      })
      .slice(0, 10);
  }, [mmpFiles, currentUser?.id]);

  return (
    <Card className="p-0 overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Forwarded to You</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading && (
          <div className="text-sm text-muted-foreground py-4">Loading forwarded MMPs…</div>
        )}
        {!loading && items.length === 0 && (
          <div className="text-sm text-muted-foreground py-4">No MMPs forwarded to you yet.</div>
        )}
        {!loading && items.length > 0 && (
          <div className="-mx-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">MMP</th>
                  <th className="px-2 py-2 text-left font-medium">Project</th>
                  <th className="px-2 py-2 text-left font-medium">Forwarded</th>
                  <th className="px-2 py-2 text-left font-medium">Status</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((m: any) => {
                  const status: string = m.status || '';
                  const forwardedAt = m.workflow?.forwardedAt
                    ? new Date(m.workflow.forwardedAt).toLocaleString()
                    : '-';
                  const projectName = m.project?.name || m.project_name || '';
                  return (
                    <tr key={m.id} className="border-t">
                      <td className="px-2 py-2 font-medium">{m.name || m.mmp_id || m.id}</td>
                      <td className="px-2 py-2">{projectName || '-'}</td>
                      <td className="px-2 py-2">{forwardedAt}</td>
                      <td className="px-2 py-2">
                        <Badge variant={status.toLowerCase() === 'approved' ? 'success' : 'outline'}>
                          {status || 'pending'}
                        </Badge>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => window.location.assign(`/mmp/${m.id}/verification`)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ForwardedMMPsCard;
