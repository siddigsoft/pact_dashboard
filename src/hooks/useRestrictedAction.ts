import { useToast } from '@/hooks/use-toast';
import { usePagePermissions } from '@/hooks/usePageManageOverride';

type Action = 'write' | 'create' | 'delete';

const ACTION_LABELS: Record<Action, string> = {
  write: 'edit records on',
  create: 'create new items on',
  delete: 'delete items on',
};

/**
 * Returns a `check(action)` guard for write-level actions on a page.
 *
 * Usage:
 *   const { check } = useRestrictedAction('accounting-coa');
 *   // In a button onClick:
 *   if (!check('write')) return;  // shows toast and stops
 *
 * @param pageSlug  - PAGE_DEFS slug for the page (e.g. 'accounting-coa')
 * @param skip      - Pass true when the user already has full rights via their role
 *                    so we avoid an unnecessary DB round-trip.
 */
export function useRestrictedAction(pageSlug: string, skip = false) {
  const { toast } = useToast();
  const perms = usePagePermissions(pageSlug, skip);

  function check(action: Action = 'write'): boolean {
    // Still loading — block optimistically to avoid double-submit
    if (perms.isLoading) return false;

    // Explicitly blocked from the page entirely
    if (perms.isBlocked) {
      toast({
        title: 'Access Restricted',
        description: 'You have been blocked from this page by an administrator.',
        variant: 'destructive',
      });
      return false;
    }

    // No override row at all → role-based access applies → allow
    if (!perms.hasOverride) return true;

    const allowed =
      action === 'write'  ? perms.canWrite  :
      action === 'create' ? perms.canCreate :
      action === 'delete' ? perms.canDelete :
      false;

    if (!allowed) {
      toast({
        title: 'Permission Restricted',
        description: `You don't have permission to ${ACTION_LABELS[action]} this page. Contact your administrator to request access.`,
        variant: 'destructive',
      });
      return false;
    }

    return true;
  }

  return { check, perms };
}
