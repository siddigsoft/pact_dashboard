import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CreateRoleRequest, RESOURCES, ACTIONS, ResourceType, ActionType } from '@/types/roles';

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateRole: (roleData: CreateRoleRequest) => Promise<boolean>;
  isLoading: boolean;
}


export const CreateRoleDialog: React.FC<CreateRoleDialogProps> = ({
  open,
  onOpenChange,
  onCreateRole,
  isLoading
}) => {
  const [formData, setFormData] = useState<CreateRoleRequest>({
    name: '',
    display_name: '',
    description: '',
    permissions: []
  });

  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const handlePermissionChange = (resource: ResourceType, action: ActionType, checked: boolean) => {
    const key = `${resource}:${action}`;
    setSelectedPermissions(prev => ({
      ...prev,
      [key]: !!checked
    }));
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

    const permissions = Object.entries(selectedPermissions)
      .filter(([, selected]) => selected)
      .map(([key]) => {
        const [resource, action] = key.split(':');
        return { resource: resource as ResourceType, action: action as ActionType };
      });

    const payload: CreateRoleRequest = {
      name: trimmedName,
      display_name: trimmedDisplay,
      description: formData.description?.trim() || '',
      permissions
    };

    try {
      const ok = await onCreateRole(payload);
      if (ok) {
        onOpenChange(false);
        setFormData({ name: '', display_name: '', description: '', permissions: [] });
        setSelectedPermissions({});
      } else {
        setError('Failed to create role. You might lack permission or the role name already exists.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected error while creating role.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Role</DialogTitle>
          <DialogDescription>
            Define a new role and assign permissions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Role Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., custom_manager"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="e.g., Custom Manager"
                required
              />
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
            />
          </div>

          <div className="space-y-4">
            <Label>Permissions</Label>
            <div className="grid gap-4">
              {RESOURCES.map(resource => (
                <Card key={resource}>
                  <CardHeader className="py-3">
                    <CardTitle className="text-base capitalize">{resource}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {ACTIONS.map(action => (
                        <div key={`${resource}:${action}`} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${resource}:${action}`}
                            checked={selectedPermissions[`${resource}:${action}`] || false}
                            onCheckedChange={(checked) => 
                              handlePermissionChange(resource, action, checked as boolean)
                            }
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
              ))}
            </div>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}