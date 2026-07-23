import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Save, Shield, AlertTriangle, ChevronDown, ChevronRight,
  Users, DollarSign, FolderKanban, Settings, Wrench,
} from 'lucide-react';
import {
  RoleWithPermissions, ResourceType, ActionType,
  ACTIONS, RESOURCE_LABELS, ACTION_LABELS,
} from '@/types/roles';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ── Domain definitions ────────────────────────────────────────────────────────

interface DomainGroup {
  label: string;
  labelAr: string;
  description: string;
  color: 'blue' | 'indigo' | 'green' | 'purple' | 'orange';
  icon: React.ReactNode;
  resources: ResourceType[];
}

const DOMAIN_GROUPS: DomainGroup[] = [
  {
    label: 'Administration',
    labelAr: 'الإدارة',
    description: 'Users, roles, permissions, system settings, audit logs',
    color: 'blue',
    icon: <Shield className="h-4 w-4" />,
    resources: ['users', 'roles', 'permissions', 'settings', 'system', 'super_admins', 'audit_logs'],
  },
  {
    label: 'Programme Management',
    labelAr: 'إدارة البرامج',
    description: 'Projects, MMP, site visits, portfolio, analytics, field operations',
    color: 'indigo',
    icon: <FolderKanban className="h-4 w-4" />,
    resources: ['projects', 'portfolio', 'analytics', 'mmp', 'site_visits', 'hub_operations', 'safety', 'incidents', 'equipment', 'coverage_map'],
  },
  {
    label: 'Finance & Accounting',
    labelAr: 'المالية والمحاسبة',
    description: 'Budgets, wallets, cost submissions, down payments, accounting, procurement, fixed assets',
    color: 'green',
    icon: <DollarSign className="h-4 w-4" />,
    resources: ['finances', 'wallets', 'accounting', 'down_payments', 'cost_submissions', 'pre_funding', 'procurement', 'fixed_assets', 'transactions'],
  },
  {
    label: 'HR & People',
    labelAr: 'الموارد البشرية',
    description: 'Staff records, payroll, leave, benefits, succession, pulse surveys, HR analytics',
    color: 'purple',
    icon: <Users className="h-4 w-4" />,
    resources: ['hr', 'payroll', 'leave', 'benefits', 'succession', 'pulse_surveys', 'hr_analytics'],
  },
  {
    label: 'Tools & Communication',
    labelAr: 'الأدوات والتواصل',
    description: 'Surveys, tasks, notifications, broadcast, WhatsApp, calendar, CRM, reports',
    color: 'orange',
    icon: <Wrench className="h-4 w-4" />,
    resources: ['surveys', 'tasks', 'notifications', 'broadcast', 'whatsapp', 'calendar', 'signatures', 'integrations', 'crm', 'reports'],
  },
];

const DOMAIN_COLORS = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-950/20',   border: 'border-blue-200 dark:border-blue-800',   text: 'text-blue-700 dark:text-blue-300',   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  indigo: { bg: 'bg-indigo-50 dark:bg-indigo-950/20', border: 'border-indigo-200 dark:border-indigo-800', text: 'text-indigo-700 dark:text-indigo-300', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  green:  { bg: 'bg-green-50 dark:bg-green-950/20',  border: 'border-green-200 dark:border-green-800',  text: 'text-green-700 dark:text-green-300',  badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-950/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-300', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  orange: { bg: 'bg-orange-50 dark:bg-orange-950/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
};

// Actions that warrant a warning when "Select All" is triggered
const SENSITIVE_ACTIONS: ActionType[] = ['delete', 'override', 'restore'];
const SENSITIVE_RESOURCES: ResourceType[] = ['super_admins', 'system', 'permissions', 'audit_logs'];

function wouldGrantSensitive(resource: ResourceType, currentSelected: Set<string>): ActionType[] {
  return SENSITIVE_ACTIONS.filter(
    action => !currentSelected.has(`${resource}:${action}`)
  ).concat(
    SENSITIVE_RESOURCES.includes(resource)
      ? ACTIONS.filter(a => !currentSelected.has(`${resource}:${a}`))
      : []
  ).filter((v, i, arr) => arr.indexOf(v) === i);
}

