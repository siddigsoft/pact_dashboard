import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Shield, UserPlus, UserX, CheckCircle2, XCircle, Clock, Loader2,
  Users, Key, RotateCcw, Search, ChevronDown, Globe, ShieldCheck,
  Lock, AlertTriangle, ChevronRight, X, Plus,
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

type ClearanceLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret';

interface SecurityClearance {
  id: string;
  user_id: string;
  clearance_level: ClearanceLevel;
  granted_by: string | null;
  granted_at: string;
  notes: string | null;
  _userName?: string;
  _userRole?: string;
}

const SEC_CLEARANCES: Record<ClearanceLevel, { label: string; icon: any; bg: string; text: string; border: string; desc: string; order: number }> = {
  public:       { label: 'Public',       icon: Globe,        bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200', desc: 'Can view public files only',            order: 0 },
  internal:     { label: 'Internal',     icon: Users,        bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200',    desc: 'Can view public + internal files',       order: 1 },
  confidential: { label: 'Confidential', icon: ShieldCheck,  bg: 'bg-amber-50',    text: 'text-amber-700',   border: 'border-amber-200',   desc: 'Can view up to confidential files',      order: 2 },
  restricted:   { label: 'Restricted',   icon: Lock,         bg: 'bg-orange-50',   text: 'text-orange-700',  border: 'border-orange-200',  desc: 'Can view up to restricted files',        order: 3 },
  top_secret:   { label: 'Top Secret',   icon: AlertTriangle,bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200',     desc: 'Full clearance — all files visible',     order: 4 },
};

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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'none' | 'revoked' | 'pending'>('all');
  const [clearSearch, setClearSearch] = useState('');
  const [savingClearance, setSavingClearance] = useState<string | null>(null);
  const [addingToLevel, setAddingToLevel] = useState<ClearanceLevel | null>(null);
  const [addLevelSearch, setAddLevelSearch] = useState('');
  const [expandedLevels, setExpandedLevels] = useState<Set<ClearanceLevel>>(new Set(['public', 'internal', 'confidential', 'restricted', 'top_secret']));

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

  // Security clearances for all users
  const { data: clearances = [], refetch: refetchClearances } = useQuery<SecurityClearance[]>({
    queryKey: ['workspace-security-clearances'],
    queryFn: async () => {
      const { data } = await supabase
        .from('workspace_security_clearances')
        .select('*')
        .order('granted_at', { ascending: false });
      if (!data?.length) return [];
      const userIds = [...new Set(data.map((c: any) => c.user_id))];
      const { data: profs } = await supabase.from('profiles').select('id, full_name, role').in('id', userIds);
      const pm: Record<string, { name: string; role: string }> = {};
      (profs ?? []).forEach((p: any) => { pm[p.id] = { name: p.full_name ?? 'Unknown', role: p.role ?? '' }; });
      return data.map((c: any) => ({ ...c, _userName: pm[c.user_id]?.name ?? c.user_id.slice(0, 8), _userRole: pm[c.user_id]?.role ?? '' })) as SecurityClearance[];
    },
    staleTime: 30_000,
    enabled: open,
  });

  const clearanceMap: Record<string, SecurityClearance> = {};
  clearances.forEach(c => { clearanceMap[c.user_id] = c; });

  // Grant users with workspace access but no explicit clearance default to 'internal'
  const clearanceUsers = profiles
    .filter(p => p.role !== 'super_admin')
    .map(p => ({
      ...p,
      clearance: clearanceMap[p.id]?.clearance_level ?? 'internal' as ClearanceLevel,
      hasExplicit: !!clearanceMap[p.id],
    }))
    .filter(u => clearSearch.trim() === '' ||
      (u.full_name ?? '').toLowerCase().includes(clearSearch.toLowerCase()) ||
      (u.role ?? '').toLowerCase().includes(clearSearch.toLowerCase()));

  const clearanceCountByLevel = (Object.keys(SEC_CLEARANCES) as ClearanceLevel[]).reduce((acc, level) => {
    acc[level] = clearanceUsers.filter(u => u.clearance === level).length;
    return acc;
  }, {} as Record<ClearanceLevel, number>);

  async function handleSetClearance(userId: string, level: ClearanceLevel) {
    if (!currentUser?.id) return;
    setSavingClearance(userId);
    try {
      await supabase.from('workspace_security_clearances').upsert({
        user_id: userId,
        clearance_level: level,
        granted_by: currentUser.id,
        granted_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      toast({ title: 'Clearance updated', description: `Security clearance set to ${SEC_CLEARANCES[level].label}` });
      refetchClearances();
      qc.invalidateQueries({ queryKey: ['workspace-security-clearances'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSavingClearance(null);
    }
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const activeGrants = grants.filter(g => g.is_active);

  // Build a unified user list (all non-super-admin profiles)
  const grantMap: Record<string, Grant> = {};
  grants.forEach(g => { grantMap[g.user_id] = g; });

  const pendingRequestMap: Record<string, AccessRequest> = {};
  requests.filter(r => r.status === 'pending').forEach(r => { pendingRequestMap[r.user_id] = r; });

  const allUsers = profiles
    .filter(p => p.role !== 'super_admin')
    .map(p => {
      const grant = grantMap[p.id];
      const pendingReq = pendingRequestMap[p.id];
      let status: 'active' | 'revoked' | 'none' | 'pending' = 'none';
      if (grant?.is_active) status = 'active';
      else if (grant && !grant.is_active) status = 'revoked';
      else if (pendingReq) status = 'pending';
      return { ...p, grant, pendingReq, status };
    });

  const filteredUsers = allUsers.filter(u => {
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (u.full_name ?? '').toLowerCase().includes(q) ||
             (u.role ?? '').replace(/_/g, ' ').toLowerCase().includes(q);
    }
    return true;
  });

  const statusCounts = {
    active: allUsers.filter(u => u.status === 'active').length,
    none: allUsers.filter(u => u.status === 'none').length,
    revoked: allUsers.filter(u => u.status === 'revoked').length,
    pending: allUsers.filter(u => u.status === 'pending').length,
  };

  async function handleGrant(userId?: string, level?: string) {
    const uid = userId ?? selectedUser;
    const lvl = level ?? accessLevel;
    if (!uid || !currentUser?.id) return;
    if (!userId) setGranting(true);
    else setActioningId(uid);
    try {
      const { error } = await supabase.from('workspace_access_grants').upsert({
        user_id: uid,
        granted_by: currentUser.id,
        granted_at: new Date().toISOString(),
        access_level: lvl,
        notes: notes.trim() || null,
        is_active: true,
        revoked_at: null,
        revoked_by: null,
      }, { onConflict: 'user_id' });

      if (error) throw error;

      const userName = profiles.find(p => p.id === uid)?.full_name ?? 'User';
      await supabase.from('notifications').insert({
        recipient_id: uid,
        event_type: 'workspace_access_granted',
        entity_type: 'workspace',
        title_en: 'Workspace Hub Access Granted',
        message_en: `You have been granted ${lvl} access to the Workspace Hub by ${currentUser.name ?? 'Admin'}.${notes.trim() ? ' Note: ' + notes.trim() : ''}`,
        priority: 'high',
        status: 'pending',
        triggered_by: currentUser.id,
        triggered_by_name: currentUser.name ?? 'Admin',
        action_url: '/workspace',
        email_sent: false,
      });

      toast({ title: 'Access granted', description: `${userName} now has ${lvl} access` });
      if (!userId) { setSelectedUser(''); setNotes(''); setAccessLevel('viewer'); }
      refetchGrants();
      qc.invalidateQueries({ queryKey: ['workspace_access_grant'] });
    } catch (e: any) {
      toast({ title: 'Error granting access', description: e.message, variant: 'destructive' });
    } finally {
      setGranting(false);
      setActioningId(null);
    }
  }

  async function handleChangeLevel(grant: Grant, newLevel: string) {
    setActioningId(grant.id);
    try {
      await supabase.from('workspace_access_grants').update({
        access_level: newLevel,
        granted_at: new Date().toISOString(),
        granted_by: currentUser?.id,
      }).eq('id', grant.id);
      toast({ title: 'Access level updated', description: `${grant._userName} → ${newLevel}` });
      refetchGrants();
      qc.invalidateQueries({ queryKey: ['workspace_access_grant'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setActioningId(null);
    }
  }

  async function handleRevoke(grant: Grant) {
    if (!currentUser?.id) return;
    setActioningId(grant.id);
    try {
      await supabase.from('workspace_access_grants').update({
        is_active: false,
        revoked_at: new Date().toISOString(),
        revoked_by: currentUser.id,
      }).eq('id', grant.id);

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

  async function handleRestore(grant: Grant) {
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
      await supabase.from('workspace_access_requests').update({
        status: 'approved',
        reviewed_by: currentUser.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', req.id);

      await supabase.from('workspace_access_grants').upsert({
        user_id: req.user_id,
        granted_by: currentUser.id,
        granted_at: new Date().toISOString(),
        access_level: 'viewer',
        notes: 'Approved from access request',
        is_active: true,
        revoked_at: null,
        revoked_by: null,
      }, { onConflict: 'user_id' });

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

  function statusLabel(status: string) {
    if (status === 'active') return { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' };
    if (status === 'revoked') return { label: 'Revoked', cls: 'bg-red-100 text-red-700' };
    if (status === 'pending') return { label: 'Pending', cls: 'bg-amber-100 text-amber-700' };
    return { label: 'No Access', cls: 'bg-slate-100 text-slate-500' };
  }

  const initials = (name: string | null) => (name ?? '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

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

        <Tabs defaultValue="all-users" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="shrink-0 grid grid-cols-4 h-9 text-xs">
            <TabsTrigger value="all-users" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              Users ({allUsers.length})
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
            <TabsTrigger value="clearances" className="text-xs">
              <Shield className="h-3 w-3 mr-1" />
              Clearances
            </TabsTrigger>
          </TabsList>

          {/* ── All Users ─────────────────────────────────────────────── */}
          <TabsContent value="all-users" className="flex-1 overflow-hidden flex flex-col m-0 mt-3">
            {/* Search + filter bar */}
            <div className="flex items-center gap-2 mb-3 shrink-0">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or role…" className="pl-8 h-8 text-xs" />
              </div>
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as any)}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All ({allUsers.length})</SelectItem>
                  <SelectItem value="active" className="text-xs">Active ({statusCounts.active})</SelectItem>
                  <SelectItem value="none" className="text-xs">No Access ({statusCounts.none})</SelectItem>
                  <SelectItem value="revoked" className="text-xs">Revoked ({statusCounts.revoked})</SelectItem>
                  <SelectItem value="pending" className="text-xs">Pending ({statusCounts.pending})</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* User rows */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {filteredUsers.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">No users match your filter</p>
                </div>
              ) : filteredUsers.map(u => {
                const sl = statusLabel(u.status);
                const isActioning = actioningId === (u.grant?.id ?? u.id);
                return (
                  <div key={u.id} className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border transition-colors group',
                    u.status === 'active' ? 'bg-card hover:bg-muted/30' : 'bg-muted/10 hover:bg-muted/20'
                  )}>
                    {/* Avatar */}
                    <div className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                      u.status === 'active' ? 'bg-[#0F2041]/10 text-[#0F2041]' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                    )}>
                      {initials(u.full_name)}
                    </div>

                    {/* Name + role */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{u.full_name ?? 'Unknown'}</p>
                      <p className="text-[11px] text-muted-foreground capitalize">{(u.role ?? '').replace(/_/g, ' ')}</p>
                    </div>

                    {/* Status badge */}
                    <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0', sl.cls)}>
                      {sl.label}
                    </span>

                    {/* Access level (active users) — inline editable */}
                    {u.status === 'active' && u.grant && (
                      <Select
                        value={u.grant.access_level}
                        onValueChange={v => handleChangeLevel(u.grant!, v)}
                        disabled={!!actioningId}
                      >
                        <SelectTrigger className="h-7 w-[90px] text-[10px] border-[#1D3461]/30 text-[#1D3461]">
                          <SelectValue />
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCESS_LEVELS.map(l => (
                            <SelectItem key={l.value} value={l.value} className="text-xs">
                              <span className={cn('font-medium capitalize', levelBadge(l.value), 'px-1.5 py-0.5 rounded text-[10px]')}>{l.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}

                    {/* Grant time */}
                    {u.status === 'active' && u.grant?.granted_at && (
                      <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                        {formatDistanceToNow(parseISO(u.grant.granted_at), { addSuffix: true })}
                      </span>
                    )}

                    {/* Actions */}
                    <div className="shrink-0 flex items-center gap-1">
                      {isActioning ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : u.status === 'active' && u.grant ? (
                        <Button size="sm" variant="ghost"
                          className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-opacity"
                          onClick={() => handleRevoke(u.grant!)}>
                          <UserX className="h-3 w-3 mr-1" />Revoke
                        </Button>
                      ) : u.status === 'revoked' && u.grant ? (
                        <Button size="sm" variant="ghost"
                          className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-opacity"
                          onClick={() => handleRestore(u.grant!)}>
                          <RotateCcw className="h-3 w-3 mr-1" />Restore
                        </Button>
                      ) : u.status === 'none' ? (
                        <Button size="sm"
                          className="opacity-0 group-hover:opacity-100 h-7 px-2 text-xs bg-[#1D3461] hover:bg-[#0F2041] transition-opacity"
                          onClick={() => handleGrant(u.id, 'viewer')}>
                          <UserPlus className="h-3 w-3 mr-1" />Grant
                        </Button>
                      ) : u.status === 'pending' ? (
                        <span className="text-[10px] text-amber-600 italic">Awaiting review</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Access Requests ────────────────────────────────────────── */}
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
                          {initials(req.user_name)}
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
                          <Button size="sm" variant="outline"
                            className="h-7 px-3 text-xs text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => handleRejectRequest(req)}
                            disabled={actioningId === req.id}
                            data-testid={`btn-reject-request-${req.id}`}>
                            {actioningId === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><XCircle className="h-3 w-3 mr-1" />Reject</>}
                          </Button>
                          <Button size="sm"
                            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            onClick={() => handleApproveRequest(req)}
                            disabled={actioningId === req.id}
                            data-testid={`btn-approve-request-${req.id}`}>
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

          {/* ── Grant Access ───────────────────────────────────────────── */}
          <TabsContent value="grant-access" className="flex-1 overflow-y-auto m-0 mt-3">
            <div className="space-y-5 max-w-sm mx-auto">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Select Staff Member</p>
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="h-10 text-sm" data-testid="select-grant-user">
                    <SelectValue placeholder="Choose a staff member…" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.filter(p => p.role !== 'super_admin').length === 0 ? (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No staff found</div>
                    ) : profiles.filter(p => p.role !== 'super_admin').map(p => {
                      const existing = grantMap[p.id];
                      return (
                        <SelectItem key={p.id} value={p.id} className="text-sm">
                          <span className="font-medium">{p.full_name ?? 'Unknown'}</span>
                          <span className="text-muted-foreground ml-2 capitalize text-xs">({(p.role ?? '').replace(/_/g, ' ')})</span>
                          {existing?.is_active && <span className="ml-2 text-[10px] text-emerald-600">• {existing.access_level}</span>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {selectedUser && grantMap[selectedUser]?.is_active && (
                  <p className="text-[11px] text-amber-600 flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    This user already has <strong>{grantMap[selectedUser].access_level}</strong> access. Submitting will update their level.
                  </p>
                )}
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
                          : 'border-border hover:bg-muted/30'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          'w-2 h-2 rounded-full shrink-0',
                          level.value === 'admin' ? 'bg-violet-500' : level.value === 'editor' ? 'bg-blue-500' : 'bg-slate-400'
                        )} />
                        <span className={cn('text-sm font-semibold', accessLevel === level.value ? 'text-[#0F2041]' : '')}>
                          {level.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 pl-4">{level.desc}</p>
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
                className="w-full bg-[#0F2041] hover:bg-[#1D3461] h-11 font-medium"
                onClick={() => handleGrant()}
                disabled={!selectedUser || granting}
                data-testid="btn-grant-access"
              >
                {granting ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Granting…</>
                ) : (
                  <><UserPlus className="h-4 w-4 mr-2" />
                    {selectedUser && grantMap[selectedUser]?.is_active ? 'Update Access Level' : 'Grant Access'}
                  </>
                )}
              </Button>
            </div>
          </TabsContent>

          {/* ── Security Clearances ────────────────────────────────────── */}
          <TabsContent value="clearances" className="flex-1 overflow-hidden flex flex-col m-0 mt-3">
            {/* Explanation */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/30 rounded-lg px-3 py-2 mb-3 shrink-0">
              <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
                Each user's clearance determines which files they can see. Users not listed default to <strong>Internal</strong>. Click <strong>+ Add</strong> on any level to assign users.
              </p>
            </div>

            {/* Global search */}
            <div className="relative mb-3 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={clearSearch} onChange={e => setClearSearch(e.target.value)} placeholder="Filter users across all levels…" className="pl-8 h-8 text-xs" />
            </div>

            {/* Grouped level sections */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
              {(Object.entries(SEC_CLEARANCES) as [ClearanceLevel, any][]).map(([level, cfg]) => {
                const Icon = cfg.icon;
                const isExpanded = expandedLevels.has(level);
                const usersInLevel = clearanceUsers.filter(u => u.clearance === level);
                const isAddingHere = addingToLevel === level;

                // Users not already at this level (for the add picker)
                const addableUsers = profiles
                  .filter(p => p.role !== 'super_admin')
                  .filter(p => {
                    const cur = clearanceMap[p.id]?.clearance_level ?? 'internal';
                    return cur !== level;
                  })
                  .filter(p => {
                    if (!addLevelSearch.trim()) return true;
                    const q = addLevelSearch.toLowerCase();
                    return (p.full_name ?? '').toLowerCase().includes(q) || (p.role ?? '').toLowerCase().includes(q);
                  });

                return (
                  <div key={level} className={cn('rounded-xl border overflow-hidden transition-all', cfg.border, isExpanded ? '' : '')}>
                    {/* Level header */}
                    <div
                      className={cn('flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none', cfg.bg)}
                      onClick={() => {
                        setExpandedLevels(prev => {
                          const next = new Set(prev);
                          if (next.has(level)) next.delete(level); else next.add(level);
                          return next;
                        });
                        if (addingToLevel === level) { setAddingToLevel(null); setAddLevelSearch(''); }
                      }}
                    >
                      <Icon className={cn('h-3.5 w-3.5 shrink-0', cfg.text)} />
                      <div className="flex-1 min-w-0">
                        <span className={cn('text-sm font-bold', cfg.text)}>{cfg.label}</span>
                        <span className="text-[11px] text-muted-foreground ml-2">{cfg.desc}</span>
                      </div>
                      <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border', cfg.bg, cfg.text, cfg.border)}>
                        {usersInLevel.length} {usersInLevel.length === 1 ? 'user' : 'users'}
                      </span>
                      {/* Add button */}
                      <button
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all',
                          'bg-white/80 hover:bg-white border-current/30 dark:bg-slate-800/80',
                          cfg.text
                        )}
                        onClick={e => {
                          e.stopPropagation();
                          if (addingToLevel === level) { setAddingToLevel(null); setAddLevelSearch(''); }
                          else { setAddingToLevel(level); setAddLevelSearch(''); setExpandedLevels(prev => new Set([...prev, level])); }
                        }}
                        data-testid={`btn-add-to-level-${level}`}
                      >
                        <Plus className="h-3 w-3" />Add
                      </button>
                      <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 transition-transform', cfg.text, isExpanded && 'rotate-90')} />
                    </div>

                    {/* Expanded body */}
                    {isExpanded && (
                      <div className="bg-card">
                        {/* Add user picker */}
                        {isAddingHere && (
                          <div className="border-b px-3 py-2.5 bg-muted/30 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-[11px] font-semibold text-muted-foreground">Add user to {cfg.label} clearance</p>
                              <button onClick={() => { setAddingToLevel(null); setAddLevelSearch(''); }} className="text-muted-foreground hover:text-foreground">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <div className="relative">
                              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                              <Input
                                value={addLevelSearch}
                                onChange={e => setAddLevelSearch(e.target.value)}
                                placeholder="Search staff…"
                                className="pl-7 h-7 text-xs"
                                autoFocus
                                data-testid={`input-add-to-level-${level}`}
                              />
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border bg-background p-1">
                              {addableUsers.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground text-center py-3">
                                  {addLevelSearch ? 'No matches' : 'All users are already at this level'}
                                </p>
                              ) : addableUsers.map(p => {
                                const curLevel = clearanceMap[p.id]?.clearance_level ?? 'internal';
                                const curCfg = SEC_CLEARANCES[curLevel as ClearanceLevel];
                                const isSaving = savingClearance === p.id;
                                return (
                                  <button
                                    key={p.id}
                                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors text-left"
                                    onClick={() => {
                                      handleSetClearance(p.id, level);
                                      setAddLevelSearch('');
                                    }}
                                    disabled={isSaving}
                                    data-testid={`btn-assign-user-${p.id}-to-${level}`}
                                  >
                                    <div className="w-6 h-6 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[9px] font-bold text-[#0F2041] shrink-0">
                                      {initials(p.full_name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold truncate">{p.full_name ?? 'Unknown'}</p>
                                      <p className="text-[10px] text-muted-foreground capitalize">{(p.role ?? '').replace(/_/g, ' ')}</p>
                                    </div>
                                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', curCfg.bg, curCfg.text, curCfg.border)}>
                                      {curLevel === curLevel && !clearanceMap[p.id] ? 'default' : curCfg.label}
                                    </span>
                                    {isSaving
                                      ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                                      : <Plus className={cn('h-3 w-3 shrink-0', cfg.text)} />}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Users in this level */}
                        {usersInLevel.length === 0 ? (
                          <div className="py-5 text-center">
                            <p className="text-xs text-muted-foreground">No users assigned to this level</p>
                          </div>
                        ) : (
                          <div className="divide-y">
                            {usersInLevel
                              .filter(u => clearSearch.trim() === '' ||
                                (u.full_name ?? '').toLowerCase().includes(clearSearch.toLowerCase()) ||
                                (u.role ?? '').toLowerCase().includes(clearSearch.toLowerCase()))
                              .map(u => {
                                const isSaving = savingClearance === u.id;
                                return (
                                  <div key={u.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/20 transition-colors group">
                                    {/* Avatar */}
                                    <div className="w-8 h-8 rounded-full bg-[#0F2041]/10 flex items-center justify-center text-[10px] font-bold shrink-0 text-[#0F2041]">
                                      {initials(u.full_name)}
                                    </div>

                                    {/* Name + role */}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold truncate">{u.full_name ?? 'Unknown'}</p>
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] text-muted-foreground capitalize">{(u.role ?? '').replace(/_/g, ' ')}</p>
                                        {!u.hasExplicit && (
                                          <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 rounded-full">default</span>
                                        )}
                                      </div>
                                    </div>

                                    {/* Move to another level */}
                                    {isSaving ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
                                    ) : (
                                      <Select
                                        value={u.clearance}
                                        onValueChange={v => handleSetClearance(u.id, v as ClearanceLevel)}
                                      >
                                        <SelectTrigger
                                          className="h-6 w-[100px] text-[10px] shrink-0"
                                          data-testid={`select-clearance-${u.id}`}
                                        >
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(Object.entries(SEC_CLEARANCES) as [ClearanceLevel, any][]).map(([lvl, lcfg]) => {
                                            const LIcon = lcfg.icon;
                                            return (
                                              <SelectItem key={lvl} value={lvl} className="text-xs">
                                                <span className="flex items-center gap-1.5">
                                                  <LIcon className={cn('h-3 w-3', lcfg.text)} />
                                                  {lcfg.label}
                                                </span>
                                              </SelectItem>
                                            );
                                          })}
                                        </SelectContent>
                                      </Select>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
