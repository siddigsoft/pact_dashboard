/**
 * Typed page permission resolution used by runtime guards.
 * Legacy user_screen_permissions is intentionally excluded (Phase 2 item 4).
 */

export interface PageOverrideSource {
  is_blocked: boolean;
  notes?: string | null;
}

export interface GranularPerms {
  canRead: boolean;
  canWrite: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canManage: boolean;
  hasOverride: boolean;
  isBlocked: boolean;
}

export const DENIED_PERMS: GranularPerms = {
  canRead: false,
  canWrite: false,
  canCreate: false,
  canDelete: false,
  canManage: false,
  hasOverride: false,
  isBlocked: false,
};

export const FULL_PERMS: GranularPerms = {
  canRead: true,
  canWrite: true,
  canCreate: true,
  canDelete: true,
  canManage: true,
  hasOverride: false,
  isBlocked: false,
};

function parseNotes(notes: string | null | undefined): { r: boolean; w: boolean; c: boolean; d: boolean } {
  if (!notes) return { r: true, w: true, c: true, d: true };
  try {
    const parsed = typeof notes === 'string' ? JSON.parse(notes) : notes;
    return {
      r: parsed?.r !== false,
      w: !!parsed?.w,
      c: !!parsed?.c,
      d: !!parsed?.d,
    };
  } catch {
    return { r: true, w: true, c: true, d: true };
  }
}

/**
 * Resolve granular page permissions from typed overrides only.
 * No override → hasOverride=false (caller applies role defaults).
 */
export function resolveTypedPagePermissions(args: {
  isSuperAdmin: boolean;
  pageOverride?: PageOverrideSource | null;
}): GranularPerms {
  if (args.isSuperAdmin) return { ...FULL_PERMS };

  const ov = args.pageOverride;
  if (!ov) return { ...DENIED_PERMS };

  if (ov.is_blocked) {
    return { ...DENIED_PERMS, hasOverride: true, isBlocked: true };
  }

  const p = parseNotes(ov.notes);
  return {
    canRead: p.r,
    canWrite: p.w,
    canCreate: p.c,
    canDelete: p.d,
    canManage: p.w || p.c || p.d,
    hasOverride: true,
    isBlocked: false,
  };
}

/** Map one legacy screen JSON entry into a typed override payload (for tests / tools). */
export function mapLegacyScreenToOverride(screen: {
  screenId?: string;
  isVisible?: boolean;
  permissions?: {
    read?: boolean;
    write?: boolean;
    open?: boolean;
    create?: boolean;
    delete?: boolean;
  };
}): { page_slug: string; is_blocked: boolean; notes: string } | null {
  const slug = (screen.screenId ?? '').trim();
  if (!slug) return null;

  const perms = screen.permissions ?? {};
  const anyGrant = !!(perms.read || perms.write || perms.open || perms.create || perms.delete);
  const isVisible = screen.isVisible !== false;
  const is_blocked = !isVisible || !anyGrant;

  if (isVisible && !anyGrant) return null;

  if (is_blocked) {
    return {
      page_slug: slug,
      is_blocked: true,
      notes: JSON.stringify({ r: false, w: false, c: false, d: false, migrated_from: 'user_screen_permissions' }),
    };
  }

  return {
    page_slug: slug,
    is_blocked: false,
    notes: JSON.stringify({
      r: !!(perms.read || perms.open),
      w: !!perms.write,
      c: !!perms.create,
      d: !!perms.delete,
      migrated_from: 'user_screen_permissions',
    }),
  };
}
