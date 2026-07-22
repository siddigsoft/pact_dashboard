import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, Lock, Unlock, Loader2, X, ChevronDown, ChevronRight,
  Users, FileText, Shield, Info, Plus, Globe, User, ChevronsUpDown, UserCircle,
  Grid3X3, Check,
} from 'lucide-react';
import { PAGE_DEFS } from '@/pages/PageAccessControl';
import { cn } from '@/lib/utils';
import { toDisplayLabel, normalizeRole } from '@/utils/roleMapping';

// ── Role matrix columns ──────────────────────────────────────────────────────
const MATRIX_ROLES: { code: string; short: string; full: string }[] = [
  { code: 'superAdmin',      short: 'SA',    full: 'Super Admin' },
  { code: 'admin',           short: 'Admin', full: 'Admin' },
  { code: 'countryDirector', short: 'CD',    full: 'Country Director' },
  { code: 'ict',             short: 'ICT',   full: 'ICT' },
  { code: 'fom',             short: 'FOM',   full: 'Field Ops Manager' },
  { code: 'financialAdmin',  short: 'FA',    full: 'Financial Admin' },
  { code: 'auditor',         short: 'Aud',   full: 'Auditor' },
  { code: 'projectManager',  short: 'PM',    full: 'Project Manager' },
  { code: 'supervisor',      short: 'Sup',   full: 'Supervisor' },
  { code: 'coordinator',     short: 'Coord', full: 'Coordinator' },
  { code: 'dataTeam',        short: 'DT',    full: 'Data Team' },
  { code: 'dataCollector',   short: 'DC',    full: 'Data Collector' },
  { code: 'reviewer',        short: 'Rev',   full: 'Reviewer' },
];

function roleHasAccess(pageRoles: string[], roleCode: string): boolean {
  if (pageRoles.includes('all')) return true;
  const hasNeg = pageRoles.some(r => r.startsWith('!'));
  if (hasNeg) {
    if (pageRoles.includes(`!${roleCode}`)) return false;
    const positives = pageRoles.filter(r => !r.startsWith('!'));
    return positives.length === 0 ? true : positives.includes(roleCode);
  }
  return pageRoles.includes(roleCode);
}

// Group PAGE_DEFS by their group label
function groupPageDefs(search: string) {
  const filtered = PAGE_DEFS.filter(p =>
    !search || p.label.toLowerCase().includes(search.toLowerCase()) || p.group.toLowerCase().includes(search.toLowerCase())
  );
  const groups: Record<string, typeof PAGE_DEFS> = {};
  for (const p of filtered) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }
  return groups;
}

interface Override {
  id: string;
  user_id: string;
  page_slug: string;
  is_blocked: boolean;
  granted_by: string | null;
  created_at: string;
}

interface User {
  id: string;
  name?: string;
  email: string;
  role?: string;
  avatar_url?: string;
}

