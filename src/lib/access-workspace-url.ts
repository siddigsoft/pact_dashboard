export function accessWorkspaceUrl({ userId, pageSlug }: { userId?: string; pageSlug?: string } = {}): string {
  const params = new URLSearchParams({ tab: 'user-access' });
  if (userId) params.set('accessUser', userId);
  if (pageSlug) params.set('accessPage', pageSlug);
  return `/super-admin-hub?${params}`;
}
