
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import { useAuthorization } from '@/hooks/use-authorization';
import { ResourceType, ActionType } from '@/types/roles';

interface FieldTeamMapPermissionsProps {
  resource?: ResourceType;
  action?: ActionType;
  requiredAction?: string; // deprecated; maps to resource/action for backward-compat
  children: React.ReactNode;
}

/**
 * A component that checks if the current user has permission to perform a specific action.
 * If they don't have permission, it displays a "No Permission" message.
 */
const FieldTeamMapPermissions: React.FC<FieldTeamMapPermissionsProps> = ({ 
  resource,
  action,
  requiredAction,
  children 
}) => {
  const { checkPermission, hasAnyRole } = useAuthorization();

  const mapLegacy = (legacy?: string): { resource?: ResourceType; action?: ActionType } => {
    const table: Record<string, { resource: ResourceType; action: ActionType }> = {
      edit_mmp: { resource: 'mmp', action: 'update' },
      verify_permits: { resource: 'mmp', action: 'approve' },
      assign_site_visits: { resource: 'site_visits', action: 'assign' },
      view_all_site_visits: { resource: 'site_visits', action: 'read' },
      upload_mmp: { resource: 'mmp', action: 'create' },
      approve_mmp: { resource: 'mmp', action: 'approve' },
    };
    return legacy && table[legacy] ? table[legacy] : {};
  };

  const res = resource ?? mapLegacy(requiredAction).resource;
  const act = action ?? mapLegacy(requiredAction).action;

  const canAccess = (res && act ? checkPermission(res, act) : false) ||
                    hasAnyRole(['admin', 'ict', 'fom', 'supervisor']);
  
  const label = requiredAction
    ? requiredAction.replace('_', ' ')
    : (res && act ? `${act} ${res}`.replace('_', ' ') : 'access this feature');

  if (!canAccess) {
    return (
      <Card className="border-dashed border-red-300">
        <CardContent className="p-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <ShieldAlert className="h-10 w-10 text-red-500" />
            <h3 className="text-lg font-medium">Access Denied</h3>
            <p className="text-muted-foreground">
              You don't have permission to {label}.
              Please contact your administrator for access.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return <>{children}</>;
};

export default FieldTeamMapPermissions;
