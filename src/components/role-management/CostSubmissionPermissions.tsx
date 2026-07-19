import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, ShieldCheck, Loader2, RotateCcw, Trash2, Users,
  CheckCircle2, XCircle, Info, Wallet, Mail, RefreshCcw,
  Pencil, ArrowLeftRight, Settings2,
} from 'lucide-react';
import { toDisplayLabel } from '@/utils/roleMapping';
import { cn } from '@/lib/utils';

interface CsOverride {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  is_granted: boolean;
  expires_at: string | null;
  created_at: string;
}

interface GrantedUser {
  userId: string;
  action: string;
  overrideId: string;
}

type ActionGroup = 'payment' | 'moderation' | 'data';

const PERMISSIONS: {
  action: string;
  label: string;
  labelAr: string;
  description: string;
  defaultRoles: string;
  icon: any;
  color: string;
  group: ActionGroup;
}[] = [
  {
    action: 'mark_paid',
    label: 'Mark Paid',
    labelAr: 'تحديد كمدفوع',
    description: 'Can mark approved submissions as paid (disburse funds).',
    defaultRoles: 'SuperAdmin, Admin, Finance Admin',
    icon: Wallet,
    color: 'green',
    group: 'payment',
  },
  {
    action: 'revert_paid',
    label: 'Revert Paid',
    labelAr: 'إرجاع الدفعة',
    description: 'Can undo a "Paid" mark and restore a submission to Approved.',
    defaultRoles: 'SuperAdmin, Admin',
    icon: RotateCcw,
    color: 'orange',
    group: 'payment',
  },
  {
    action: 'send_to_finance',
    label: 'Send to Finance',
    labelAr: 'إرسال للمالية',
    description: 'Can send payment requests by email to finance staff.',
    defaultRoles: 'SuperAdmin, Admin',
    icon: Mail,
    color: 'blue',
    group: 'payment',
  },
  {
    action: 'reconcile',
    label: 'Reconcile',
    labelAr: 'مطابقة / تسوية',
    description: 'Can open the reconciliation panel on paid submissions.',
    defaultRoles: 'Everyone (no gate currently)',
    icon: ArrowLeftRight,
    color: 'purple',
    group: 'payment',
  },
  {
    action: 'recall',
    label: 'Recall Submission',
    labelAr: 'سحب الطلب',
    description: 'Can recall/pull-back a submission that is under review or approved.',
    defaultRoles: 'SuperAdmin, Admin',
    icon: RefreshCcw,
    color: 'amber',
    group: 'moderation',
  },
  {
    action: 'revert_tier',
    label: 'Revert Tier Approval',
    labelAr: 'إرجاع موافقة المرحلة',
    description: 'Can step back one approval tier (T1/T2/T3/T4) on any submission.',
    defaultRoles: 'SuperAdmin, Admin',
    icon: RotateCcw,
    color: 'amber',
    group: 'moderation',
  },
  {
    action: 'edit',
    label: 'Edit Any Submission',
    labelAr: 'تعديل أي طلب',
    description: 'Can edit submissions at any status (not just own pending ones).',
    defaultRoles: 'SuperAdmin (any), Admin (pending)',
    icon: Pencil,
    color: 'sky',
    group: 'data',
  },
  {
    action: 'delete',
    label: 'Delete Any Submission',
    labelAr: 'حذف أي طلب',
    description: 'Can delete submissions at any non-reconciled status.',
    defaultRoles: 'SuperAdmin (any), Admin (pending)',
    icon: Trash2,
    color: 'red',
    group: 'data',
  },
];

const GROUP_LABELS: Record<ActionGroup, string> = {
  payment: 'Payment Actions',
  moderation: 'Moderation',
  data: 'Data Management',
};