const GROUP_COLORS: Record<string, string> = {
  'My Workspace': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Communication': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Programme Management': 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Field Operations': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Coordination': 'bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300',
  'Finance': 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Accounting': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'HR': 'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Tools': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Admin': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

export function PageAccessOverview() {
  const { users, currentUser } = useAppContext();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'by-user' | 'by-page' | 'by-role'>('by-user');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [newSlug, setNewSlug] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newBlocked, setNewBlocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userPickerOpen, setUserPickerOpen] = useState(false);

  const { data: overrides = [], isLoading } = useQuery<Override[]>({
    queryKey: ['page-access-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_access_overrides')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const getUserById = (id: string): User | undefined => users.find((u: any) => u.id === id);
  const getPageDef = (slug: string) => PAGE_DEFS.find(p => p.slug === slug);

  const deleteOverride = async (id: string) => {
    const { error } = await supabase.from('page_access_overrides').delete().eq('id', id);
    if (error) {
      toast({ title: 'Failed to remove override', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['page-access-overrides'] });
    toast({ title: 'Override removed', description: 'Page access override has been deleted.' });
  };

  const addOverride = async () => {
    if (!newUserId || !newSlug) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('page_access_overrides').upsert({
        user_id: newUserId,
        page_slug: newSlug,
        is_blocked: newBlocked,
        granted_by: currentUser?.id,
      }, { onConflict: 'user_id,page_slug' });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['page-access-overrides'] });
      toast({ title: newBlocked ? 'Page blocked' : 'Page granted', description: `Override saved successfully.` });
      setAdding(false);
      setNewSlug('');
      setNewUserId('');
    } catch (e: any) {
      toast({ title: 'Failed to save', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // Group overrides by user
  const byUser = useMemo(() => {
    const map = new Map<string, Override[]>();
    for (const ov of overrides) {
      if (!map.has(ov.user_id)) map.set(ov.user_id, []);
      map.get(ov.user_id)!.push(ov);
    }
    return map;
  }, [overrides]);

  // Group overrides by page
  const byPage = useMemo(() => {
    const map = new Map<string, Override[]>();
    for (const ov of overrides) {
      if (!map.has(ov.page_slug)) map.set(ov.page_slug, []);
      map.get(ov.page_slug)!.push(ov);
    }
    return map;
  }, [overrides]);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    return Array.from(byUser.entries()).filter(([userId]) => {
      const u = getUserById(userId);
      return !q || (u?.name || u?.email || userId).toLowerCase().includes(q);
    });
  }, [byUser, search, users]);

  const filteredPages = useMemo(() => {
    const q = search.toLowerCase();
    return Array.from(byPage.entries()).filter(([slug]) => {
      const def = getPageDef(slug);
      return !q || (def?.label || slug).toLowerCase().includes(q);
    });
  }, [byPage, search]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Info banner */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/40 text-xs text-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Page Access Overrides <span className="font-normal opacity-70" dir="rtl">/ تجاوزات صلاحيات الصفحات</span></span> let you grant or block specific pages for individual users, overriding their default role access. These are the same overrides controlled by the "Manage Access" button in the app header — managed here in one central view.
            <span className="block mt-1 opacity-70" dir="rtl">تتيح لك منح أو حظر صفحات محددة لمستخدمين أفراد، بتجاوز صلاحيات دورهم الافتراضية.</span>
          </div>
        </div>

        {/* Header + controls */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={viewMode === 'by-user' ? 'Search user…' : 'Search page…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs w-48"
              />
            </div>
            <div className="flex border rounded-md overflow-hidden">
              <button
                onClick={() => setViewMode('by-user')}
                className={cn('px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                  viewMode === 'by-user' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >
                <User className="h-3 w-3" /> By User <span className="opacity-60">/ حسب المستخدم</span>
              </button>
              <button
                onClick={() => setViewMode('by-page')}
                className={cn('px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                  viewMode === 'by-page' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >
                <FileText className="h-3 w-3" /> By Page <span className="opacity-60">/ حسب الصفحة</span>
              </button>
              <button
                onClick={() => setViewMode('by-role')}
                className={cn('px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
                  viewMode === 'by-role' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                )}
              >
                <Grid3X3 className="h-3 w-3" /> By Role <span className="opacity-60">/ حسب الدور</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">{overrides.length} override{overrides.length !== 1 ? 's' : ''}</Badge>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setAdding(!adding)}>
              <Plus className="h-3.5 w-3.5" />
              Add Override <span className="opacity-60 text-[10px]">/ إضافة تجاوز</span>
            </Button>
          </div>
        </div>

        {/* Add override form */}
        {adding && (
          <Card className="border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-semibold">Add Page Access Override <span className="text-xs font-normal text-muted-foreground" dir="rtl">/ إضافة تجاوز صلاحية صفحة</span></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">User <span className="opacity-60">/ المستخدم</span></label>
                  <Popover open={userPickerOpen} onOpenChange={setUserPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full h-8 text-xs justify-between font-normal"
                        data-testid="page-access-user-picker"
                      >
                        {newUserId
                          ? (() => { const u = (users as any[]).find((u: any) => u.id === newUserId); return u?.name || u?.email || 'Unknown'; })()
                          : <span className="text-muted-foreground">Search user…</span>
                        }
                        <ChevronsUpDown className="ml-1 h-3 w-3 text-muted-foreground flex-shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search by name or email…" className="text-xs h-8" />
                        <CommandList>
                          <CommandEmpty className="text-xs py-3 text-center text-muted-foreground">No users found.</CommandEmpty>
                          <CommandGroup>
                            {(users as any[]).map((u: any) => (
                              <CommandItem
                                key={u.id}
                                value={`${u.name || ''} ${u.email || ''}`}
                                onSelect={() => { setNewUserId(u.id); setUserPickerOpen(false); }}
                                className="text-xs"
                                data-testid={`page-access-user-option-${u.id}`}
                              >
                                <div className="flex items-center justify-between w-full gap-2">
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{u.name || u.email}</p>
                                    {u.name && <p className="text-muted-foreground truncate text-[10px]">{u.email}</p>}
                                  </div>
                                  <Badge variant="outline" className="text-[10px] flex-shrink-0 px-1.5">
                                    {toDisplayLabel(u.role || '')}
                                  </Badge>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Page <span className="opacity-60">/ الصفحة</span></label>
                  <Select value={newSlug} onValueChange={setNewSlug}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select page…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {PAGE_DEFS.map(p => (
                        <SelectItem key={p.slug} value={p.slug} className="text-xs">
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Effect <span className="opacity-60">/ التأثير</span></label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setNewBlocked(false)}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-colors',
                        !newBlocked ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-background hover:bg-muted'
                      )}
                    >
                      <Unlock className="h-3 w-3" /> Grant <span className="opacity-70">/ منح</span>
                    </button>
                    <button
                      onClick={() => setNewBlocked(true)}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md border text-xs font-medium transition-colors',
                        newBlocked ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-background hover:bg-muted'
                      )}
                    >
                      <Lock className="h-3 w-3" /> Block <span className="opacity-70">/ حظر</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdding(false)}>Cancel <span className="opacity-60">/ إلغاء</span></Button>
                <Button size="sm" className="h-8 text-xs" onClick={addOverride} disabled={saving || !newUserId || !newSlug}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  Save Override <span className="opacity-70 text-[10px]">/ حفظ</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Empty state */}
        {overrides.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Globe className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No page access overrides</p>
            <p className="text-xs opacity-70" dir="rtl">لا توجد تجاوزات لصلاحيات الصفحات</p>
            <p className="text-xs mt-1">All users follow their default role access. Use "Add Override" to grant or block specific pages.</p>
            <p className="text-xs mt-0.5 opacity-70" dir="rtl">جميع المستخدمين يتبعون صلاحيات دورهم الافتراضية. استخدم "إضافة تجاوز" لمنح أو حظر صفحات محددة.</p>
          </div>
        )}

        {/* ── By User View ── */}
        {viewMode === 'by-user' && overrides.length > 0 && (
          <div className="space-y-3">
            {filteredUsers.map(([userId, userOverrides]) => {
              const u = getUserById(userId);
              const displayName = u?.name || u?.email || `User ${userId.slice(0, 8)}`;
              const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
              return (
                <Card key={userId} className="border-border/60">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-7 w-7 text-xs">
                        <AvatarFallback className="bg-primary/10 text-primary">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{displayName}</p>
                        <p className="text-xs text-muted-foreground">{toDisplayLabel(u?.role || '')} • {userOverrides.length} override{userOverrides.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="flex flex-wrap gap-2">
                      {userOverrides.map(ov => {
                        const def = getPageDef(ov.page_slug);
                        const groupColor = GROUP_COLORS[def?.group || ''] || 'bg-gray-100 text-gray-600';
                        return (
                          <Tooltip key={ov.id}>
                            <TooltipTrigger asChild>
                              <div className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                                ov.is_blocked
                                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40'
                              )}>
                                {ov.is_blocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                {def?.label || ov.page_slug}
                                <button
                                  onClick={() => deleteOverride(ov.id)}
                                  className="ml-1 hover:opacity-70 transition-opacity"
                                  title="Remove override"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              <p className="font-semibold">{def?.label || ov.page_slug}</p>
                              <p className="text-muted-foreground">{def?.group} — {ov.is_blocked ? 'Blocked' : 'Granted'}</p>
                              <p className="text-muted-foreground">{new Date(ov.created_at).toLocaleDateString()}</p>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* ── By Role Matrix View ── */}
        {viewMode === 'by-role' && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/50 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <span className="font-semibold">Default role access</span> — shows what each role can see based on system defaults.
                Green <span className="font-semibold text-emerald-700 dark:text-emerald-400">✓</span> = accessible, Gray = no access.
                To grant or block a page for a <span className="font-semibold">specific user</span>, use the "By User" view and add an override.
              </span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <table className="w-full text-xs border-collapse min-w-[900px]">
                <thead>
                  <tr className="bg-muted/60 border-b border-border/60">
                    <th className="text-left px-3 py-2 font-semibold text-muted-foreground sticky left-0 bg-muted/60 z-10 min-w-[180px]">
                      Page
                    </th>
                    {MATRIX_ROLES.map(r => (
                      <Tooltip key={r.code}>
                        <TooltipTrigger asChild>
                          <th className="px-2 py-2 font-semibold text-center text-muted-foreground min-w-[46px] cursor-default">
                            {r.short}
                          </th>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs font-medium">{r.full}</TooltipContent>
                      </Tooltip>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupPageDefs(search)).map(([group, pages]) => (
                    <React.Fragment key={group}>
                      <tr className="bg-muted/30 border-y border-border/40">
                        <td
                          colSpan={MATRIX_ROLES.length + 1}
                          className="px-3 py-1.5 font-semibold text-[11px] text-muted-foreground uppercase tracking-wide sticky left-0"
                        >
                          {group}
                        </td>
                      </tr>
                      {pages.map((page, idx) => (
                        <tr
                          key={page.slug}
                          className={cn(
                            'border-b border-border/30 transition-colors hover:bg-muted/20',
                            idx % 2 === 0 ? '' : 'bg-muted/10'
                          )}
                        >
                          <td className="px-3 py-1.5 sticky left-0 bg-background z-10 border-r border-border/30">
                            <div className="flex items-center gap-1.5">
                              <page.icon className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground truncate max-w-[140px]">{page.label}</span>
                            </div>
                            {page.note && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 ml-4.5 truncate max-w-[150px]">{page.note}</p>
                            )}
                          </td>
                          {MATRIX_ROLES.map(r => {
                            const access = roleHasAccess(page.roles, r.code);
                            return (
                              <td key={r.code} className="px-2 py-1.5 text-center">
                                {access ? (
                                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                                    <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                                  </span>
                                ) : (
                                  <span className="inline-block w-3 h-0.5 rounded bg-muted-foreground/20 mx-auto" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
              {Object.keys(groupPageDefs(search)).length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Shield className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No pages match your search.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── By Page View ── */}
        {viewMode === 'by-page' && overrides.length > 0 && (
          <div className="space-y-3">
            {filteredPages.map(([slug, pageOverrides]) => {
              const def = getPageDef(slug);
              const blocked = pageOverrides.filter(o => o.is_blocked);
              const granted = pageOverrides.filter(o => !o.is_blocked);
              return (
                <Card key={slug} className="border-border/60">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-sm font-semibold">{def?.label || slug}</p>
                          <p className="text-xs text-muted-foreground">{def?.group} • {def?.path}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        {granted.length > 0 && (
                          <Badge className="text-[10px] px-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0">
                            <Unlock className="h-2.5 w-2.5 mr-1" /> {granted.length} granted
                          </Badge>
                        )}
                        {blocked.length > 0 && (
                          <Badge className="text-[10px] px-2 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-0">
                            <Lock className="h-2.5 w-2.5 mr-1" /> {blocked.length} blocked
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-3 pt-0">
                    <div className="flex flex-wrap gap-2">
                      {pageOverrides.map(ov => {
                        const u = getUserById(ov.user_id);
                        const name = u?.name || u?.email || `User ${ov.user_id.slice(0, 8)}`;
                        const initials = name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                        return (
                          <div key={ov.id} className={cn(
                            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
                            ov.is_blocked
                              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/40'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900/40'
                          )}>
                            {ov.is_blocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                            <Avatar className="h-4 w-4 text-[8px]">
                              <AvatarFallback className="text-[8px]">{initials}</AvatarFallback>
                            </Avatar>
                            {name}
                            <button
                              onClick={() => deleteOverride(ov.id)}
                              className="ml-1 hover:opacity-70 transition-opacity"
                              title="Remove override"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
