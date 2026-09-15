import { useEffect, useMemo, useState, type ComponentType, type FC } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateRoleRequest, RESOURCES, ACTIONS, ResourceType, ActionType, RoleWithPermissions } from '@/types/roles';
import { roleTemplates, permissionPresets, getCategoryColor, RoleTemplate } from '@/constants/roleTemplates';
import { PAGE_DEFS } from '@/pages/PageAccessControl';
import {
  Briefcase, MapPin, Wallet, BarChart3, Globe, Users, FileSearch, Wrench,
  Wand2, ListChecks, Star, Info, ChevronLeft, ChevronRight, Check,
} from 'lucide-react';

type WizardStep = 'template' | 'details' | 'pages' | 'actions' | 'assign' | 'review';

const STEPS: Array<{ id: WizardStep; label: string }> = [
  { id: 'template', label: 'Template' },
  { id: 'details', label: 'Role details' },
  { id: 'pages', label: 'Page access' },
  { id: 'actions', label: 'Actions' },
  { id: 'assign', label: 'Assign users' },
  { id: 'review', label: 'Review & save' },
];

interface AssignableUser {
  id: string;
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
}

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateRole: (roleData: CreateRoleRequest) => Promise<boolean>;
  isLoading: boolean;
  cloneSourceRole?: RoleWithPermissions | null;
  users?: AssignableUser[];
}

const iconMap: Record<string, ComponentType<{ className?: string }>> = {
  Briefcase, MapPin, Wallet, BarChart3, Globe, Users, FileSearch, Wrench,
};

