/**
 * SuperAdminButtonRegistry
 * Embedded inside the Super Admin Hub → Permissions & Audit → "Button Registry" tab.
 *
 * Surfaces the ModuleControlCenter (complete module → page → button/action permission matrix)
 * directly inside the Super Admin Hub so super-admins can see EVERY button in the platform
 * and audit which roles have access.
 *
 * Read-only view here — to toggle role-level permissions go to Role Management.
 * For per-user action overrides go to the Access Manager → Permissions tab.
 */

import { Shield, LayoutGrid, ExternalLink } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { ModuleControlCenter } from '@/components/role-management/ModuleControlCenter';
import { useNavigate } from 'react-router-dom';

export function SuperAdminButtonRegistry() {
  const { isSuperAdmin } = useSuperAdmin();
  const navigate         = useNavigate();

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-4">
            <Shield className="h-16 w-16 text-destructive mx-auto" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground">Only super-admins can view the button registry.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 border border-violet-500/20">
            <LayoutGrid className="h-6 w-6 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Button & Permission Registry</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Every module → page → button across the platform with per-role permission status
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate('/role-management')}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Edit Role Permissions
          </Button>
        </div>
      </div>

      {/* Info strip */}
      <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-emerald-500" />
          <span>Role has this permission</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-muted border" />
          <span>Role does not have this permission</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-red-400" />
          <span>Super Admin only</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="h-3 w-3 rounded-full bg-orange-400" />
          <span>Destructive action</span>
        </div>
        <span className="text-muted-foreground ml-auto text-xs">
          Read-only · Toggle permissions in Role Management
        </span>
      </div>

      {/* The full matrix */}
      <ModuleControlCenter canEdit={false} />
    </div>
  );
}
