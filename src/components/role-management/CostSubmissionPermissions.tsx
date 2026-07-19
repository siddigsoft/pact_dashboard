import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Search, ShieldCheck, Loader2, RotateCcw, Trash2, Users,
  CheckCircle2, XCircle, Info,
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
}

interface GrantedUser {
  userId: string;
  action: string;
  overrideId: string;
  grantedAt: string;
}

const PERMISSIONS = [
  {
    action: 'revert_paid',
    label: 'Revert Paid',
    labelAr: 'إرجاع الدفعة',
    description: 'Can undo a "Paid" mark and restore the submission to Approved status.',
    icon: RotateCcw,
    color: 'orange',
  },
  {
    action: 'delete',
    label: 'Delete Any Submission',
    labelAr: 'حذف أي طلب',
    description: 'Can delete cost submissions regardless of status (not just their own pending ones).',
    icon: Trash2,
    color: 'red',
  },
] as const;

type CsAction = typeof PERMISSIONS[number]['action'];

export function CostSubmissionPermissions() {
  const { users, currentUser } = useAppContext();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [overrides, setOverrides] = useState<CsOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null); // which action is saving

  // All users who have any CS override — for the "Users with special access" list
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
        .select('id, user_id, action, is_granted, created_at')
        .eq('resource', 'cost_submissions')
        .eq('is_granted', true);
      setGrantedUsers((data || []).map(d => ({
        userId: d.user_id,
        action: d.action,
        overrideId: d.id,
        grantedAt: d.created_at,
      })));
    } catch {
      setGrantedUsers([]);
    } finally {
      setLoadingGranted(false);
    }
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
    } catch {
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchGrantedUsers(); }, [fetchGrantedUsers]);

  useEffect(() => {
    if (selectedUserId) fetchOverrides(selectedUserId);
    else setOverrides([]);
  }, [selectedUserId, fetchOverrides]);

  const isGranted = (action: CsAction): boolean => {
    const ov = overrides.find(o => o.action === action);
    if (!ov) return false;
    if (ov.expires_at && new Date(ov.expires_at) < new Date()) return false;
    return ov.is_granted;
  };

  const toggle = async (action: CsAction, newValue: boolean) => {
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
          old_granted: true, new_granted: null,
          changed_by: grantedBy, reason: 'Revoked by SuperAdmin',
          event_type: 'deleted',
        }).select();
      } else if (newValue) {
        await supabase.from('user_permission_overrides').upsert({
          user_id: selectedUserId,
          resource: 'cost_submissions',
          action,
          is_granted: true,
          granted_by: grantedBy,
          expires_at: null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,resource,action' });
        await supabase.from('permission_override_audit_log').insert({
          user_id: selectedUserId, resource: 'cost_submissions', action,
          old_granted: existing?.is_granted ?? null, new_granted: true,
          changed_by: grantedBy, reason: 'Granted by SuperAdmin',
          event_type: existing ? 'updated' : 'created',
        }).select();
      }

      const label = PERMISSIONS.find(p => p.action === action)?.label ?? action;
      toast({
        title: newValue ? `"${label}" granted` : `"${label}" revoked`,
        description: `${selectedUser?.name} ${newValue ? 'can now' : 'can no longer'} ${label.toLowerCase()}.`,
      });
      await fetchOverrides(selectedUserId);
      await fetchGrantedUsers();
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const revokeFromList = async (userId: string, action: string, overrideId: string) => {
    setSaving(`${userId}:${action}`);
    try {
      const { data: authData } = await supabase.auth.getUser();
      await supabase.from('user_permission_overrides').delete().eq('id', overrideId);
      await supabase.from('permission_override_audit_log').insert({
        user_id: userId, resource: 'cost_submissions', action,
        old_granted: true, new_granted: null,
        changed_by: authData?.user?.id, reason: 'Revoked by SuperAdmin',
        event_type: 'deleted',
      }).select();
      const user = users.find(u => u.id === userId);
      const label = PERMISSIONS.find(p => p.action === action)?.label ?? action;
      toast({ title: `"${label}" revoked from ${user?.name ?? 'user'}` });
      await fetchGrantedUsers();
      if (selectedUserId === userId) await fetchOverrides(userId);
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-orange-500" />
          Cost Submission Access Control
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Grant specific users elevated access to sensitive cost submission actions.
          SuperAdmin only.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left — Grant panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                Select a User
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
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
                        'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors',
                        selectedUserId === u.id && 'bg-primary/5 border-l-2 border-primary',
                      )}
                      onClick={() => { setSelectedUserId(u.id); setSearch(''); }}
                      data-testid={`button-select-cs-perm-user-${u.id}`}
                    >
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarImage src={u.avatar} />
                        <AvatarFallback className="text-xs bg-primary/10 text-primary">
                          {(u.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
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

              {/* Selected user info */}
              {selectedUser && !search && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={selectedUser.avatar} />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                      {(selectedUser.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{selectedUser.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedUser.email}</p>
                  </div>
                  <Badge>{toDisplayLabel(selectedUser.role || 'unknown')}</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Toggles */}
          {selectedUser && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Permissions for {selectedUser.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  PERMISSIONS.map((perm, i) => {
                    const Icon = perm.icon;
                    const granted = isGranted(perm.action);
                    const isSavingThis = saving === perm.action;
                    return (
                      <div key={perm.action}>
                        {i > 0 && <Separator className="my-3" />}
                        <div className="flex items-start justify-between gap-4 py-1">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={cn(
                              'mt-0.5 p-1.5 rounded-md shrink-0',
                              perm.color === 'orange' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30' : 'bg-red-100 text-red-600 dark:bg-red-900/30',
                            )}>
                              <Icon className="h-4 w-4" />
                            </div>
                            <div>
                              <Label htmlFor={`toggle-${perm.action}`} className="font-semibold text-sm cursor-pointer">
                                {perm.label}
                                <span className="block text-xs font-normal text-muted-foreground">{perm.labelAr}</span>
                              </Label>
                              <p className="text-xs text-muted-foreground mt-0.5 flex items-start gap-1">
                                <Info className="h-3 w-3 shrink-0 mt-0.5" />
                                {perm.description}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {granted && (
                              <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                Granted
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
                  })
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right — Users with special access */}
        <div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                Users with Special Access
                {grantedUsers.length > 0 && (
                  <Badge variant="secondary" className="ml-auto bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    {grantedUsers.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingGranted ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : grantedUsers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <ShieldCheck className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No special access granted yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Select a user on the left to grant access.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {grantedUsers.map(g => {
                    const user = users.find(u => u.id === g.userId);
                    const perm = PERMISSIONS.find(p => p.action === g.action);
                    if (!user || !perm) return null;
                    const Icon = perm.icon;
                    const isSavingThis = saving === `${g.userId}:${g.action}`;
                    return (
                      <div
                        key={`${g.userId}:${g.action}`}
                        className="flex items-center gap-3 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors"
                      >
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {(user.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{user.name}</p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Icon className={cn(
                              'h-3 w-3',
                              perm.color === 'orange' ? 'text-orange-500' : 'text-red-500',
                            )} />
                            <span className="text-xs text-muted-foreground">{perm.label}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {toDisplayLabel(user.role || 'unknown')}
                        </Badge>
                        <div className="flex items-center gap-1 shrink-0">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          {isSavingThis
                            ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            : (
                              <button
                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 transition-colors"
                                onClick={() => revokeFromList(g.userId, g.action, g.overrideId)}
                                title="Revoke access"
                                data-testid={`button-revoke-cs-perm-${g.action}-${g.userId}`}
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            )
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
