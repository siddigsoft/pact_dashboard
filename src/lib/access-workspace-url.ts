/** Canonical access admin surface is Roles (User Access page removed). */
export function accessWorkspaceUrl(_opts: { userId?: string; pageSlug?: string } = {}): string {
  return '/super-admin-hub?tab=roles';
}