const colorClass = (color: string, part: 'bg' | 'text' | 'border') => {
  const map: Record<string, Record<string, string>> = {
    green:  { bg: 'bg-green-100 dark:bg-green-900/30',  text: 'text-green-600',  border: 'border-green-400' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600', border: 'border-orange-400' },
    blue:   { bg: 'bg-blue-100 dark:bg-blue-900/30',   text: 'text-blue-600',   border: 'border-blue-400' },
    purple: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600', border: 'border-purple-400' },
    amber:  { bg: 'bg-amber-100 dark:bg-amber-900/30',  text: 'text-amber-600',  border: 'border-amber-400' },
    sky:    { bg: 'bg-sky-100 dark:bg-sky-900/30',     text: 'text-sky-600',    border: 'border-sky-400' },
    red:    { bg: 'bg-red-100 dark:bg-red-900/30',     text: 'text-red-600',    border: 'border-red-400' },
  };
  return map[color]?.[part] ?? '';
};

export function CostSubmissionPermissions() {
  const { users, currentUser } = useAppContext();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [overrides, setOverrides] = useState<CsOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [grantedUsers, setGrantedUsers] = useState<GrantedUser[]>([]);
  const [loadingGranted, setLoadingGranted] = useState(false);

  const selectedUser = users.find(u => u.id === selectedUserId);
  const filteredUsers = users.filter(u =>
    u.id !== currentUser?.id &&
    (!search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  const fetchGrantedUsers = useCallback(async () => {
    setLoadingGranted(true);
    try {
      const { data } = await supabase
        .from('user_permission_overrides')
        .select('id, user_id, action, created_at')
        .eq('resource', 'cost_submissions')
        .eq('is_granted', true);
      setGrantedUsers((data || []).map((d: any) => ({
        userId: d.user_id, action: d.action, overrideId: d.id,
      })));
    } catch { setGrantedUsers([]); }
    finally { setLoadingGranted(false); }
  }, []);

  const fetchOverrides = useCallback(async (uid: string) => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('user_permission_overrides')
        .select('*')
        .eq('user_id', uid)
        .eq('resource', 'cost_submissions');
      setOverrides((data as CsOverride[]) || []);
    } catch { setOverrides([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchGrantedUsers(); }, [fetchGrantedUsers]);
  useEffect(() => {
    if (selectedUserId) fetchOverrides(selectedUserId);
    else setOverrides([]);
  }, [selectedUserId, fetchOverrides]);

  const isGranted = (action: string): boolean => {
    const ov = overrides.find(o => o.action === action);
    if (!ov) return false;
    if (ov.expires_at && new Date(ov.expires_at) < new Date()) return false;
    return ov.is_granted;
  };

  const toggle = async (action: string, newValue: boolean) => {
    if (!selectedUserId) return;
    setSaving(action);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const grantedBy = authData?.user?.id;
      const existing = overrides.find(o => o.action === action);
      if (!newValue && existing) {
        await supabase.from('user_permission_overrides').delete().eq('id', existing.id);
        await supabase.from('permission_override_audit_log').insert({
          user_id: selectedUserId, resource: 'cost_submissions', action,
          old_granted: true, new_granted: null, changed_by: grantedBy,
          reason: 'Revoked by SuperAdmin', event_type: 'deleted',
        }).select();
      } else if (newValue) {
        await supabase.from('user_permission_overrides').upsert({
          user_id: selectedUserId, resource: 'cost_submissions', action,
          is_granted: true, granted_by: grantedBy, expires_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,resource,action' });
        await supabase.from('permission_override_audit_log').insert({
          user_id: selectedUserId, resource: 'cost_submissions', action,
          old_granted: existing?.is_granted ?? null, new_granted: true,
          changed_by: grantedBy, reason: 'Granted by SuperAdmin',
          event_type: existing ? 'updated' : 'created',
        }).select();
      }
      const perm = PERMISSIONS.find(p => p.action === action);
      toast({
        title: newValue ? `"${perm?.label}" granted` : `"${perm?.label}" revoked`,
        description: `${selectedUser?.name} ${newValue ? 'can now' : 'can no longer'} ${perm?.label.toLowerCase()}.`,
      });
      await fetchOverrides(selectedUserId);
      await fetchGrantedUsers();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(null); }
  };

  const revokeFromList = async (userId: string, action: string, overrideId: string) => {
    setSaving(`${userId}:${action}`);
    try {
      const { data: authData } = await supabase.auth.getUser();
      await supabase.from('user_permission_overrides').delete().eq('id', overrideId);
      await supabase.from('permission_override_audit_log').insert({
        user_id: userId, resource: 'cost_submissions', action,
        old_granted: true, new_granted: null, changed_by: authData?.user?.id,
        reason: 'Revoked by SuperAdmin', event_type: 'deleted',
      }).select();
      const user = users.find(u => u.id === userId);
      const perm = PERMISSIONS.find(p => p.action === action);
      toast({ title: `"${perm?.label}" revoked from ${user?.name ?? 'user'}` });
      await fetchGrantedUsers();
      if (selectedUserId === userId) await fetchOverrides(userId);
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally { setSaving(null); }
  };

  const groups = Array.from(new Set(PERMISSIONS.map(p => p.group))) as ActionGroup[];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-orange-500" />
          Cost Submission — Button Access Control
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Grant specific users the ability to see and use any action button on cost submissions,
          regardless of their primary role. SuperAdmin only.
        </p>
      </div>

      <Tabs defaultValue="grant">
        <TabsList>
          <TabsTrigger value="grant" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            Grant / Revoke Per User
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-2">
            <Users className="h-4 w-4" />
            All Granted Access
            {grantedUsers.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-orange-100 text-orange-700 dark:bg-orange-900/30 text-[10px] px-1.5">
                {grantedUsers.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Grant / Revoke tab ── */}
        <TabsContent value="grant" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* User picker */}
            <div className="lg:col-span-2 space-y-3">
              <Card>
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    Select a User
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pb-4">
                  <Input
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    data-testid="input-cs-perm-search"
                  />
                  {search && (
                    <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
                      {filteredUsers.slice(0, 15).map(u => (
                        <button
                          key={u.id}
                          className={cn(
                            'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors',
                            selectedUserId === u.id && 'bg-primary/5 border-l-2 border-primary',
                          )}
                          onClick={() => { setSelectedUserId(u.id); setSearch(''); }}
                          data-testid={`button-select-cs-perm-user-${u.id}`}
                        >
                          <Avatar className="h-7 w-7 shrink-0">
                            <AvatarImage src={u.avatar} />
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">
                              {(u.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {toDisplayLabel(u.role || 'unknown')}
                          </Badge>
                        </button>
                      ))}
                      {filteredUsers.length === 0 && (
                        <p className="px-3 py-4 text-sm text-muted-foreground text-center">No users found</p>
                      )}
                    </div>
                  )}
                  {selectedUser && !search && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={selectedUser.avatar} />
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                          {(selectedUser.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{selectedUser.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>
                      </div>
                      <Badge>{toDisplayLabel(selectedUser.role || 'unknown')}</Badge>
                    </div>
                  )}
                  {!selectedUser && !search && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Search and select a user above
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Permission toggles */}
            <div className="lg:col-span-3">
              {!selectedUser ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-16">
                    <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">Select a user to manage their permissions</p>
                  </CardContent>
                </Card>
              ) : loading ? (
                <Card>
                  <CardContent className="flex items-center justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {groups.map(group => {
                    const groupPerms = PERMISSIONS.filter(p => p.group === group);
                    return (
                      <Card key={group}>
                        <CardHeader className="pb-2 pt-4">
                          <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                            {GROUP_LABELS[group]}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1 pb-4">
                          {groupPerms.map((perm, i) => {
                            const Icon = perm.icon;
                            const granted = isGranted(perm.action);
                            const isSavingThis = saving === perm.action;
                            return (
                              <div key={perm.action}>
                                {i > 0 && <Separator className="my-3" />}
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex items-start gap-3 min-w-0">
                                    <div className={cn(
                                      'mt-0.5 p-1.5 rounded-md shrink-0',
                                      colorClass(perm.color, 'bg'),
                                      colorClass(perm.color, 'text'),
                                    )}>
                                      <Icon className="h-3.5 w-3.5" />
                                    </div>
                                    <div className="min-w-0">
                                      <Label htmlFor={`toggle-${perm.action}`} className="font-semibold text-sm cursor-pointer leading-tight">
                                        {perm.label}
                                        <span className="block text-xs font-normal text-muted-foreground">{perm.labelAr}</span>
                                      </Label>
                                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                                        {perm.description}
                                      </p>
                                      <p className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                                        <Info className="h-2.5 w-2.5 shrink-0" />
                                        Default: {perm.defaultRoles}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                    {granted && (
                                      <Badge className="text-[10px] px-1.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                        ON
                                      </Badge>
                                    )}
                                    {isSavingThis
                                      ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                      : (
                                        <Switch
                                          id={`toggle-${perm.action}`}
                                          checked={granted}
                                          onCheckedChange={val => toggle(perm.action, val)}
                                          data-testid={`switch-cs-perm-${perm.action}-${selectedUser.id}`}
                                        />
                                      )
                                    }
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── All Granted Access tab ── */}
        <TabsContent value="overview" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Users with Special Access
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingGranted ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : grantedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No special access granted yet.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Group by user */}
                  {Array.from(new Set(grantedUsers.map(g => g.userId))).map(userId => {
                    const user = users.find(u => u.id === userId);
                    if (!user) return null;
                    const userGrants = grantedUsers.filter(g => g.userId === userId);
                    return (
                      <div key={userId} className="flex flex-wrap items-start gap-3 p-3 rounded-lg border bg-muted/20">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                            {(user.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{toDisplayLabel(user.role || 'unknown')}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {userGrants.map(g => {
                              const perm = PERMISSIONS.find(p => p.action === g.action);
                              if (!perm) return null;
                              const Icon = perm.icon;
                              const isSavingThis = saving === `${g.userId}:${g.action}`;
                              return (
                                <div
                                  key={g.action}
                                  className={cn(
                                    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border',
                                    colorClass(perm.color, 'border'),
                                    colorClass(perm.color, 'text'),
                                    'bg-white dark:bg-background',
                                  )}
                                >
                                  <Icon className="h-2.5 w-2.5" />
                                  {perm.label}
                                  {isSavingThis
                                    ? <Loader2 className="h-2.5 w-2.5 animate-spin ml-0.5" />
                                    : (
                                      <button
                                        className="ml-0.5 hover:text-red-500 transition-colors"
                                        onClick={() => revokeFromList(g.userId, g.action, g.overrideId)}
                                        title="Revoke"
                                        data-testid={`button-revoke-cs-perm-${g.action}-${g.userId}`}
                                      >
                                        <XCircle className="h-2.5 w-2.5" />
                                      </button>
                                    )
                                  }
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-1" />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
