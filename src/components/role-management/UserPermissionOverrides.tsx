import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Check, X, Minus, Search, Shield, User, Clock, Info,
  History, Loader2, AlertTriangle, ChevronDown, ChevronRight,
  Trash2, Calendar,
} from 'lucide-react';
import { RESOURCES, ACTIONS, DEFAULT_ROLE_PERMISSIONS, ResourceType, ActionType } from '@/types/roles';
import { toDisplayLabel, normalizeRole } from '@/utils/roleMapping';
import { cn } from '@/lib/utils';

interface Override {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  is_granted: boolean;
  granted_by: string | null;
  reason: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditEntry {
  id: string;
  user_id: string;
  resource: string;
  action: string;
  old_granted: boolean | null;
  new_granted: boolean | null;
  changed_by: string | null;
  reason: string | null;
  event_type: string;
  created_at: string;
}

type OverrideState = 'inherit' | 'grant' | 'block';

const RESOURCE_LABELS: Record<string, string> = {
  users: 'Users', roles: 'Roles', permissions: 'Permissions',
  projects: 'Projects', mmp: 'MMP', site_visits: 'Site Visits',
  finances: 'Finances', reports: 'Reports', settings: 'Settings',
  super_admins: 'Super Admins', audit_logs: 'Audit Logs',
  wallets: 'Wallets', system: 'System', crm: 'CRM',
};

const ACTION_LABELS: Record<string, string> = {
  create: 'Create', read: 'Read', update: 'Update', delete: 'Delete',
  approve: 'Approve', assign: 'Assign', archive: 'Archive',
  restore: 'Restore', override: 'Override',
};

const ROLE_HAS_PERM = (role: string, resource: ResourceType, action: ActionType): boolean => {
  const normalized = normalizeRole(role) as keyof typeof DEFAULT_ROLE_PERMISSIONS;
  if (!normalized || !(normalized in DEFAULT_ROLE_PERMISSIONS)) return false;
  return DEFAULT_ROLE_PERMISSIONS[normalized as keyof typeof DEFAULT_ROLE_PERMISSIONS]
    ?.some(p => p.resource === resource && p.action === action) ?? false;
};

export function UserPermissionOverrides() {
  const { users, currentUser } = useAppContext();
  const { toast } = useToast();

  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Map<string, OverrideState>>(new Map());
  const [pendingReason, setPendingReason] = useState('');
  const [pendingExpiry, setPendingExpiry] = useState('');
  const [collapsedResources, setCollapsedResources] = useState<Set<string>>(new Set());
  const [showAudit, setShowAudit] = useState(false);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; key?: string }>({ open: false });

  const selectedUser = users.find(u => u.id === selectedUserId);

  const filteredUsers = users.filter(u =>
    u.id !== currentUser?.id &&
    (!search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  const fetchOverrides = useCallback(async (uid: string) => {
    setLoadingOverrides(true);
    try {
      const { data, error } = await supabase
        .from('user_permission_overrides')
        .select('*')
        .eq('user_id', uid)
        .order('resource');
      if (error) throw error;
      setOverrides((data as Override[]) || []);
    } catch (e: any) {
      if (!e?.message?.includes('does not exist')) {
        toast({ title: 'Could not load overrides', description: e.message, variant: 'destructive' });
      }
      setOverrides([]);
    } finally {
      setLoadingOverrides(false);
    }
  }, [toast]);

  const fetchAudit = useCallback(async (uid: string) => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase
        .from('permission_override_audit_log')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setAuditLog((data as AuditEntry[]) || []);
    } catch {
      setAuditLog([]);
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      fetchOverrides(selectedUserId);
      setPendingChanges(new Map());
      setPendingReason('');
      setPendingExpiry('');
    }
  }, [selectedUserId, fetchOverrides]);

  const getKey = (resource: string, action: string) => `${resource}:${action}`;

  const getCurrentState = (resource: string, action: string): OverrideState => {
    const key = getKey(resource, action);
    if (pendingChanges.has(key)) return pendingChanges.get(key)!;
    const existing = overrides.find(o => o.resource === resource && o.action === action);
    if (!existing) return 'inherit';
    if (existing.expires_at && new Date(existing.expires_at) < new Date()) return 'inherit';
    return existing.is_granted ? 'grant' : 'block';
  };

