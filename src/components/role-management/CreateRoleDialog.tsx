import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateRoleRequest, RESOURCES, ACTIONS, ResourceType, ActionType, RoleWithPermissions } from '@/types/roles';
import { roleTemplates, permissionPresets, getCategoryColor, RoleTemplate, PermissionPreset } from '@/constants/roleTemplates';
import { 
  Sparkles, 
  Briefcase, 
  MapPin, 
  Wallet, 
  BarChart3, 
  Globe, 
  Users, 
  FileSearch, 
  Wrench,
  Wand2,
  ListChecks,
  Star,
  Info
} from 'lucide-react';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateRole: (roleData: CreateRoleRequest) => Promise<boolean>;
  isLoading: boolean;
  cloneSourceRole?: RoleWithPermissions | null;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Briefcase,
  MapPin,
  Wallet,
  BarChart3,
  Globe,
  Users,
  FileSearch,
  Wrench,
};

export const CreateRoleDialog: React.FC<CreateRoleDialogProps> = ({
  open,
  onOpenChange,
  onCreateRole,
  isLoading,
  cloneSourceRole
}) => {
  const [step, setStep] = useState<'template' | 'customize'>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<RoleTemplate | null>(null);
  const [formData, setFormData] = useState<CreateRoleRequest>({
    name: '',
    display_name: '',
    description: '',
    permissions: []
  });

  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  // Handle clone source role
  React.useEffect(() => {
    if (cloneSourceRole && open) {
      // Pre-fill with cloned role data
      setFormData({
        name: `${cloneSourceRole.display_name} Copy`,
        display_name: `${cloneSourceRole.display_name} (Copy)`,
        description: cloneSourceRole.description || '',
        permissions: cloneSourceRole.permissions.map(p => ({ 
          resource: p.resource as ResourceType, 
          action: p.action as ActionType 
        }))
      });
      
      const permissions: Record<string, boolean> = {};
      cloneSourceRole.permissions.forEach(perm => {
        permissions[`${perm.resource}:${perm.action}`] = true;
      });
      setSelectedPermissions(permissions);
      setStep('customize');
      setSelectedTemplate(null);
    } else if (!open) {
      // Reset when dialog closes
      setStep('template');
    }
  }, [cloneSourceRole, open]);

  const handleTemplateSelect = (template: RoleTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      display_name: template.displayName,
      description: template.description,
      permissions: template.permissions
    });
    
    const permissions: Record<string, boolean> = {};
    template.permissions.forEach(perm => {
      permissions[`${perm.resource}:${perm.action}`] = true;
    });
    setSelectedPermissions(permissions);
    setStep('customize');
  };

  const handlePresetApply = (preset: PermissionPreset) => {
    const newPermissions = { ...selectedPermissions };
    preset.permissions.forEach(perm => {
      newPermissions[`${perm.resource}:${perm.action}`] = true;
    });
    setSelectedPermissions(newPermissions);
  };

  const handlePermissionChange = (resource: ResourceType, action: ActionType, checked: boolean) => {
    const key = `${resource}:${action}`;
    setSelectedPermissions(prev => ({
      ...prev,
      [key]: !!checked
    }));
  };

  const handleStartFromScratch = () => {
    setSelectedTemplate(null);
    setFormData({
      name: '',
      display_name: '',
      description: '',
      permissions: []
    });
    setSelectedPermissions({});
    setStep('customize');
  };

  const handleSelectAllForResource = (resource: ResourceType) => {
    const newPermissions = { ...selectedPermissions };
    ACTIONS.forEach(action => {
      newPermissions[`${resource}:${action}`] = true;
    });
    setSelectedPermissions(newPermissions);
  };

  const handleClearAllForResource = (resource: ResourceType) => {
    const newPermissions = { ...selectedPermissions };
    ACTIONS.forEach(action => {
      newPermissions[`${resource}:${action}`] = false;
    });
    setSelectedPermissions(newPermissions);
  };

  const getPermissionCount = () => {
    return Object.values(selectedPermissions).filter(Boolean).length;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = formData.name.trim();
    const trimmedDisplay = formData.display_name.trim();
    if (!trimmedName || !trimmedDisplay) {
      setError('Role name and display name are required.');
      return;
    }

    // Validate role name format (must be Title Case or UPPERCASE)
    const hasLowercase = /[a-z]/.test(trimmedName);
    const hasUnderscore = /_/.test(trimmedName);
    const isAllUppercase = trimmedName === trimmedName.toUpperCase();
    const isTitleCase = trimmedName.split(' ').every(word => 
      word.length > 0 && word[0] === word[0].toUpperCase()
    );

    if (hasLowercase && hasUnderscore) {
      setError('Role name cannot use snake_case (lowercase with underscores). Use Title Case (e.g., "Project Manager") or UPPERCASE instead.');
      return;
    }

    if (!isAllUppercase && !isTitleCase) {
      setError('Role name must use Title Case (e.g., "Project Manager") or be UPPERCASE.');
      return;
    }

    const permissions = Object.entries(selectedPermissions)
      .filter(([, selected]) => selected)
      .map(([key]) => {
        const [resource, action] = key.split(':');
        return { resource: resource as ResourceType, action: action as ActionType };
      });

    if (permissions.length === 0) {
      setError('Please select at least one permission for this role.');
      return;
    }

    const payload: CreateRoleRequest = {
      name: trimmedName,
      display_name: trimmedDisplay,
      description: formData.description?.trim() || '',
      permissions
    };

    try {
      const ok = await onCreateRole(payload);
      if (ok) {
        resetDialogState();
        onOpenChange(false);
      } else {
        setError('Failed to create role. You might lack permission or the role name already exists.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error while creating role.');
    }
  };

  const resetDialogState = () => {
    setStep('template');
    setSelectedTemplate(null);
    setFormData({ name: '', display_name: '', description: '', permissions: [] });
    setSelectedPermissions({});
    setError(null);
  };

  const handleDialogClose = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      // Reset state when closing (with small delay to avoid visual glitch)
      setTimeout(resetDialogState, 200);
    }
  };

  const IconComponent = selectedTemplate?.icon ? iconMap[selectedTemplate.icon] : Briefcase;

  const recommendedTemplates = roleTemplates.filter(t => t.recommended);
  const otherTemplates = roleTemplates.filter(t => !t.recommended);

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Create Custom Role
          </DialogTitle>
          <DialogDescription>
            Choose a template to get started quickly, or build a role from scratch with custom permissions.
          </DialogDescription>
        </DialogHeader>

        {step === 'template' ? (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4">
              {/* Recommended Templates */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  <h3 className="text-lg font-semibold">Recommended Templates</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Popular pre-configured roles for common use cases
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {recommendedTemplates.map(template => {
                    const Icon = iconMap[template.icon] || Briefcase;
                    return (
                      <Card 
                        key={template.id} 
                        className="hover-elevate cursor-pointer transition-all"
                        onClick={() => handleTemplateSelect(template)}
                        data-testid={`template-${template.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-primary/10 rounded-md">
                                <Icon className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{template.displayName}</CardTitle>
                                <Badge variant="outline" className={`mt-1 text-xs ${getCategoryColor(template.category)}`}>
                                  {template.category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription className="text-sm">
                            {template.description}
                          </CardDescription>
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <ListChecks className="h-3 w-3" />
                            {template.permissions.length} permissions included
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Other Templates */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">More Templates</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {otherTemplates.map(template => {
                    const Icon = iconMap[template.icon] || Briefcase;
                    return (
                      <Card 
                        key={template.id} 
                        className="hover-elevate cursor-pointer transition-all"
                        onClick={() => handleTemplateSelect(template)}
                        data-testid={`template-${template.id}`}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-muted rounded-md">
                                <Icon className="h-5 w-5" />
                              </div>
                              <div>
                                <CardTitle className="text-base">{template.displayName}</CardTitle>
                                <Badge variant="outline" className={`mt-1 text-xs ${getCategoryColor(template.category)}`}>
                                  {template.category}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <CardDescription className="text-sm">
                            {template.description}
                          </CardDescription>
                          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                            <ListChecks className="h-3 w-3" />
                            {template.permissions.length} permissions included
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Start from Scratch */}
              <div className="pt-4 border-t">
                <Card className="border-dashed hover-elevate cursor-pointer" onClick={handleStartFromScratch}>
                  <CardContent className="flex flex-col items-center justify-center py-8">
                    <Sparkles className="h-10 w-10 text-muted-foreground mb-3" />
                    <h3 className="text-lg font-semibold mb-1">Start from Scratch</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      Create a completely custom role with your own permissions
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-4">
                {/* Template Info */}
                {selectedTemplate && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription className="flex items-center justify-between">
                      <span>
                        Using template: <strong>{selectedTemplate.displayName}</strong>. You can customize it below.
                      </span>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm"
                        onClick={() => setStep('template')}
                      >
                        Change Template
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Role Name (ID)</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Project Manager"
                      required
                      data-testid="input-role-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use Title Case (e.g., "Project Manager") or UPPERCASE for system identification
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="display_name">Display Name</Label>
                    <Input
                      id="display_name"
                      value={formData.display_name}
                      onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                      placeholder="e.g., Project Manager"
                      required
                      data-testid="input-role-display-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Friendly name shown to users
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the role and its responsibilities..."
                    rows={3}
                    data-testid="textarea-role-description"
                  />
                </div>

                {/* Permission Presets */}
                <div className="space-y-3">
                  <Label>Quick Permission Presets</Label>
                  <p className="text-sm text-muted-foreground">
                    Apply common permission sets with one click
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {permissionPresets.map(preset => (
                      <Button
                        key={preset.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handlePresetApply(preset)}
                        className="min-h-11"
                        data-testid={`preset-${preset.id}`}
                      >
                        <Wand2 className="h-3 w-3 mr-2" />
                        {preset.name}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Permissions */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Permissions</Label>
                      <p className="text-sm text-muted-foreground">
                        {getPermissionCount()} permission{getPermissionCount() !== 1 ? 's' : ''} selected
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid gap-4">
                    {RESOURCES.map(resource => {
                      const selectedCount = ACTIONS.filter(action => 
                        selectedPermissions[`${resource}:${action}`]
                      ).length;
                      const allSelected = selectedCount === ACTIONS.length;
                      
                      return (
                        <Card key={resource}>
                          <CardHeader className="py-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base capitalize">{resource.replace('_', ' ')}</CardTitle>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {selectedCount}/{ACTIONS.length}
                                </Badge>
                                {allSelected ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleClearAllForResource(resource)}
                                    className="h-7 text-xs"
                                  >
                                    Clear All
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleSelectAllForResource(resource)}
                                    className="h-7 text-xs"
                                  >
                                    Select All
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {ACTIONS.map(action => (
                                <div key={`${resource}:${action}`} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`${resource}:${action}`}
                                    checked={selectedPermissions[`${resource}:${action}`] || false}
                                    onCheckedChange={(checked) => 
                                      handlePermissionChange(resource, action, checked as boolean)
                                    }
                                    data-testid={`permission-${resource}-${action}`}
                                  />
                                  <Label
                                    htmlFor={`${resource}:${action}`}
                                    className="text-sm capitalize cursor-pointer"
                                  >
                                    {action}
                                  </Label>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </div>
            </ScrollArea>

            <DialogFooter className="mt-4 pt-4 border-t">
              <div className="flex justify-between w-full">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setStep('template')}
                  className="min-h-11"
                >
                  Back to Templates
                </Button>
                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => handleDialogClose(false)}
                    className="min-h-11"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading || getPermissionCount() === 0}
                    className="min-h-11"
                    data-testid="button-create-role-submit"
                  >
                    {isLoading ? 'Creating...' : 'Create Role'}
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
