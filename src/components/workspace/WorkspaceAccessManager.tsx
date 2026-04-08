import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield, UserPlus, UserX, CheckCircle2, XCircle, Clock, Loader2,
  Users, Key, RotateCcw,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

interface Grant {
  id: string;
  user_id: string;
  access_level: string;
  is_active: boolean;
  granted_at: string;
  revoked_at: string | null;
  notes: string | null;
  _userName?: string;
  _userRole?: string;
}

interface AccessRequest {
  id: string;
  user_id: string;
  user_name: string | null;
  user_role: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  reviewer_notes: string | null;
}

interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
}

const ACCESS_LEVELS = [
  { value: 'viewer', label: 'Viewer',  desc: 'Read-only access to files and folders' },
  { value: 'editor', label: 'Editor',  desc: 'Upload, edit, and organise files'       },
  { value: 'admin',  label: 'Admin',   desc: 'Full control including sharing & settings' },
];

const statusBadge = (status: string) => {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30';
  if (status === 'rejected') return 'bg-red-100 text-red-700 dark:bg-red-900/30';
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30';
};

const levelBadge = (level: string) => {
  if (level === 'admin')  return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30';
  if (level === 'editor') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800';
};

interface WorkspaceAccessManagerProps {
  open: boolean;
  onClose: () => void;
}