// Action badge colors
function actionBadgeClass(action: ActionType, selected: boolean): string {
  if (!selected) return 'bg-gray-50 text-gray-400 border border-gray-200 dark:bg-gray-800/40 dark:text-gray-500 dark:border-gray-700';
  const map: Record<ActionType, string> = {
    create: 'bg-green-100 text-green-800 border border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
    read:   'bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    update: 'bg-yellow-100 text-yellow-800 border border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700',
    delete: 'bg-red-100 text-red-800 border border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
    approve: 'bg-purple-100 text-purple-800 border border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
    assign: 'bg-indigo-100 text-indigo-800 border border-indigo-300 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-700',
    archive: 'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-900/30 dark:text-slate-300 dark:border-slate-600',
    restore: 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    override: 'bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700',
    submit: 'bg-teal-100 text-teal-800 border border-teal-300 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700',
    export: 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700',
  };
  return map[action] ?? 'bg-gray-100 text-gray-700 border border-gray-300';
}

// ── Resource row ───────────────────────────────────────────────────────────────
function ResourceRow({
  resource,
  selected,
  onToggle,
  onSelectAll,
  disabled,
}: {
  resource: ResourceType;
  selected: Set<string>;
  onToggle: (resource: ResourceType, action: ActionType) => void;
  onSelectAll: (resource: ResourceType) => void;
  disabled: boolean;
}) {
  const count = ACTIONS.filter(a => selected.has(`${resource}:${a}`)).length;
  const allSelected = count === ACTIONS.length;
  const someSelected = count > 0 && count < ACTIONS.length;

  return (
    <div className="rounded-md border border-muted bg-background p-3 space-y-2">
      {/* Resource header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${resource}-all`}
            checked={someSelected ? 'indeterminate' : allSelected}
            onCheckedChange={() => onSelectAll(resource)}
            disabled={disabled}
            data-testid={`checkbox-resource-all-${resource}`}
          />
          <Label htmlFor={`${resource}-all`} className="text-sm font-semibold cursor-pointer">
            {RESOURCE_LABELS[resource] ?? resource}
          </Label>
        </div>
        <Badge variant="outline" className="text-xs tabular-nums">
          {count}/{ACTIONS.length}
        </Badge>
      </div>

      {/* Action checkboxes */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-1.5 pt-1">
        {ACTIONS.map(action => {
          const key = `${resource}:${action}`;
          const isSelected = selected.has(key);
          return (
            <div
              key={action}
              className="flex items-center gap-1.5"
              data-testid={`perm-${resource}-${action}`}
            >
              <Checkbox
                id={key}
                checked={isSelected}
                onCheckedChange={() => onToggle(resource, action)}
                disabled={disabled}
              />
              <Label
                htmlFor={key}
                className="text-xs cursor-pointer leading-none"
              >
                <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium', actionBadgeClass(action, isSelected))}>
                  {ACTION_LABELS[action] ?? action}
                </span>
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Domain section ─────────────────────────────────────────────────────────────
function DomainSection({
  group,
  selected,
  onToggle,
  onSelectAll,
  disabled,
}: {
  group: DomainGroup;
  selected: Set<string>;
  onToggle: (resource: ResourceType, action: ActionType) => void;
  onSelectAll: (resource: ResourceType) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(true);
  const colors = DOMAIN_COLORS[group.color];

  const totalSelected = group.resources.reduce(
    (sum, r) => sum + ACTIONS.filter(a => selected.has(`${r}:${a}`)).length, 0
  );
  const totalPossible = group.resources.length * ACTIONS.length;

  return (
    <Card className={cn('border', colors.border)}>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className={cn('w-full text-left px-4 py-3 rounded-t-lg flex items-center justify-between', colors.bg)} type="button">
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              <span className={cn('p-1 rounded', colors.bg)}>
                <span className={colors.text}>{group.icon}</span>
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className={cn('text-sm font-semibold', colors.text)}>{group.label}</span>
                  <span className="text-xs text-muted-foreground" dir="rtl">{group.labelAr}</span>
                </div>
                <p className="text-[11px] text-muted-foreground hidden sm:block">{group.description}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={cn('text-xs tabular-nums', colors.badge)}>
                {totalSelected}/{totalPossible}
              </Badge>
              {totalSelected > 0 && (
                <span className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  totalSelected === totalPossible
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                    : totalSelected > totalPossible / 2
                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                )}>
                  {Math.round((totalSelected / totalPossible) * 100)}%
                </span>
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-3 pb-4 space-y-2">
            {group.resources.map(resource => (
              <ResourceRow
                key={resource}
                resource={resource}
                selected={selected}
                onToggle={onToggle}
                onSelectAll={onSelectAll}
                disabled={disabled}
              />
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface PermissionManagerProps {
  role: RoleWithPermissions;
  onUpdatePermissions: (roleId: string, permissions: { resource: ResourceType; action: ActionType }[]) => Promise<boolean>;
  isLoading?: boolean;
}

export const PermissionManager: React.FC<PermissionManagerProps> = ({
  role,
  onUpdatePermissions,
  isLoading = false,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ resource: ResourceType; sensitiveMissing: ActionType[] } | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setSelected(new Set(role.permissions.map(p => `${p.resource}:${p.action}`)));
    setHasChanges(false);
  }, [role]);

  const handleToggle = (resource: ResourceType, action: ActionType) => {
    const key = `${resource}:${action}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key); else next.add(key);
    setSelected(next);
    setHasChanges(true);
  };

  const handleSelectAll = (resource: ResourceType) => {
    const keys = ACTIONS.map(a => `${resource}:${a}`);
    const allSelected = keys.every(k => selected.has(k));

    if (!allSelected) {
      // Check if granting would add sensitive permissions
      const sensitive = wouldGrantSensitive(resource, selected);
      if (sensitive.length > 0) {
        setConfirmDialog({ resource, sensitiveMissing: sensitive });
        return;
      }
    }

    const next = new Set(selected);
    if (allSelected) keys.forEach(k => next.delete(k));
    else keys.forEach(k => next.add(k));
    setSelected(next);
    setHasChanges(true);
  };

  const confirmSelectAll = () => {
    if (!confirmDialog) return;
    const keys = ACTIONS.map(a => `${confirmDialog.resource}:${a}`);
    const next = new Set(selected);
    keys.forEach(k => next.add(k));
    setSelected(next);
    setHasChanges(true);
    setConfirmDialog(null);
  };

  const handleSave = async () => {
    setSaving(true);
    const permissions = Array.from(selected).map(key => {
      const [resource, action] = key.split(':') as [ResourceType, ActionType];
      return { resource, action };
    });
    const ok = await onUpdatePermissions(role.id, permissions);
    if (ok) {
      setHasChanges(false);
      toast({ title: 'Permissions saved', description: `${role.display_name} permissions updated.` });
    }
    setSaving(false);
  };

  const handleReset = () => {
    setSelected(new Set(role.permissions.map(p => `${p.resource}:${p.action}`)));
    setHasChanges(false);
  };

  const totalSelected = Array.from(selected).length;
  const totalPossible = DOMAIN_GROUPS.reduce((s, g) => s + g.resources.length, 0) * ACTIONS.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">
            Permission Matrix — {role.display_name}
            <span className="ml-2 text-xs text-muted-foreground font-normal" dir="rtl">مصفوفة الصلاحيات</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalSelected} of {totalPossible} possible permissions granted
            {hasChanges && <span className="ml-2 text-amber-600 dark:text-amber-400 font-medium">· Unsaved changes</span>}
          </p>
        </div>
        {hasChanges && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save Permissions
            </Button>
          </div>
        )}
      </div>

      {role.is_system_role && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-300 text-sm">
            <strong>System role</strong> — changes apply to all users assigned this role. Be careful with destructive actions.
          </AlertDescription>
        </Alert>
      )}

      {/* Domain groups */}
      <div className="space-y-3">
        {DOMAIN_GROUPS.map(group => (
          <DomainSection
            key={group.label}
            group={group}
            selected={selected}
            onToggle={handleToggle}
            onSelectAll={handleSelectAll}
            disabled={isLoading || saving}
          />
        ))}
      </div>

      {/* Sticky save bar when changes exist */}
      {hasChanges && (
        <div className="flex justify-between items-center gap-2 pt-4 border-t sticky bottom-0 bg-background pb-2">
          <span className="text-sm text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> You have unsaved permission changes
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>Cancel</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? 'Saving…' : 'Save Permissions'}
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog for sensitive Select All */}
      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-5 w-5" />
              Grant sensitive permissions?
            </DialogTitle>
          </DialogHeader>
          {confirmDialog && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Selecting all for <strong>{RESOURCE_LABELS[confirmDialog.resource]}</strong> will also grant:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {confirmDialog.sensitiveMissing.map(a => (
                  <Badge key={a} className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                    {ACTION_LABELS[a]}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                These are potentially destructive or high-risk actions. Make sure this is intentional.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmSelectAll}>Grant All Anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
