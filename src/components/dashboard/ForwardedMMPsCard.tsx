import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';

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
  const [items, setItems] = React.useState<ForwardedItem[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!currentUser?.id) return;
      setLoading(true);
      try {
        // Try with join first
        const { data, error } = await supabase
          .from('mmp_files')
          .select(`
            id, name, mmp_id, status, workflow, uploaded_at,
            project:projects(name)
          `)
          .contains('workflow', { forwardedToFomIds: [currentUser.id] })
          .order('created_at', { ascending: false })
          .limit(10);
        if (!cancelled) {
          if (error) {
            // Fallback query without join - don't log RLS errors
            const { data: fbData, error: fbError } = await supabase
              .from('mmp_files')
              .select('*')
              .contains('workflow', { forwardedToFomIds: [currentUser.id] })
              .order('created_at', { ascending: false })
              .limit(10);
            if (fbError) {
              // Silently fail - user may not have access to this data
              setItems([]);
            } else {
              setItems((fbData || []) as any);
            }
          } else {
            setItems((data || []) as any);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const refetch = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(refetch); };
  }, [currentUser?.id]);

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
