import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RoleBaselineAccessEditor } from './RoleBaselineAccessEditor';
import { supabase } from '@/integrations/supabase/client';
import { getGrantablePageGroups } from '@/lib/access-registry';
import { withPageDefaultPermissions } from '@/lib/page-default-permissions';
import { Checkbox } from '@/components/ui/checkbox';
import { RoleBaselineAccess, RoleWithPermissions, UpdateRoleRequest, ResourceType, ActionType } from '@/types/roles';
import { PermissionManager } from './PermissionManager';

interface EditRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: RoleWithPermissions | null;
  onUpdateRole: (roleId: string, roleData: UpdateRoleRequest) => Promise<boolean>;
  isLoading: boolean;
}

export const EditRoleDialog: React.FC<EditRoleDialogProps> = ({
  open,
  onOpenChange,
  role,
  onUpdateRole,
  isLoading
}) => {
  const [baseline, setBaseline] = useState<RoleBaselineAccess>({});
  const [pages, setPages] = useState<string[]>([]);
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState<string | null>(null);
  const [allowCostScope, setAllowCostScope] = useState(false);
  useEffect(() => {
    if (!open || !role) return;
    let cancelled = false;
    setBaselineLoading(true);
    setBaselineError(null);
    const db = supabase as any;
    Promise.all([
      db.from('role_tab_configs').select('page_slug, is_blocked').eq('role_id', role.id),
      db.from('column_visibility_config').select('page_slug, column_key, is_hidden').eq('role', role.name).is('user_id', null),
      db.from('data_scope_config').select('mode, include_values, exclude_values').eq('role', role.name).is('user_id', null).eq('resource', 'operational_cost_submissions').eq('scope_type', 'organization').eq('scope_value', '__policy__'),
      db.from('page_role_configs').select('page_slug').contains('roles', [role.name]),
      db.rpc('workspace_check_super_admin'),
    ]).then(results => {
      if (cancelled) return;
      const failed = results.find(result => result.error);
      if (failed) { setBaselineError('Access defaults could not be loaded. Refresh before saving.'); return; }
      setAllowCostScope(results[4].data === true);
      const scope = results[2].data?.[0];
      setBaseline({ tab_rules: results[0].data ?? [], column_rules: results[1].data ?? [], ...(scope && results[4].data === true ? { cost_scope: { mode: scope.mode, include_values: scope.include_values ?? [], exclude_values: scope.exclude_values ?? [] } } : {}) });
      setPages((results[3].data ?? []).map(row => row.page_slug).filter(slug => !slug.includes(':')));
    }).catch(() => { if (!cancelled) setBaselineError('Access defaults could not be loaded. Refresh before saving.'); }).finally(() => { if (!cancelled) setBaselineLoading(false); });
    return () => { cancelled = true; };
  }, [open, role?.id, role?.name]);
  const [formData, setFormData] = useState({
    display_name: '',
    description: '',
    is_active: true
  });

  const [selectedPermissions, setSelectedPermissions] = useState<{ resource: ResourceType; action: ActionType }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const pageGroups = useMemo(() => getGrantablePageGroups(), []);
  const [pageSearch, setPageSearch] = useState('');
  const visiblePageGroups = useMemo(() => {
    const q = pageSearch.trim().toLowerCase();
    if (!q) return pageGroups;
    return pageGroups
      .map(([group, groupPages]) => [
        group,
        group.toLowerCase().includes(q)
          ? groupPages
          : groupPages.filter(page => page.label.toLowerCase().includes(q) || page.slug.toLowerCase().includes(q)),
      ] as [string, typeof groupPages])
      .filter(([, groupPages]) => groupPages.length > 0);
  }, [pageGroups, pageSearch]);

  useEffect(() => {
    if (role) {
      setPageSearch('');
      setFormData({
        display_name: role.display_name,
        description: role.description || '',
        is_active: role.is_active
      });

      // Set existing permissions
      const permissions = role.permissions.map(p => ({
        resource: p.resource as ResourceType,
        action: p.action as ActionType
      }));
      setSelectedPermissions(permissions);
    }
  }, [role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!role || baselineLoading || baselineError) return;

    setSubmitting(true);
    try {
      const ok = await onUpdateRole(role.id, {
        ...formData,
        ...baseline,
        page_slugs: pages,
        permissions: withPageDefaultPermissions(selectedPermissions, pages) as typeof selectedPermissions
      });
      if (ok) {
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdatePermissions = async (roleId: string, permissions: { resource: ResourceType; action: ActionType }[]) => {
    if (baselineLoading || baselineError) return false;
    const merged = withPageDefaultPermissions(permissions, pages) as typeof permissions;
    setSelectedPermissions(merged);
    const ok = await onUpdateRole(roleId, {
      ...formData,
      ...baseline,
      page_slugs: pages,
      permissions: merged
    });
    return ok;
  };

  if (!role) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Role: {role.display_name}</DialogTitle>
          <DialogDescription>
            Role defaults live here: pages, tabs, and action permissions for this role.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2 mb-1">
          Permissions, page defaults, and tab/column rules for this role save through Role Management only.
        </p>

        {baselineError && <p role="alert" className="text-sm text-destructive">{baselineError}</p>}
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General Information</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="baseline">Access defaults</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general" className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="is_active"
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                  <Label htmlFor="is_active">Active</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting || baselineLoading || !!baselineError}>
                  {submitting ? 'Updating...' : 'Update Role'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          
          <TabsContent value="baseline" className="space-y-4">
            {baselineLoading ? <p className="text-sm">Loading access defaults…</p> : !baselineError && <>
              <h3 className="font-semibold">Page access</h3>
              <p className="text-sm text-muted-foreground">Selected pages grant this role access in navigation and routes. Each selected page also grants the read permission it needs, so it opens without “Access Denied”. All defaults save together.</p>
              <div className="sticky top-0 z-10 bg-background py-2">
                <Input
                  type="search"
                  placeholder="Search pages by name, slug, or group…"
                  value={pageSearch}
                  onChange={e => setPageSearch(e.target.value)}
                  data-testid="input-role-page-search"
                />
              </div>
              <div className="space-y-3">
                {visiblePageGroups.length === 0 && (
                  <p className="text-sm text-muted-foreground">No pages match “{pageSearch}”.</p>
                )}
                {visiblePageGroups.map(([group, groupPages]) => (
                  <Card key={group}>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base">{group}</CardTitle>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const allOn = groupPages.every(page => pages.includes(page.slug));
                            setPages(current => {
                              if (allOn) return current.filter(slug => !groupPages.some(page => page.slug === slug));
                              const next = new Set(current);
                              groupPages.forEach(page => next.add(page.slug));
                              return Array.from(next);
                            });
                          }}
                        >
                          Toggle group
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0">
                      {groupPages.map(page => (
                        <label key={page.slug} className="flex items-center gap-2 text-sm cursor-pointer">
                          <Checkbox
                            checked={pages.includes(page.slug)}
                            onCheckedChange={checked => setPages(current => checked ? [...current, page.slug] : current.filter(slug => slug !== page.slug))}
                          />
                          <span>{page.label}</span>
                          <span className="text-xs text-muted-foreground">{page.slug}</span>
                        </label>
                      ))}
                    </CardContent>
                  </Card>
                ))}
              </div>
              <RoleBaselineAccessEditor value={baseline} onChange={setBaseline} allowCostScope={allowCostScope} />
              <Button type="button" disabled={submitting || isLoading} onClick={() => { void handleSubmit({ preventDefault() {} } as React.FormEvent); }}>{submitting ? 'Saving…' : 'Save role and access defaults'}</Button>
            </>}
          </TabsContent>
          <TabsContent value="permissions">
            <PermissionManager
              role={role}
              onUpdatePermissions={handleUpdatePermissions}
              isLoading={isLoading}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};