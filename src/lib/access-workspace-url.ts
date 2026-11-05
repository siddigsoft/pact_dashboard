/** Canonical access admin surface is Role Management (baselines only). */
export function accessWorkspaceUrl(_opts: { userId?: string; pageSlug?: string } = {}): string {
  return '/role-management';
}
