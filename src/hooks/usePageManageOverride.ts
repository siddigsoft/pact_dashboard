import { useAppContext } from '@/context/AppContext';
import { useCurrentUserAccessManifest } from '@/hooks/useCurrentUserAccessManifest';
import { evaluateManifestPageAccess, manifestHasPermission } from '@/lib/current-user-access';
import { getRegisteredPageActions } from '@/lib/access-target-registry';
import { normalizeRoleCode } from '@/lib/page-roles';
import { DENIED_PERMS, FULL_PERMS, resolveTypedPagePermissions, type GranularPerms } from '@/lib/pagePermissionsResolve';

export type PagePermissions = GranularPerms & { isLoading: boolean };

/** Resolves from shared signed-in inputs. Legacy skip cannot bypass denials. */
export function usePagePermissions(pageSlug: string, _skip = false): PagePermissions {
  const { currentUser } = useAppContext();
  const query = useCurrentUserAccessManifest(!!currentUser?.id);
  const manifest = query.data;
  if (!manifest || manifest.user_id !== currentUser?.id || query.isError) {
    return { ...DENIED_PERMS, isLoading: !!currentUser?.id && query.isPending };
  }
  if (manifest.roles.some(role => normalizeRoleCode(role) === 'superAdmin')) {
    return { ...FULL_PERMS, isLoading: false };
  }
  const allowed = evaluateManifestPageAccess(manifest, pageSlug).allowed;
  const override = manifest.page_overrides[pageSlug];
  const activeOverride = override && (!override.expires_at || new Date(override.expires_at).getTime() > Date.now());
  const typed = resolveTypedPagePermissions({ pageOverride: activeOverride ? override : null, isSuperAdmin: false });
  const actions = getRegisteredPageActions(pageSlug);
  const hasAction = (action: string) => actions.some(candidate => candidate.action === action &&
    manifestHasPermission(manifest, candidate.resource, candidate.action));
  const canWrite = allowed && hasAction('update') && (!typed.hasOverride || typed.canWrite);
  const canCreate = allowed && hasAction('create') && (!typed.hasOverride || typed.canCreate);
  const canDelete = allowed && hasAction('delete') && (!typed.hasOverride || typed.canDelete);
  return {
    canRead: allowed && (!typed.hasOverride || typed.canRead),
    canWrite, canCreate, canDelete, canManage: canWrite || canCreate || canDelete,
    hasOverride: typed.hasOverride, isBlocked: !allowed || typed.isBlocked, isLoading: false,
  };
}

export function usePageManageOverride(pageSlug: string, skip = false): boolean {
  const perms = usePagePermissions(pageSlug, skip);
  return !perms.isBlocked && perms.canManage;
}