export function WorkspaceAccessManager({ open, onClose }: WorkspaceAccessManagerProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedUser, setSelectedUser] = useState('');
  const [accessLevel, setAccessLevel] = useState('viewer');
  const [notes, setNotes] = useState('');
  const [granting, setGranting] = useState(false);
  const [actioningId, setActioningId] = useState<string | null>(null);

  // All profiles for grant form
  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['profiles-for-workspace-grant'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as Profile[];
    },
    staleTime: 60_000,
    enabled: open,
  });

  // All grants (active + inactive)
  const { data: grants = [], refetch: refetchGrants } = useQuery<Grant[]>({
    queryKey: ['workspace-access-grants-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_access_grants')
        .select('*')
        .order('granted_at', { ascending: false });
      if (!data?.length) return [];

      const userIds = [...new Set(data.map((g: any) => g.user_id))];
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role').in('id', userIds);
      const pm: Record<string, { name: string; role: string }> = {};
      (profs ?? []).forEach((p: any) => { pm[p.id] = { name: p.full_name ?? 'Unknown', role: p.role ?? '' }; });

      return data.map((g: any) => ({
        ...g,
        _userName: pm[g.user_id]?.name ?? g.user_id.slice(0, 8),
        _userRole: pm[g.user_id]?.role ?? '',
      })) as Grant[];
    },
    staleTime: 30_000,
    enabled: open,
  });

  // Pending access requests
  const { data: requests = [], refetch: refetchRequests } = useQuery<AccessRequest[]>({
    queryKey: ['workspace-access-requests-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_access_requests')
        .select('*')
        .order('created_at', { ascending: false });
      return (data ?? []) as AccessRequest[];
    },
    staleTime: 30_000,
    enabled: open,
  });

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const activeGrants = grants.filter(g => g.is_active);
  const revokedGrants = grants.filter(g => !g.is_active);

  async function handleGrant() {
    if (!selectedUser || !currentUser?.id) return;
    setGranting(true);
    try {
      const { error } = await supabase.from('workspace_access_grants').upsert({
        user_id: selectedUser,
        granted_by: currentUser.id,
        granted_at: new Date().toISOString(),
        access_level: accessLevel,
        notes: notes.trim() || null,
        is_active: true,
        revoked_at: null,
        revoked_by: null,
      }, { onConflict: 'user_id' });

      if (error) throw error;

      // Notify the granted user
      const userName = profiles.find(p => p.id === selectedUser)?.full_name ?? 'User';
      await supabase.from('notifications').insert({
        recipient_id: selectedUser,
        event_type: 'workspace_access_granted',
        entity_type: 'workspace',
        title_en: 'Workspace Hub Access Granted',
        message_en: `You have been granted ${accessLevel} access to the Workspace Hub by ${currentUser.name ?? 'Admin'}.${notes.trim() ? ' Note: ' + notes.trim() : ''}`,
        priority: 'high',
        status: 'pending',
        triggered_by: currentUser.id,
        triggered_by_name: currentUser.name ?? 'Admin',
        action_url: '/workspace',
        email_sent: false,
      });

      toast({ title: `Access granted`, description: `${userName} now has ${accessLevel} access to the Workspace Hub` });
      setSelectedUser(''); setNotes(''); setAccessLevel('viewer');
      refetchGrants();
      qc.invalidateQueries({ queryKey: ['workspace_access_grant'] });
    } catch (e: any) {
      toast({ title: 'Error granting access', description: e.message, variant: 'destructive' });
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(grant: Grant) {
    if (!currentUser?.id) return;
    setActioningId(grant.id);
    try {
      const { error } = await supabase.from('workspace_access_grants').update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: currentUser.id,
      }).eq('id', grant.id);

      if (error) throw error;

      // Notify the user
      await supabase.from('notifications').insert({
        recipient_id: grant.user_id,
        event_type: 'workspace_access_revoked',
        entity_type: 'workspace',
        title_en: 'Workspace Hub Access Revoked',
        message_en: `Your access to the Workspace Hub has been revoked by ${currentUser.name ?? 'Admin'}.`,
        priority: 'medium',
        status: 'pending',
        triggered_by: currentUser.id,
        triggered_by_name: currentUser.name ?? 'Admin',
        action_url: '/workspace',
        email_sent: false,
      });

      toast({ title: 'Access revoked', description: `${grant._userName}'s access has been removed` });
      refetchGrants();
      qc.invalidateQueries({ queryKey: ['workspace_access_grant'] });
    } catch (e: any) {
      toast({ title: 'Error revoking', description: e.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  async function handleRestoreGrant(grant: Grant) {
    if (!currentUser?.id) return;
    setActioningId(grant.id);
    try {
      await supabase.from('workspace_access_grants').update({
        is_active: true,
        revoked_at: null,
        revoked_by: null,
        granted_at: new Date().toISOString(),
        granted_by: currentUser.id,
      }).eq('id', grant.id);
      toast({ title: 'Access restored' });
      refetchGrants();
      qc.invalidateQueries({ queryKey: ['workspace_access_grant'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  async function handleApproveRequest(req: AccessRequest) {
    if (!currentUser?.id) return;
    setActioningId(req.id);
    try {
      // Update request status
      await supabase.from('workspace_access_requests').update({
        status: 'approved',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id);

      // Create grant
      const { error } = await supabase.from('workspace_access_grants').upsert({
        user_id: req.user_id,
        granted_by: currentUser.id,
        granted_at: new Date().toISOString(),
        access_level: 'viewer',
        notes: 'Approved from access request',
        is_active: true,
        revoked_at: null,
        revoked_by: null,
      }, { onConflict: 'user_id' });

      if (error) throw error;

      // Notify the user
      await supabase.from('notifications').insert({
        recipient_id: req.user_id,
        event_type: 'workspace_access_granted',
        entity_type: 'workspace',
        title_en: 'Workspace Hub Access Granted',
        message_en: `Your request for Workspace Hub access has been approved. You now have viewer access.`,
        priority: 'high',
        status: 'pending',
        triggered_by: currentUser.id,
        triggered_by_name: currentUser.name ?? 'Admin',
        action_url: '/workspace',
        email_sent: false,
      });

      toast({ title: 'Request approved', description: `${req.user_name ?? 'User'} now has viewer access` });
      refetchRequests(); refetchGrants();
      qc.invalidateQueries({ queryKey: ['workspace_access_grant'] });
    } catch (e: any) {
      toast({ title: 'Error approving', description: e.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  async function handleRejectRequest(req: AccessRequest) {
    if (!currentUser?.id) return;
    setActioningId(req.id);
    try {
      await supabase.from('workspace_access_requests').update({
        status: 'rejected',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id);

      await supabase.from('notifications').insert({
        recipient_id: req.user_id,
        event_type: 'workspace_access_rejected',
        entity_type: 'workspace',
        title_en: 'Workspace Access Request Not Approved',
        message_en: `Your request for Workspace Hub access was not approved. Contact your administrator for more information.`,
        priority: 'medium',
        status: 'pending',
        triggered_by: currentUser.id,
        triggered_by_name: currentUser.name ?? 'Admin',
        action_url: '/workspace',
        email_sent: false,
      });

      toast({ title: 'Request rejected' });
      refetchRequests();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  // Users who already have grants
  const grantedUserIds = new Set(activeGrants.map(g => g.user_id));
  const eligibleProfiles = profiles.filter(p => !grantedUserIds.has(p.id) && p.role !== 'super_admin');

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-7 h-7 rounded-lg bg-[#0F2041] flex items-center justify-center shrink-0">
              <Key className="h-3.5 w-3.5 text-white" />
            </div>
            Workspace Access Control
            <Badge variant="outline" className="ml-auto text-[10px] border-[#0F2041]/30 text-[#0F2041]">
              Super Admin Only
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="grants" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="shrink-0 grid grid-cols-3 h-9 text-xs">
            <TabsTrigger value="grants" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              Active ({activeGrants.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="text-xs relative">
              <Clock className="h-3 w-3 mr-1" />
              Requests
              {pendingRequests.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                  {pendingRequests.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="grant-access" className="text-xs">
              <UserPlus className="h-3 w-3 mr-1" />
              Grant Access
            </TabsTrigger>
          </TabsList>

          {/* Active Grants */}
          <TabsContent value="grants" className="flex-1 overflow-y-auto m-0 mt-3">
            {activeGrants.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Shield className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-sm text-muted-foreground">No active grants yet. Grant access to staff using the "Grant Access" tab.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {activeGrants.map(g => (
                  <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors group">
                    <div className="w-9 h-9 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[11px] font-bold text-[#0F2041] shrink-0">
                      {(g._userName ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{g._userName}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{g._userRole?.replace(/_/g, ' ')}</p>
                    </div>
                    <Badge className={cn('text-[10px] capitalize', levelBadge(g.access_level))}>
                      {g.access_level}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                      {formatDistanceToNow(parseISO(g.granted_at), { addSuffix: true })}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 h-7 px-2 text-xs"
                      onClick={() => handleRevoke(g)}
                      disabled={actioningId === g.id}
                      data-testid={`btn-revoke-${g.id}`}
                    >
                      {actioningId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><UserX className="h-3 w-3 mr-1" />Revoke</>}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {revokedGrants.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">Revoked Access ({revokedGrants.length})</p>
                <div className="space-y-1">
                  {revokedGrants.map(g => (
                    <div key={g.id} className="flex items-center gap-3 p-3 rounded-xl border border-dashed bg-muted/20 opacity-60 group">
                      <div className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-500 shrink-0">
                        {(g._userName ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-muted-foreground">{g._userName}</p>
                        <p className="text-[11px] text-muted-foreground">Access revoked</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 text-xs"
                        onClick={() => handleRestoreGrant(g)}
                        disabled={actioningId === g.id}
                      >
                        {actioningId === g.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" />Restore</>}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Access Requests */}
          <TabsContent value="requests" className="flex-1 overflow-y-auto m-0 mt-3">
            {requests.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <Clock className="h-8 w-8 text-muted-foreground mx-auto opacity-40" />
                <p className="text-sm text-muted-foreground">No access requests yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {requests.map(req => (
                  <div key={req.id} className={cn(
                    'p-4 rounded-xl border bg-card space-y-3 transition-colors',
                    req.status === 'pending' ? 'border-amber-200 dark:border-amber-700/40 bg-amber-50/40 dark:bg-amber-900/10' : ''
                  )}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[10px] font-bold text-[#0F2041] shrink-0">
                          {(req.user_name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{req.user_name ?? 'Unknown user'}</p>
                          <p className="text-[11px] text-muted-foreground capitalize">{(req.user_role ?? '').replace(/_/g, ' ')}</p>
                        </div>
                      </div>
                      <Badge className={cn('text-[10px] capitalize shrink-0', statusBadge(req.status))}>
                        {req.status}
                      </Badge>
                    </div>

                    {req.reason && (
                      <div className="bg-muted/40 rounded-lg px-3 py-2">
                        <p className="text-xs text-muted-foreground font-medium mb-0.5">Reason</p>
                        <p className="text-sm leading-relaxed">{req.reason}</p>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(parseISO(req.created_at), { addSuffix: true })}
                      </span>
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleRejectRequest(req)}
                            disabled={actioningId === req.id}
                            data-testid={`btn-reject-request-${req.id}`}
                          >
                            {actioningId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><XCircle className="h-3 w-3 mr-1" />Reject</>}
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleApproveRequest(req)}
                            disabled={actioningId === req.id}
                            data-testid={`btn-approve-request-${req.id}`}
                          >
                            {actioningId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><CheckCircle2 className="h-3 w-3 mr-1" />Approve</>}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Grant Access */}
          <TabsContent value="grant-access" className="flex-1 overflow-y-auto m-0 mt-3">
            <div className="space-y-5 max-w-sm mx-auto">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Staff Member</p>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="h-10 text-sm" data-testid="select-grant-user">
                    <SelectValue placeholder="Choose a staff member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleProfiles.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">All eligible staff already have access</div>
                    ) : eligibleProfiles.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-sm">
                        <span className="font-medium">{p.full_name ?? 'Unknown'}</span>
                        <span className="text-muted-foreground ml-2 capitalize text-xs">({(p.role ?? '').replace(/_/g, ' ')})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Access Level</p>
                <div className="space-y-2">
                  {ACCESS_LEVELS.map(level => (
                    <button
                      key={level.value}
                      onClick={() => setAccessLevel(level.value)}
                      className={cn(
                        'w-full text-left px-4 py-3 rounded-xl border transition-all',
                        accessLevel === level.value
                          ? 'border-[#0F2041] bg-[#0F2041]/5 dark:bg-[#1D3461]/10'
                          : 'border-border hover:border-slate-300'
                      )}
                      data-testid={`radio-access-level-${level.value}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          'w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                          accessLevel === level.value ? 'border-[#0F2041]' : 'border-slate-300'
                        )}>
                          {accessLevel === level.value && (
                            <div className="w-2 h-2 rounded-full bg-[#0F2041]" />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{level.label}</p>
                          <p className="text-xs text-muted-foreground">{level.desc}</p>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes <span className="font-normal">(optional)</span></p>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Reason for granting access…"
                  rows={2}
                  className="resize-none text-sm"
                />
              </div>

              <Button
                className="w-full bg-[#0F2041] hover:bg-[#1D3461] h-11"
                onClick={handleGrant}
                disabled={!selectedUser || granting}
                data-testid="btn-confirm-grant"
              >
                {granting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Granting…</>
                ) : (
                  <><Shield className="h-4 w-4 mr-2" />Grant Access</>
                )}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
