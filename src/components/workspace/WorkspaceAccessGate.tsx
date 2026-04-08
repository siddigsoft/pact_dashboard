import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Lock, ShieldAlert, Send, CheckCircle2, Clock } from 'lucide-react';

interface AccessGrant {
  id: string;
  user_id: string;
  access_level: string;
  is_active: boolean;
}

interface AccessRequest {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
}

export function WorkspaceAccessGate({ children }: { children: ReactNode }) {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [requesting, setRequesting] = useState(false);

  const isSuperAdmin = hasAnyRole(['super_admin']);

  // Fetch grant status for this user
  const { data: grant, isLoading: loadingGrant } = useQuery<AccessGrant | null>({
    queryKey: ['workspace_access_grant', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const { data } = await supabase
        .from('workspace_access_grants')
        .select('id, user_id, access_level, is_active')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
        .maybeSingle();
      return data as AccessGrant | null;
    },
    enabled: !!currentUser?.id && !isSuperAdmin,
    staleTime: 60_000,
  });

  // Fetch existing request by user
  const { data: existingRequest, isLoading: loadingReq } = useQuery<AccessRequest | null>({
    queryKey: ['workspace_access_request_mine', currentUser?.id],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const { data } = await supabase
        .from('workspace_access_requests')
        .select('id, user_id, status, created_at')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .maybeSingle();
      return data as AccessRequest | null;
    },
    enabled: !!currentUser?.id && !isSuperAdmin,
    staleTime: 30_000,
  });

  // Super admins always have full access
  if (isSuperAdmin) return <>{children}</>;

  if (loadingGrant || loadingReq) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // User has an active grant — let them in
  if (grant?.is_active) return <>{children}</>;

  // User has a pending request
  const pendingRequest = existingRequest?.status === 'pending';
  const rejectedRequest = existingRequest?.status === 'rejected';

  async function submitRequest() {
    if (!currentUser?.id) return;
    setRequesting(true);
    try {
      // Check if they already have a pending/approved request
      if (existingRequest?.status === 'pending') return;

      const { error } = await supabase.from('workspace_access_requests').upsert({
        user_id: currentUser.id,
        user_name: currentUser.name ?? '',
        user_role: currentUser.role ?? '',
        reason: reason.trim() || null,
        status: 'pending',
        created_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        reviewer_notes: null,
      }, { onConflict: 'user_id' });

      if (error) throw error;

      // Notify super admins
      const { data: superAdmins } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'super_admin');
      if (superAdmins?.length) {
        await supabase.from('notifications').insert(superAdmins.map((a: any) => ({
          recipient_id: a.id,
          event_type: 'workspace_access_request',
          entity_type: 'workspace',
          title_en: 'Workspace Access Request',
          message_en: `${currentUser.name ?? 'A user'} (${currentUser.role ?? ''}) has requested access to the Workspace Hub.${reason.trim() ? ` Reason: ${reason.trim()}` : ''}`,
          priority: 'medium',
          status: 'pending',
          triggered_by: currentUser.id,
          triggered_by_name: currentUser.name ?? '',
          action_url: '/workspace',
          email_sent: false,
        })));
      }

      toast({ title: 'Access request sent', description: 'A super admin will review your request.' });
      qc.invalidateQueries({ queryKey: ['workspace_access_request_mine', currentUser.id] });
      setReason('');
    } catch (e: any) {
      toast({ title: 'Error sending request', description: e.message, variant: 'destructive' });
    } finally {
      setRequesting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-[#0F2041] to-[#1D3461] flex items-center justify-center shadow-lg">
          {pendingRequest ? (
            <Clock className="h-10 w-10 text-white" />
          ) : (
            <Lock className="h-10 w-10 text-white" />
          )}
        </div>

        {pendingRequest ? (
          <>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Access Pending</h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                Your access request has been sent and is awaiting approval from a super admin.
                You will receive a notification once your request has been reviewed.
              </p>
            </div>
            <div className="flex items-center gap-2 justify-center text-amber-600 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/30 rounded-xl px-4 py-3 text-sm">
              <Clock className="h-4 w-4 shrink-0" />
              <span>Request submitted · Awaiting review</span>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {rejectedRequest ? 'Access Not Granted' : 'Workspace Access Required'}
              </h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                {rejectedRequest
                  ? 'Your previous access request was not approved. You can submit a new request with additional context.'
                  : 'The Workspace Hub is a controlled environment. Access must be granted by a super administrator.'}
              </p>
            </div>

            {rejectedRequest && existingRequest && (
              <div className="flex items-center gap-2 justify-center text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/30 rounded-xl px-4 py-3 text-sm">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>Previous request was rejected</span>
              </div>
            )}

            <div className="bg-card border rounded-2xl p-5 text-left space-y-4 shadow-sm">
              <div>
                <p className="text-sm font-semibold mb-1">Reason for access <span className="text-muted-foreground font-normal">(optional)</span></p>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Describe why you need access to the Workspace Hub…"
                  rows={3}
                  className="resize-none text-sm"
                  data-testid="input-access-reason"
                />
              </div>
              <Button
                className="w-full bg-[#0F2041] hover:bg-[#1D3461] h-11"
                onClick={submitRequest}
                disabled={requesting}
                data-testid="btn-request-access"
              >
                {requesting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Sending Request…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Request Access</>
                )}
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Contact your system administrator if you need immediate access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
