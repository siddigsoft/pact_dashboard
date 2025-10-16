import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RoleWithPermissions, UpdateRoleRequest, ResourceType, ActionType } from '@/types/roles';
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
  const [formData, setFormData] = useState({
    display_name: '',
    description: '',
    is_active: true
  });

  const [selectedPermissions, setSelectedPermissions] = useState<{ resource: ResourceType; action: ActionType }[]>([]);

  useEffect(() => {
    if (role) {
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
    
    if (!role) return;

    const ok = await onUpdateRole(role.id, {
      ...formData,
      permissions: selectedPermissions
    });
    if (ok) {
      onOpenChange(false);
    }
  };

  const handleUpdatePermissions = async (roleId: string, permissions: { resource: ResourceType; action: ActionType }[]) => {
    setSelectedPermissions(permissions);
    const ok = await onUpdateRole(roleId, {
      ...formData,
      permissions
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
            Update role information and permissions.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general">General Information</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
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
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? 'Updating...' : 'Update Role'}
                </Button>
              </DialogFooter>
            </form>
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