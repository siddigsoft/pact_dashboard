import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ChevronDown, ChevronRight, Search, Shield, Users, DollarSign,
  FolderKanban, ClipboardList, MapPin, BarChart2, Handshake, CheckCircle2,
  XCircle, AlertTriangle, Download, Eye, Pencil, Trash2, Plus,
  UserCheck, Lock, Star, Info, Filter, Globe
} from 'lucide-react';
import {
  MODULE_REGISTRY, ModuleDefinition, ModulePage, ModuleAction,
  getRolesWithPermission, getPermissionCoverage,
  DISPLAY_ROLES, ROLE_SHORT_LABELS
} from '@/types/moduleRegistry';
import { AppRole, DEFAULT_ROLE_PERMISSIONS } from '@/types/roles';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';

// ─── Icon map ────────────────────────────────────────────────────────────────
const MODULE_ICONS: Record<string, React.ReactNode> = {
  Shield: <Shield className="h-4 w-4" />,
  FolderKanban: <FolderKanban className="h-4 w-4" />,
  DollarSign: <DollarSign className="h-4 w-4" />,
  Users: <Users className="h-4 w-4" />,
  Handshake: <Handshake className="h-4 w-4" />,
  ClipboardList: <ClipboardList className="h-4 w-4" />,
  MapPin: <MapPin className="h-4 w-4" />,
  BarChart2: <BarChart2 className="h-4 w-4" />,
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
  read: <Eye className="h-3 w-3" />,
  create: <Plus className="h-3 w-3" />,
  update: <Pencil className="h-3 w-3" />,
  delete: <Trash2 className="h-3 w-3" />,
  approve: <CheckCircle2 className="h-3 w-3" />,
  submit: <UserCheck className="h-3 w-3" />,
  assign: <UserCheck className="h-3 w-3" />,
  export: <Download className="h-3 w-3" />,
  archive: <Lock className="h-3 w-3" />,
  restore: <Star className="h-3 w-3" />,
  override: <AlertTriangle className="h-3 w-3" />,
};

const MODULE_COLOR_CLASSES: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/30',   text: 'text-blue-700 dark:text-blue-300',   border: 'border-blue-200 dark:border-blue-800',   badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800', badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
  green:  { bg: 'bg-green-50 dark:bg-green-950/30',  text: 'text-green-700 dark:text-green-300',  border: 'border-green-200 dark:border-green-800',  badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-300', border: 'border-purple-200 dark:border-purple-800', badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/30', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800', badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  teal:   { bg: 'bg-teal-50 dark:bg-teal-950/30',   text: 'text-teal-700 dark:text-teal-300',   border: 'border-teal-200 dark:border-teal-800',   badge: 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300' },
  red:    { bg: 'bg-red-50 dark:bg-red-950/30',     text: 'text-red-700 dark:text-red-300',     border: 'border-red-200 dark:border-red-800',     badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300' },
  slate:  { bg: 'bg-slate-50 dark:bg-slate-950/30', text: 'text-slate-700 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-800', badge: 'bg-slate-100 text-slate-800 dark:bg-slate-900/40 dark:text-slate-300' },
};