  const getEffective = (resource: string, action: string): boolean => {
    const state = getCurrentState(resource, action);
    if (state === 'grant') return true;
    if (state === 'block') return false;
    return ROLE_HAS_PERM(selectedUser?.role || '', resource as ResourceType, action as ActionType);
  };

  const toggleState = (resource: string, action: string) => {
    const key = getKey(resource, action);
    const current = getCurrentState(resource, action);
    const next: OverrideState = current === 'inherit' ? 'grant' : current === 'grant' ? 'block' : 'inherit';
    setPendingChanges(prev => {
      const m = new Map(prev);
      m.set(key, next);
      return m;
    });
  };

  const hasPendingChanges = pendingChanges.size > 0;

  const saveChanges = async () => {
    if (!selectedUserId || !hasPendingChanges) return;
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const grantedBy = authData?.user?.id;

      for (const [key, state] of pendingChanges.entries()) {
        const [resource, action] = key.split(':');
        if (state === 'inherit') {
          const existing = overrides.find(o => o.resource === resource && o.action === action);
          if (existing) {
            await supabase.from('user_permission_overrides').delete().eq('id', existing.id);
            await supabase.from('permission_override_audit_log').insert({
              user_id: selectedUserId, resource, action,
              old_granted: existing.is_granted, new_granted: null,
              changed_by: grantedBy, reason: pendingReason || null,
              event_type: 'deleted',
            });
          }
        } else {
          const isGranted = state === 'grant';
          const existing = overrides.find(o => o.resource === resource && o.action === action);
          const { data: upserted } = await supabase
            .from('user_permission_overrides')
            .upsert({
              user_id: selectedUserId, resource, action,
              is_granted: isGranted,
              granted_by: grantedBy,
              reason: pendingReason || null,
              expires_at: pendingExpiry || null,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id,resource,action' })
            .select()
            .single();
          await supabase.from('permission_override_audit_log').insert({
            user_id: selectedUserId, resource, action,
            override_id: (upserted as any)?.id || null,
            old_granted: existing?.is_granted ?? null,
            new_granted: isGranted,
            changed_by: grantedBy,
            reason: pendingReason || null,
            event_type: existing ? 'updated' : 'created',
          });
        }
      }

      toast({ title: 'Overrides saved', description: `${pendingChanges.size} permission override(s) updated for ${selectedUser?.name}.` });
      setPendingChanges(new Map());
      setPendingReason('');
      setPendingExpiry('');
      await fetchOverrides(selectedUserId);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const clearAllOverrides = async () => {
    if (!selectedUserId) return;
    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const grantedBy = authData?.user?.id;
      for (const o of overrides) {
        await supabase.from('permission_override_audit_log').insert({
          user_id: selectedUserId, resource: o.resource, action: o.action,
          old_granted: o.is_granted, new_granted: null,
          changed_by: grantedBy, reason: 'Bulk clear by Super Admin',
          event_type: 'deleted',
        });
      }
      await supabase.from('user_permission_overrides').delete().eq('user_id', selectedUserId);
      toast({ title: 'All overrides cleared', description: `${selectedUser?.name} now inherits all permissions from their role.` });
      setPendingChanges(new Map());
      await fetchOverrides(selectedUserId);
    } catch (e: any) {
      toast({ title: 'Clear failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
      setDeleteConfirm({ open: false });
    }
  };

  const toggleResource = (resource: string) => {
    setCollapsedResources(prev => {
      const s = new Set(prev);
      s.has(resource) ? s.delete(resource) : s.add(resource);
      return s;
    });
  };

  const activeOverrides = overrides.filter(o => !o.expires_at || new Date(o.expires_at) >= new Date());

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-purple-600" />
            User Permission Overrides
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Grant or block specific actions for individual users, independent of their role.
            Super Admin access only.
          </p>
        </div>
        {activeOverrides.length > 0 && selectedUserId && (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {activeOverrides.length} active override{activeOverrides.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* User selector */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search user by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-user-override-search"
            />
          </div>
          {(search || selectedUserId) && (
            <div className="mt-2 max-h-52 overflow-y-auto rounded-md border divide-y">
              {filteredUsers.slice(0, 20).map(u => (
                <button
                  key={u.id}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors',
                    selectedUserId === u.id && 'bg-primary/5 border-l-2 border-primary'
                  )}
                  onClick={() => { setSelectedUserId(u.id); setSearch(''); }}
                  data-testid={`button-select-override-user-${u.id}`}
                >
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={u.avatar} />
                    <AvatarFallback className="text-xs bg-primary/10 text-primary">
                      {(u.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <Badge variant="outline" className="ml-auto shrink-0 text-xs">
                    {toDisplayLabel(u.role || 'unknown')}
                  </Badge>
                </button>
              ))}
              {filteredUsers.length === 0 && (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">No users found</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected user panel */}
      {selectedUser && (
        <div className="space-y-4">
          {/* User info bar */}
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/40 border">
            <Avatar className="h-10 w-10">
              <AvatarImage src={selectedUser.avatar} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                {(selectedUser.name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{selectedUser.name}</p>
              <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
            </div>
            <Badge className="ml-auto">{toDisplayLabel(selectedUser.role || 'unknown')}</Badge>
            <Button
              variant="ghost" size="sm"
              onClick={() => { setShowAudit(true); fetchAudit(selectedUser.id); }}
              data-testid="button-view-override-audit"
            >
              <History className="h-4 w-4 mr-1" />
              Audit Log
            </Button>
            {activeOverrides.length > 0 && (
              <Button
                variant="ghost" size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => setDeleteConfirm({ open: true })}
                data-testid="button-clear-all-overrides"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-400 inline-block" />
              Role default (allowed)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/30 border border-red-300 inline-block" />
              Role default (denied)
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <Check className="h-3 w-3" /> Override: Grant
            </span>
            <span className="flex items-center gap-1 text-red-600 font-semibold">
              <X className="h-3 w-3" /> Override: Block
            </span>
            <span className="flex items-center gap-1">
              <Minus className="h-3 w-3" /> Inherit from role
            </span>
          </div>

          {loadingOverrides ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {RESOURCES.map(resource => {
                const isCollapsed = collapsedResources.has(resource);
                const overrideCount = ACTIONS.filter(action => {
                  const state = getCurrentState(resource, action);
                  return state !== 'inherit';
                }).length;

                return (
                  <Card key={resource} className="overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                      onClick={() => toggleResource(resource)}
                      data-testid={`button-collapse-resource-${resource}`}
                    >
                      <div className="flex items-center gap-2">
                        {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        <span className="font-semibold text-sm">{RESOURCE_LABELS[resource] || resource}</span>
                        {overrideCount > 0 && (
                          <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                            {overrideCount} override{overrideCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="border-t">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-muted/30">
                                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-28">Action</th>
                                <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">Role Default</th>
                                <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">Override</th>
                                <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">Effective</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {ACTIONS.map(action => {
                                const roleHas = ROLE_HAS_PERM(selectedUser.role || '', resource, action);
                                const state = getCurrentState(resource, action);
                                const effective = getEffective(resource, action);
                                const isPending = pendingChanges.has(getKey(resource, action));

                                return (
                                  <tr
                                    key={action}
                                    className={cn(
                                      'transition-colors',
                                      isPending && 'bg-amber-50/50 dark:bg-amber-900/10',
                                    )}
                                  >
                                    <td className="px-4 py-2.5 font-medium text-xs">{ACTION_LABELS[action]}</td>

                                    {/* Role default */}
                                    <td className="px-2 py-2.5 text-center">
                                      <span className={cn(
                                        'inline-flex items-center justify-center w-6 h-6 rounded text-xs',
                                        roleHas
                                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30'
                                          : 'bg-red-50 text-red-400 dark:bg-red-900/10',
                                      )}>
                                        {roleHas ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                      </span>
                                    </td>

                                    {/* Override toggle */}
                                    <td className="px-2 py-2.5 text-center">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              onClick={() => toggleState(resource, action)}
                                              className={cn(
                                                'inline-flex items-center justify-center w-8 h-8 rounded-md border-2 transition-all font-bold text-xs',
                                                state === 'grant' && 'bg-emerald-500 border-emerald-500 text-white',
                                                state === 'block' && 'bg-red-500 border-red-500 text-white',
                                                state === 'inherit' && 'bg-background border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground',
                                              )}
                                              data-testid={`button-override-${resource}-${action}`}
                                            >
                                              {state === 'grant' && <Check className="h-3 w-3" />}
                                              {state === 'block' && <X className="h-3 w-3" />}
                                              {state === 'inherit' && <Minus className="h-3 w-3" />}
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {state === 'inherit' && 'Click to grant this action'}
                                            {state === 'grant' && 'Click to block this action'}
                                            {state === 'block' && 'Click to remove override (inherit from role)'}
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </td>

                                    {/* Effective result */}
                                    <td className="px-2 py-2.5 text-center">
                                      <span className={cn(
                                        'inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold',
                                        effective
                                          ? 'bg-emerald-500 text-white'
                                          : 'bg-red-100 text-red-500 dark:bg-red-900/20',
                                      )}>
                                        {effective ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}

          {/* Save bar */}
          {hasPendingChanges && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 sticky bottom-4 shadow-lg">
              <CardContent className="pt-4 pb-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">{pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1">Reason / Note (optional)</label>
                    <Textarea
                      placeholder="Why are these overrides being set?"
                      value={pendingReason}
                      onChange={e => setPendingReason(e.target.value)}
                      rows={2}
                      className="resize-none text-sm"
                      data-testid="textarea-override-reason"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Expiry Date (optional)</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="datetime-local"
                        value={pendingExpiry}
                        onChange={e => setPendingExpiry(e.target.value)}
                        className="pl-9 text-sm"
                        data-testid="input-override-expiry"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Leave blank for no expiry</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPendingChanges(new Map())}
                    disabled={saving}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    onClick={saveChanges}
                    disabled={saving}
                    data-testid="button-save-overrides"
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                    Save Overrides
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">Select a user above to manage their permission overrides</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Overrides win over role defaults — use them sparingly and always add a reason.
          </p>
        </div>
      )}

      {/* Audit Log Dialog */}
      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-purple-600" />
              Override Audit Log — {selectedUser?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {loadingAudit ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : auditLog.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No audit history yet.</p>
            ) : (
              <div className="space-y-2 pr-1">
                {auditLog.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 text-sm"
                  >
                    <span className={cn(
                      'mt-0.5 shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-xs',
                      entry.event_type === 'created' && 'bg-emerald-100 text-emerald-700',
                      entry.event_type === 'updated' && 'bg-amber-100 text-amber-700',
                      entry.event_type === 'deleted' && 'bg-red-100 text-red-700',
                    )}>
                      {entry.event_type === 'created' && <Check className="h-3 w-3" />}
                      {entry.event_type === 'updated' && <Info className="h-3 w-3" />}
                      {entry.event_type === 'deleted' && <X className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        <span className="uppercase text-xs tracking-wide text-muted-foreground mr-1">{entry.event_type}</span>
                        {RESOURCE_LABELS[entry.resource] || entry.resource} → {ACTION_LABELS[entry.action] || entry.action}
                        {entry.new_granted !== null && (
                          <Badge variant="outline" className={cn(
                            'ml-2 text-xs',
                            entry.new_granted ? 'text-emerald-600' : 'text-red-600',
                          )}>
                            {entry.new_granted ? 'Granted' : 'Blocked'}
                          </Badge>
                        )}
                      </p>
                      {entry.reason && <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAudit(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear all confirm dialog */}
      <Dialog open={deleteConfirm.open} onOpenChange={(open) => setDeleteConfirm({ open })}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              Clear All Overrides?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove all {activeOverrides.length} active permission override{activeOverrides.length !== 1 ? 's' : ''} for <strong>{selectedUser?.name}</strong>.
            They will revert to their role defaults. This action is logged.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false })}>Cancel</Button>
            <Button variant="destructive" onClick={clearAllOverrides} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
