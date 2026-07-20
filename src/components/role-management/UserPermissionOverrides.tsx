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
import { RESOURCES, ACTIONS, DEFAULT_ROLE_PERMISSIONS, RESOURCE_LABELS, ACTION_LABELS, ResourceType, ActionType, AppRole } from '@/types/roles';
import { toDisplayLabel } from '@/utils/roleMapping';
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


// Maps any role string format (camelCase RoleCode, PascalCase AppRole, snake_case, etc.)
// to the AppRole key used in DEFAULT_ROLE_PERMISSIONS.
// This is necessary because normalizeRole() returns a camelCase RoleCode ('admin')
// while DEFAULT_ROLE_PERMISSIONS uses PascalCase AppRole ('Admin').
const toAppRole = (r: string): AppRole | null => {
  if (!r) return null;
  // Direct AppRole passthrough (PascalCase already correct)
  if (r in DEFAULT_ROLE_PERMISSIONS) return r as AppRole;
  // Comprehensive mapping: camelCase / snake_case / legacy → AppRole
  const map: Record<string, AppRole> = {
    superadmin: 'SuperAdmin', superAdmin: 'SuperAdmin', super_admin: 'SuperAdmin', 'Super Admin': 'SuperAdmin',
    admin: 'Admin', Admin: 'Admin',
    countryDirector: 'CountryDirector', countrydirector: 'CountryDirector', country_director: 'CountryDirector',
    fom: 'Field Operation Manager (FOM)', 'Field Operation Manager (FOM)': 'Field Operation Manager (FOM)', fieldOpManager: 'Field Operation Manager (FOM)',
    financialAdmin: 'FinancialAdmin', financialadmin: 'FinancialAdmin', financial_admin: 'FinancialAdmin',
    ict: 'ICT', ICT: 'ICT',
    projectManager: 'ProjectManager', projectmanager: 'ProjectManager', project_manager: 'ProjectManager',
    seniorOperationsLead: 'SeniorOperationsLead', senioroperationslead: 'SeniorOperationsLead', senior_operations_lead: 'SeniorOperationsLead',
    supervisor: 'Supervisor', Supervisor: 'Supervisor',
    coordinator: 'Coordinator', Coordinator: 'Coordinator',
    dataTeam: 'DataTeam', datateam: 'DataTeam', data_team: 'DataTeam',
    dataCollector: 'DataCollector', datacollector: 'DataCollector', data_collector: 'DataCollector',
    reviewer: 'Reviewer', Reviewer: 'Reviewer',
    auditor: 'Auditor', Auditor: 'Auditor',
  };
  return map[r] ?? map[r.toLowerCase()] ?? null;
};