export const CreateRoleDialog: FC<CreateRoleDialogProps> = ({
  open,
  onOpenChange,
  onCreateRole,
  isLoading,
  cloneSourceRole,
  users = [],
}) => {
  const [step, setStep] = useState<WizardStep>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate | null>(null);
  const [formData, setFormData] = useState({ name: '', display_name: '', description: '' });
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});
  const [selectedPages, setSelectedPages] = useState<Record<string, boolean>>({});
  const [selectedUsers, setSelectedUsers] = useState<Record<string, boolean>>({});
  const [setAsPrimary, setSetAsPrimary] = useState(false);
  const [userFilter, setUserFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pageGroups = useMemo(() => {
    const map = new Map<string, typeof PAGE_DEFS>();
    for (const page of PAGE_DEFS) {
      const list = map.get(page.group) ?? [];
      list.push(page);
      map.set(page.group, list);
    }
    return Array.from(map.entries());
  }, []);

  useEffect(() => {
    if (cloneSourceRole && open) {
      setFormData({
        name: `${cloneSourceRole.display_name} Copy`,
        display_name: `${cloneSourceRole.display_name} (Copy)`,
        description: cloneSourceRole.description || '',
      });
      const permissions: Record<string, boolean> = {};
      cloneSourceRole.permissions.forEach((perm) => {
        permissions[`${perm.resource}:${perm.action}`] = true;
      });
      setSelectedPermissions(permissions);
      setSelectedPages({});
      setSelectedUsers({});
      setStep('details');
      setSelectedTemplate(null);
    } else if (!open) {
      setStep('template');
    }
  }, [cloneSourceRole, open]);

  const resetDialogState = () => {
    setStep('template');
    setSelectedTemplate(null);
    setFormData({ name: '', display_name: '', description: '' });
    setSelectedPermissions({});
    setSelectedPages({});
    setSelectedUsers({});
    setSetAsPrimary(false);
    setUserFilter('');
    setError(null);
  };

  const handleTemplateSelect = (template: RoleTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      display_name: template.displayName,
      description: template.description,
    });
    const permissions: Record<string, boolean> = {};
    template.permissions.forEach((perm) => {
      permissions[`${perm.resource}:${perm.action}`] = true;
    });
    setSelectedPermissions(permissions);
    setStep('details');
  };

  const handleStartFromScratch = () => {
    setSelectedTemplate(null);
    setFormData({ name: '', display_name: '', description: '' });
    setSelectedPermissions({});
    setSelectedPages({});
    setSelectedUsers({});
    setStep('details');
  };

  const permissionList = useMemo(
    () => Object.entries(selectedPermissions)
      .filter(([, selected]) => selected)
      .map(([key]) => {
        const [resource, action] = key.split(':');
        return { resource: resource as ResourceType, action: action as ActionType };
      }),
    [selectedPermissions],
  );

  const pageSlugList = useMemo(
    () => Object.entries(selectedPages).filter(([, v]) => v).map(([slug]) => slug),
    [selectedPages],
  );

  const assignUserIds = useMemo(
    () => Object.entries(selectedUsers).filter(([, v]) => v).map(([id]) => id),
    [selectedUsers],
  );

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.full_name ?? '').toLowerCase().includes(q)
      || (u.email ?? '').toLowerCase().includes(q)
      || (u.role ?? '').toLowerCase().includes(q),
    );
  }, [users, userFilter]);

  const validateDetails = (): string | null => {
    const trimmedName = formData.name.trim();
    const trimmedDisplay = formData.display_name.trim();
    if (!trimmedName || !trimmedDisplay) return 'Role name and display name are required.';
    const hasLowercase = /[a-z]/.test(trimmedName);
    const hasUnderscore = /_/.test(trimmedName);
    const isAllUppercase = trimmedName === trimmedName.toUpperCase();
    const isTitleCase = trimmedName.split(' ').every((word) =>
      word.length > 0 && word[0] === word[0].toUpperCase(),
    );
    if (hasLowercase && hasUnderscore) {
      return 'Role name cannot use snake_case. Use Title Case or UPPERCASE.';
    }
    if (!isAllUppercase && !isTitleCase) {
      return 'Role name must use Title Case or be UPPERCASE.';
    }
    return null;
  };

  const goNext = () => {
    setError(null);
    if (step === 'details') {
      const err = validateDetails();
      if (err) { setError(err); return; }
      setStep('pages');
      return;
    }
    if (step === 'pages') { setStep('actions'); return; }
    if (step === 'actions') {
      if (permissionList.length === 0) {
        setError('Select at least one action permission.');
        return;
      }
      setStep('assign');
      return;
    }
    if (step === 'assign') { setStep('review'); return; }
  };

  const goBack = () => {
    setError(null);
    const order: WizardStep[] = ['template', 'details', 'pages', 'actions', 'assign', 'review'];
    const idx = order.indexOf(step);
    if (idx > 0) setStep(order[idx - 1]);
  };

  const handleSave = async () => {
    setError(null);
    const detailsError = validateDetails();
    if (detailsError) { setError(detailsError); setStep('details'); return; }
    if (permissionList.length === 0) {
      setError('Select at least one action permission.');
      setStep('actions');
      return;
    }

    const payload: CreateRoleRequest = {
      name: formData.name.trim(),
      display_name: formData.display_name.trim(),
      description: formData.description.trim(),
      permissions: permissionList,
      page_slugs: pageSlugList,
      assign_user_ids: assignUserIds,
      set_as_primary: setAsPrimary,
      reason: 'Created via staged Role Management wizard',
    };

    try {
      const ok = await onCreateRole(payload);
      if (ok) {
        resetDialogState();
        onOpenChange(false);
      } else {
        setError('Failed to save role. Check permissions or whether the role name already exists.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error while saving role.');
    }
  };

  const handleDialogClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setTimeout(resetDialogState, 200);
  };

  const recommendedTemplates = roleTemplates.filter((t) => t.recommended);
  const otherTemplates = roleTemplates.filter((t) => !t.recommended);
  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Create Custom Role
          </DialogTitle>
          <DialogDescription>
            Role details → Page access → Action permissions → Assign users → Review and save
          </DialogDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {STEPS.map((s, i) => (
              <Badge
                key={s.id}
                variant={i === stepIndex ? 'default' : i < stepIndex ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {i < stepIndex ? <Check className="h-3 w-3 mr-1" /> : null}
                {i + 1}. {s.label}
              </Badge>
            ))}
          </div>
        </DialogHeader>

        {step === 'template' ? (
          <ScrollArea className="flex-1 min-h-0 pr-4">
            <div className="space-y-6 py-4">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <h3 className="text-lg font-semibold">Recommended Templates</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recommendedTemplates.map((template) => {
                    const Icon = iconMap[template.icon] || Briefcase;
                    return (
                      <Card key={template.id} className="hover-elevate cursor-pointer" onClick={() => handleTemplateSelect(template)}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-md"><Icon className="h-5 w-5 text-primary" /></div>
                            <div>
                              <CardTitle className="text-base">{template.displayName}</CardTitle>
                              <Badge variant="outline" className={`mt-1 text-xs ${getCategoryColor(template.category)}`}>{template.category}</Badge>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{template.description}</CardDescription>
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <ListChecks className="h-3 w-3" />{template.permissions.length} permissions
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">More Templates</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {otherTemplates.map((template) => {
                    const Icon = iconMap[template.icon] || Briefcase;
                    return (
                      <Card key={template.id} className="hover-elevate cursor-pointer" onClick={() => handleTemplateSelect(template)}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-muted rounded-md"><Icon className="h-5 w-5" /></div>
                            <CardTitle className="text-base">{template.displayName}</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription>{template.description}</CardDescription>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
              <Card className="border-dashed hover-elevate cursor-pointer" onClick={handleStartFromScratch}>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Wand2 className="h-10 w-10 text-muted-foreground mb-3" />
                  <h3 className="text-lg font-semibold mb-1">Start from Scratch</h3>
                  <p className="text-sm text-muted-foreground text-center">Skip templates and configure every step</p>
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col">
            <ScrollArea className="flex-1 min-h-0 pr-4">
              <div className="space-y-6 py-4">
                {selectedTemplate && step === 'details' && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Using template <strong>{selectedTemplate.displayName}</strong>. You can customize every following step.
                    </AlertDescription>
                  </Alert>
                )}

                {step === 'details' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Role Name (ID)</Label>
                        <Input id="name" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder='e.g., Project Manager' data-testid="input-role-name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="display_name">Display Name</Label>
                        <Input id="display_name" value={formData.display_name} onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))} placeholder="Friendly label" data-testid="input-role-display-name" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea id="description" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} rows={3} data-testid="textarea-role-description" />
                    </div>
                  </>
                )}

                {step === 'pages' && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Selected pages will include this role in <code>page_role_configs</code> so sidebar and route defaults grant access.
                    </p>
                    {pageGroups.map(([group, pages]) => (
                      <Card key={group}>
                        <CardHeader className="py-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">{group}</CardTitle>
                            <Button type="button" variant="ghost" size="sm" onClick={() => {
                              const next = { ...selectedPages };
                              const allOn = pages.every((p) => next[p.slug]);
                              pages.forEach((p) => { next[p.slug] = !allOn; });
                              setSelectedPages(next);
                            }}>
                              Toggle group
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-0">
                          {pages.map((page) => (
                            <label key={page.slug} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={!!selectedPages[page.slug]}
                                onCheckedChange={(checked) => setSelectedPages((prev) => ({ ...prev, [page.slug]: !!checked }))}
                              />
                              <span>{page.label}</span>
                              <span className="text-xs text-muted-foreground">{page.slug}</span>
                            </label>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {step === 'actions' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {permissionPresets.map((preset) => (
                        <Button key={preset.id} type="button" variant="outline" size="sm" onClick={() => {
                          const next = { ...selectedPermissions };
                          preset.permissions.forEach((perm) => { next[`${perm.resource}:${perm.action}`] = true; });
                          setSelectedPermissions(next);
                        }}>
                          {preset.name}
                        </Button>
                      ))}
                    </div>
                    {RESOURCES.map((resource) => (
                      <Card key={resource}>
                        <CardHeader className="py-3">
                          <CardTitle className="text-base capitalize">{resource.replace('_', ' ')}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-0">
                          {ACTIONS.map((action) => (
                            <label key={`${resource}:${action}`} className="flex items-center gap-2 text-sm cursor-pointer">
                              <Checkbox
                                checked={!!selectedPermissions[`${resource}:${action}`]}
                                onCheckedChange={(checked) => setSelectedPermissions((prev) => ({
                                  ...prev,
                                  [`${resource}:${action}`]: !!checked,
                                }))}
                                data-testid={`permission-${resource}-${action}`}
                              />
                              <span className="capitalize">{action}</span>
                            </label>
                          ))}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {step === 'assign' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Checkbox id="set-primary" checked={setAsPrimary} onCheckedChange={(c) => setSetAsPrimary(!!c)} />
                      <Label htmlFor="set-primary">Set as primary role on profiles.role for assigned users</Label>
                    </div>
                    <Input placeholder="Filter users…" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
                    <div className="space-y-2 max-h-[50vh] overflow-auto border rounded-md p-3">
                      {filteredUsers.length === 0 && (
                        <p className="text-sm text-muted-foreground">No users available to assign.</p>
                      )}
                      {filteredUsers.map((user) => (
                        <label key={user.id} className="flex items-center gap-2 text-sm cursor-pointer py-1">
                          <Checkbox
                            checked={!!selectedUsers[user.id]}
                            onCheckedChange={(checked) => setSelectedUsers((prev) => ({ ...prev, [user.id]: !!checked }))}
                          />
                          <span className="font-medium">{user.full_name || 'Unnamed'}</span>
                          <span className="text-muted-foreground">{user.email}</span>
                          {user.role && <Badge variant="outline" className="text-xs">{user.role}</Badge>}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {step === 'review' && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader><CardTitle className="text-base">Role</CardTitle></CardHeader>
                      <CardContent className="text-sm space-y-1">
                        <div><strong>Name:</strong> {formData.name.trim()}</div>
                        <div><strong>Display:</strong> {formData.display_name.trim()}</div>
                        <div><strong>Description:</strong> {formData.description.trim() || '—'}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-base">Page access ({pageSlugList.length})</CardTitle></CardHeader>
                      <CardContent className="text-sm flex flex-wrap gap-1">
                        {pageSlugList.length === 0 ? 'None selected' : pageSlugList.map((slug) => (
                          <Badge key={slug} variant="secondary">{slug}</Badge>
                        ))}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-base">Actions ({permissionList.length})</CardTitle></CardHeader>
                      <CardContent className="text-sm flex flex-wrap gap-1">
                        {permissionList.map((p) => (
                          <Badge key={`${p.resource}:${p.action}`} variant="outline">{p.resource}:{p.action}</Badge>
                        ))}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-base">Users ({assignUserIds.length})</CardTitle></CardHeader>
                      <CardContent className="text-sm">
                        {assignUserIds.length === 0 ? 'No users assigned in this save.' : (
                          <ul className="list-disc pl-5">
                            {assignUserIds.map((id) => {
                              const u = users.find((x) => x.id === id);
                              return <li key={id}>{u?.full_name || u?.email || id}</li>;
                            })}
                          </ul>
                        )}
                        <p className="text-muted-foreground mt-2">
                          Primary role update: {setAsPrimary ? 'yes' : 'no'}
                        </p>
                        <p className="text-muted-foreground">
                          Save runs as one transactional RPC (<code>upsert_role_access</code>) with a single audit row.
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4 pt-4 border-t">
              <div className="flex justify-between w-full gap-2">
                <Button type="button" variant="outline" onClick={goBack} className="min-h-11">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Back
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => handleDialogClose(false)} className="min-h-11">Cancel</Button>
                  {step !== 'review' ? (
                    <Button type="button" onClick={goNext} className="min-h-11" data-testid="button-role-wizard-next">
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button type="button" disabled={isLoading} onClick={handleSave} className="min-h-11" data-testid="button-create-role-submit">
                      {isLoading ? 'Saving…' : 'Save role'}
                    </Button>
                  )}
                </div>
              </div>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
