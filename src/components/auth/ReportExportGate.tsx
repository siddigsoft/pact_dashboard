import React from 'react';
import { PermissionGuard } from './PermissionGuard';
import { ActionType, ResourceType } from '@/types/roles';

/**
 * Visibility gate for report/download controls.
 *
 * Keep the permission pair next to the visible control so report surfaces
 * cannot accidentally rely on a page-level role check with a different
 * resource/action.
 */
export function ReportExportGate({
  resource,
  action = 'export',
  children,
}: {
  resource: ResourceType;
  action?: ActionType;
  children: React.ReactNode;
}) {
  return (
    <PermissionGuard resource={resource} action={action}>
      {children}
    </PermissionGuard>
  );
}