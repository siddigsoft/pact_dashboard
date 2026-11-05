/** Canonical IDs win over stale legacy names/IDs. Never grant every project
 * manager access to projects they do not manage. */
export function isAssignedProjectManager(
  team: { projectManagerId?: string; projectManager?: string } | null | undefined,
  user: { id?: string; fullName?: string } | null | undefined,
): boolean {
  if (!team || !user?.id) return false;
  if (team.projectManagerId) return team.projectManagerId === user.id;
  return team.projectManager === user.id || (!!user.fullName && team.projectManager === user.fullName);
}

export function projectTaskUrl(projectId: string, taskId?: string) {
  const params = new URLSearchParams({ tab: 'field_tasks' });
  if (taskId) params.set('task', taskId);
  return `/projects/${encodeURIComponent(projectId)}?${params}`;
}