// ─── Role dot indicator ───────────────────────────────────────────────────────
function RoleDot({ role, hasPermission }: { role: AppRole; hasPermission: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold cursor-default select-none transition-all',
              hasPermission
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
            )}
            data-testid={`role-dot-${role.replace(/\s/g, '-').replace(/[()]/g, '')}`}
          >
            {ROLE_SHORT_LABELS[role]}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{role}</p>
          <p className="text-xs text-muted-foreground">{hasPermission ? 'Has permission' : 'No permission'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Action row ───────────────────────────────────────────────────────────────
function ActionRow({ action, isSelected, onSelect }: {
  action: ModuleAction;
  isSelected: boolean;
  onSelect: (action: ModuleAction) => void;
}) {
  const rolesWithPerm = getRolesWithPermission(action.resource, action.action);
  const coverage = getPermissionCoverage(action.resource, action.action);

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-all hover:bg-muted/60 group',
        isSelected && 'bg-primary/5 ring-1 ring-primary/20',
        action.isDestructive && 'hover:bg-red-50/60 dark:hover:bg-red-950/20'
      )}
      onClick={() => onSelect(action)}
      data-testid={`action-row-${action.key}`}
    >
      {/* Action icon + label */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={cn(
          'p-1 rounded',
          action.isDestructive ? 'text-red-500 bg-red-50 dark:bg-red-950/30' : 'text-muted-foreground bg-muted',
          action.isSuperAdminOnly ? 'text-purple-600 bg-purple-50 dark:bg-purple-950/30' : ''
        )}>
          {ACTION_ICONS[action.action] ?? <Globe className="h-3 w-3" />}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium truncate">{action.label}</span>
            {action.isSuperAdminOnly && (
              <Badge className="text-[9px] px-1 py-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 h-4">SA only</Badge>
            )}
            {action.isAdminOnly && !action.isSuperAdminOnly && (
              <Badge className="text-[9px] px-1 py-0 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 h-4">Admin+</Badge>
            )}
            {action.isDestructive && (
              <Badge className="text-[9px] px-1 py-0 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 h-4">Destructive</Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{action.description}</p>
        </div>
      </div>

      {/* Role dots */}
      <div className="hidden lg:flex items-center gap-1 flex-shrink-0">
        {DISPLAY_ROLES.map(role => (
          <RoleDot key={role} role={role} hasPermission={rolesWithPerm.includes(role)} />
        ))}
      </div>

      {/* Coverage pill */}
      <div className="flex-shrink-0 w-14 text-right">
        <span className={cn(
          'text-xs font-semibold px-1.5 py-0.5 rounded',
          coverage >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
          coverage >= 40 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' :
          'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        )}>
          {coverage}%
        </span>
      </div>
    </div>
  );
}

// ─── Action detail panel ──────────────────────────────────────────────────────
function ActionDetailPanel({ action, onClose }: { action: ModuleAction; onClose: () => void }) {
  const rolesWithPerm = getRolesWithPermission(action.resource, action.action);
  const rolesWithout = DISPLAY_ROLES.filter(r => !rolesWithPerm.includes(r));

  return (
    <Card className="border-2 border-primary/20 shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-md bg-primary/10 text-primary">
              {ACTION_ICONS[action.action] ?? <Globe className="h-4 w-4" />}
            </span>
            <div>
              <CardTitle className="text-base">{action.label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{action.description}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>

        <div className="flex flex-wrap gap-2 mt-2">
          <Badge variant="outline" className="text-xs font-mono">{action.resource}:{action.action}</Badge>
          {action.isDestructive && <Badge className="text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Destructive</Badge>}
          {action.isSuperAdminOnly && <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">Super Admin Only</Badge>}
          {action.isAdminOnly && !action.isSuperAdminOnly && <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">Admin+ Only</Badge>}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Roles that have this permission */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            Roles with this permission ({rolesWithPerm.includes('SuperAdmin') ? rolesWithPerm.length - 1 : rolesWithPerm.length} role{rolesWithPerm.length !== 1 ? 's' : ''} + Super Admin)
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
              SuperAdmin ★
            </Badge>
            {DISPLAY_ROLES.filter(r => rolesWithPerm.includes(r)).map(role => (
              <Badge key={role} className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                {role}
              </Badge>
            ))}
          </div>
        </div>

        {/* Roles without */}
        {rolesWithout.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5 text-red-400" />
              Roles without this permission ({rolesWithout.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {rolesWithout.map(role => (
                <Badge key={role} variant="outline" className="text-xs text-muted-foreground">
                  {role}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Implementation note */}
        <div className="text-[11px] text-muted-foreground bg-muted/50 rounded-md p-2.5 flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            To grant this permission to a role not listed above, edit that role's permission set in the <strong>Roles</strong> tab. 
            For individual user overrides, use <strong>User Permission Overrides</strong> (Super Admin only).
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page section ─────────────────────────────────────────────────────────────
function PageSection({
  page, color, selectedAction, onSelectAction, search
}: {
  page: ModulePage;
  color: string;
  selectedAction: ModuleAction | null;
  onSelectAction: (action: ModuleAction | null) => void;
  search: string;
}) {
  const [open, setOpen] = useState(true);
  const colors = MODULE_COLOR_CLASSES[color] ?? MODULE_COLOR_CLASSES.blue;

  const filteredActions = useMemo(() => {
    if (!search) return page.actions;
    const q = search.toLowerCase();
    return page.actions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.resource.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q)
    );
  }, [page.actions, search]);

  if (filteredActions.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full text-left" data-testid={`page-trigger-${page.page.replace(/\s/g, '-')}`}>
        <div className={cn('flex items-center justify-between px-3 py-2 rounded-md', colors.bg, colors.border, 'border')}>
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className={cn('text-sm font-semibold', colors.text)}>{page.page}</span>
            <Badge className={cn('text-[10px] px-1.5 py-0', colors.badge)}>
              {filteredActions.length} action{filteredActions.length !== 1 ? 's' : ''}
            </Badge>
          </div>
          <span className="text-[11px] text-muted-foreground hidden sm:block truncate max-w-xs">{page.description}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5 ml-2">
          {filteredActions.map(action => (
            <ActionRow
              key={action.key}
              action={action}
              isSelected={selectedAction?.key === action.key}
              onSelect={(a) => onSelectAction(selectedAction?.key === a.key ? null : a)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Module card ──────────────────────────────────────────────────────────────
function ModuleCard({
  module: mod, selectedAction, onSelectAction, search
}: {
  module: ModuleDefinition;
  selectedAction: ModuleAction | null;
  onSelectAction: (action: ModuleAction | null) => void;
  search: string;
}) {
  const [open, setOpen] = useState(true);
  const colors = MODULE_COLOR_CLASSES[mod.color] ?? MODULE_COLOR_CLASSES.blue;

  const totalActions = mod.pages.reduce((sum, p) => sum + p.actions.length, 0);
  const filteredCount = useMemo(() => {
    if (!search) return totalActions;
    const q = search.toLowerCase();
    return mod.pages.reduce((sum, p) => sum + p.actions.filter(a =>
      a.label.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.resource.toLowerCase().includes(q) ||
      a.action.toLowerCase().includes(q)
    ).length, 0);
  }, [mod.pages, search, totalActions]);

  if (filteredCount === 0) return null;

  return (
    <Card className={cn('border', colors.border)} data-testid={`module-card-${mod.module.replace(/\s/g, '-')}`}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left" data-testid={`module-trigger-${mod.module.replace(/\s/g, '-')}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <span className={cn('p-1.5 rounded-md', colors.bg)}>
                  <span className={colors.text}>{MODULE_ICONS[mod.icon] ?? <Globe className="h-4 w-4" />}</span>
                </span>
                <div>
                  <CardTitle className={cn('text-base', colors.text)}>{mod.module}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{mod.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={cn('text-xs', colors.badge)}>
                  {mod.pages.length} page{mod.pages.length !== 1 ? 's' : ''}
                </Badge>
                <Badge className={cn('text-xs', colors.badge)}>
                  {filteredCount} action{filteredCount !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {mod.pages.map(page => (
              <PageSection
                key={page.page}
                page={page}
                color={mod.color}
                selectedAction={selectedAction}
                onSelectAction={onSelectAction}
                search={search}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function ModuleControlCenter() {
  const { currentUser } = useAppContext();
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const isAdmin = isSuperAdmin() || hasAnyRole(['admin', 'Admin']);

  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState<ModuleAction | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'admin-only' | 'destructive' | 'super-admin-only'>('all');
  const [highlightRole, setHighlightRole] = useState<AppRole | 'all'>('all');

  // Total counts
  const totalModules = MODULE_REGISTRY.length;
  const totalPages = MODULE_REGISTRY.reduce((s, m) => s + m.pages.length, 0);
  const totalActions = MODULE_REGISTRY.reduce((s, m) => m.pages.reduce((ps, p) => ps + p.actions.length, ps), 0);

  // Filtered registry
  const filteredRegistry = useMemo(() => {
    return MODULE_REGISTRY.map(mod => ({
      ...mod,
      pages: mod.pages.map(page => ({
        ...page,
        actions: page.actions.filter(action => {
          if (filterMode === 'admin-only' && !action.isAdminOnly && !action.isSuperAdminOnly) return false;
          if (filterMode === 'destructive' && !action.isDestructive) return false;
          if (filterMode === 'super-admin-only' && !action.isSuperAdminOnly) return false;
          if (highlightRole !== 'all') {
            const roles = getRolesWithPermission(action.resource, action.action);
            if (!roles.includes(highlightRole)) return false;
          }
          if (search) {
            const q = search.toLowerCase();
            return (
              action.label.toLowerCase().includes(q) ||
              action.description.toLowerCase().includes(q) ||
              action.resource.toLowerCase().includes(q) ||
              action.action.toLowerCase().includes(q) ||
              page.page.toLowerCase().includes(q) ||
              mod.module.toLowerCase().includes(q)
            );
          }
          return true;
        }),
      })).filter(page => page.actions.length > 0),
    })).filter(mod => mod.pages.length > 0);
  }, [search, filterMode, highlightRole]);

  return (
    <div className="space-y-6">
      {/* Header summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Modules', value: totalModules, icon: <Globe className="h-4 w-4" />, color: 'text-blue-600' },
          { label: 'Pages / Sections', value: totalPages, icon: <FolderKanban className="h-4 w-4" />, color: 'text-indigo-600' },
          { label: 'Buttons / Actions', value: totalActions, icon: <ClipboardList className="h-4 w-4" />, color: 'text-green-600' },
          { label: 'Roles Covered', value: DISPLAY_ROLES.length + 1, icon: <Shield className="h-4 w-4" />, color: 'text-purple-600' },
        ].map(item => (
          <Card key={item.label} className="p-3">
            <div className="flex items-center justify-between">
              <span className={cn('text-2xl font-bold', item.color)}>{item.value}</span>
              <span className="text-muted-foreground">{item.icon}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{item.label}</p>
          </Card>
        ))}
      </div>

      {/* Role legend */}
      <Card className="p-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Role Legend — click to filter by role</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setHighlightRole('all')}
            className={cn(
              'px-2 py-0.5 rounded text-xs font-medium transition-colors',
              highlightRole === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            )}
            data-testid="filter-role-all"
          >
            All Roles
          </button>
          {(['SuperAdmin', ...DISPLAY_ROLES] as AppRole[]).map(role => (
            <button
              key={role}
              onClick={() => setHighlightRole(highlightRole === role ? 'all' : role)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors',
                highlightRole === role
                  ? role === 'SuperAdmin' ? 'bg-purple-600 text-white' : 'bg-emerald-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              )}
              data-testid={`filter-role-${role.replace(/\s/g, '-').replace(/[()]/g, '')}`}
            >
              <span className={cn(
                'w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold',
                highlightRole === role ? 'bg-white/20' : 'bg-background'
              )}>
                {ROLE_SHORT_LABELS[role]}
              </span>
              {role}
            </button>
          ))}
        </div>
      </Card>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules, pages, actions, resources…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-module-search"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'admin-only', 'destructive', 'super-admin-only'] as const).map(mode => (
            <Button
              key={mode}
              size="sm"
              variant={filterMode === mode ? 'default' : 'outline'}
              onClick={() => setFilterMode(mode)}
              className="text-xs"
              data-testid={`filter-mode-${mode}`}
            >
              <Filter className="h-3 w-3 mr-1" />
              {mode === 'all' ? 'All' : mode === 'admin-only' ? 'Admin+' : mode === 'destructive' ? 'Destructive' : 'SA Only'}
            </Button>
          ))}
        </div>
      </div>

      {/* Role header row (desktop) */}
      <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 bg-muted/30 rounded-md text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <span className="flex-1">Action / Button</span>
        <div className="flex items-center gap-1">
          {DISPLAY_ROLES.map(role => (
            <div key={role} className="w-5 text-center" title={role}>
              <span className={cn(
                'inline-block w-5 h-5 rounded-full text-[8px] flex items-center justify-center font-bold',
                highlightRole === role ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {ROLE_SHORT_LABELS[role]}
              </span>
            </div>
          ))}
        </div>
        <span className="w-14 text-right">Cover</span>
      </div>

      {/* Detail panel */}
      {selectedAction && (
        <ActionDetailPanel
          action={selectedAction}
          onClose={() => setSelectedAction(null)}
        />
      )}

      {/* Module list */}
      {filteredRegistry.length === 0 ? (
        <Card className="p-8 text-center">
          <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No matching actions</p>
          <p className="text-sm text-muted-foreground mt-1">Try a different search term or clear the filter</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearch(''); setFilterMode('all'); setHighlightRole('all'); }}>
            Clear all filters
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredRegistry.map(mod => (
            <ModuleCard
              key={mod.module}
              module={mod}
              selectedAction={selectedAction}
              onSelectAction={setSelectedAction}
              search={search}
            />
          ))}
        </div>
      )}

      {/* Legend footer */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground pt-2 border-t">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" /> Role has permission</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-200 dark:bg-gray-700 inline-block" /> Role does not have permission</span>
        <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 font-semibold">70%+</span> Widely accessible</span>
        <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 font-semibold">40%+</span> Moderate coverage</span>
        <span className="flex items-center gap-1.5"><span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-semibold">&lt;40%</span> Restricted</span>
        <span className="flex items-center gap-1.5"><span className="text-[10px] font-medium bg-muted px-1.5 py-0.5 rounded">click any row</span> to see full role breakdown</span>
      </div>
    </div>
  );
}

export default ModuleControlCenter;