const ROLE_HAS_PERM = (role: string, resource: ResourceType, action: ActionType): boolean => {
  const appRole = toAppRole(role);
  if (!appRole) return false;
  return (DEFAULT_ROLE_PERMISSIONS[appRole] || []).some(p => p.resource === resource && p.action === action);
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
  const [collapsedResources, setCollapsedResources] = useState<Set<string>>(new Set(RESOURCES));
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
            User Permission Overrides <span className="text-base font-normal text-muted-foreground" dir="rtl">/ تجاوزات صلاحيات المستخدمين</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Grant or block specific actions for individual users, independent of their role.
            Super Admin access only.
          </p>
          <p className="text-xs text-muted-foreground/70" dir="rtl">منح أو حظر إجراءات محددة لمستخدمين أفراد، بشكل مستقل عن دورهم. للمدير الأعلى فقط.</p>
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
              placeholder="Search user by name or email… / ابحث عن مستخدم بالاسم أو البريد"
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
              Audit Log <span className="opacity-60 text-[10px]">/ سجل التدقيق</span>
            </Button>
            {activeOverrides.length > 0 && (
              <Button
                variant="ghost" size="sm"
                className="text-red-600 hover:text-red-700"
                onClick={() => setDeleteConfirm({ open: true })}
                data-testid="button-clear-all-overrides"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All <span className="opacity-60 text-[10px]">/ مسح الكل</span>
              </Button>
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-400 inline-block" />
              Role default (allowed) <span className="opacity-60">/ افتراضي (مسموح)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/30 border border-red-300 inline-block" />
              Role default (denied) <span className="opacity-60">/ افتراضي (محظور)</span>
            </span>
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <Check className="h-3 w-3" /> Override: Grant <span className="opacity-60 font-normal">/ تجاوز: منح</span>
            </span>
            <span className="flex items-center gap-1 text-red-600 font-semibold">
              <X className="h-3 w-3" /> Override: Block <span className="opacity-60 font-normal">/ تجاوز: حظر</span>
            </span>
            <span className="flex items-center gap-1">
              <Minus className="h-3 w-3" /> Inherit from role <span className="opacity-60">/ موروث من الدور</span>
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
                                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-28">Action <span className="opacity-60">/ الإجراء</span></th>
                                <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">Role Default <span className="opacity-60">/ الافتراضي</span></th>
                                <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">Override <span className="opacity-60">/ تجاوز</span></th>
                                <th className="text-center px-2 py-2 text-xs font-medium text-muted-foreground">Effective <span className="opacity-60">/ الفعلي</span></th>
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
            <div className="sticky bottom-0 z-20 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/80 dark:border-amber-700 shadow-lg backdrop-blur-sm px-4 py-3">
              {/* Row 1: status + buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200 text-sm font-semibold whitespace-nowrap">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {pendingChanges.size} unsaved change{pendingChanges.size !== 1 ? 's' : ''}
                  <span className="opacity-60 font-normal text-xs" dir="rtl">/ تغييرات غير محفوظة</span>
                </span>
                {/* Reason — grows to fill space */}
                <Input
                  placeholder="Reason / note (optional) / السبب (اختياري)"
                  value={pendingReason}
                  onChange={e => setPendingReason(e.target.value)}
                  className="h-8 text-xs flex-1 min-w-[160px] bg-white dark:bg-amber-950/60 border-amber-300 dark:border-amber-700"
                  data-testid="input-override-reason"
                />
                {/* Expiry */}
                <div className="relative flex-shrink-0">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    type="datetime-local"
                    value={pendingExpiry}
                    onChange={e => setPendingExpiry(e.target.value)}
                    className="h-8 text-xs pl-8 w-48 bg-white dark:bg-amber-950/60 border-amber-300 dark:border-amber-700"
                    data-testid="input-override-expiry"
                    title="Expiry date (optional) / تاريخ الانتهاء (اختياري)"
                  />
                </div>
                {/* Action buttons */}
                <div className="flex gap-2 flex-shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs border-amber-400 dark:border-amber-600"
                    onClick={() => setPendingChanges(new Map())}
                    disabled={saving}
                  >
                    Discard <span className="opacity-60 text-[10px]">/ تجاهل</span>
                  </Button>
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
                    onClick={saveChanges}
                    disabled={saving}
                    data-testid="button-save-overrides"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                    Save Overrides <span className="opacity-70 text-[10px]">/ حفظ</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!selectedUserId && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User className="h-12 w-12 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">Select a user above to manage their permission overrides</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5" dir="rtl">اختر مستخدماً أعلاه لإدارة تجاوزات صلاحياته</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Overrides win over role defaults — use them sparingly and always add a reason.
          </p>
          <p className="text-xs text-muted-foreground/60 mt-0.5" dir="rtl">التجاوزات تسبق افتراضيات الدور — استخدمها بحكمة وأضف دائماً سبباً.</p>
        </div>
      )}

      {/* Audit Log Dialog */}
      <Dialog open={showAudit} onOpenChange={setShowAudit}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-purple-600" />
              Override Audit Log <span className="font-normal text-muted-foreground text-sm">/ سجل تدقيق التجاوزات</span> — {selectedUser?.name}
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
              Clear All Overrides? <span className="font-normal text-muted-foreground text-sm" dir="rtl">/ مسح جميع التجاوزات؟</span>
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove all {activeOverrides.length} active permission override{activeOverrides.length !== 1 ? 's' : ''} for <strong>{selectedUser?.name}</strong>.
            They will revert to their role defaults. This action is logged.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1" dir="rtl">سيؤدي هذا إلى إزالة جميع التجاوزات النشطة. سيعود المستخدم إلى افتراضيات دوره. يتم تسجيل هذا الإجراء.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm({ open: false })}>Cancel <span className="opacity-60 text-[10px]">/ إلغاء</span></Button>
            <Button variant="destructive" onClick={clearAllOverrides} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Clear All <span className="opacity-70 text-[10px]">/ مسح الكل</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
