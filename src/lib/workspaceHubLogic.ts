export type SecurityLevel = 'public' | 'internal' | 'confidential' | 'restricted' | 'top_secret';

export const CLEARANCE_ORDER: Record<SecurityLevel, number> = {
  public: 0, internal: 1, confidential: 2, restricted: 3, top_secret: 4,
};

export const VIRTUAL_VIEWS = new Set([
  '__recent__', '__pinned__', '__mine__', '__all__', '__task_docs__', '__trash__',
]);

export const VIRTUAL_FOLDER_NAMES: Record<string, string> = {
  '__pinned__': 'Pinned Files',
  '__recent__': 'Recent Files',
  '__mine__': 'My Files',
  '__task_docs__': 'Task Documents',
  '__all__': 'All Files',
  '__trash__': 'Recycle Bin',
};

export function fmtSize(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function meetsClearance(itemLevel: SecurityLevel, userClearance: SecurityLevel): boolean {
  return CLEARANCE_ORDER[itemLevel] <= CLEARANCE_ORDER[userClearance];
}

export function collectDescendantFolderIds(
  selectedFolderId: string | null,
  childMap: Record<string, { id: string }[]>,
): Set<string> {
  if (!selectedFolderId || VIRTUAL_VIEWS.has(selectedFolderId)) return new Set();
  const result = new Set<string>();
  const queue = [selectedFolderId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.add(id);
    for (const child of (childMap[id] ?? [])) queue.push(child.id);
  }
  return result;
}

export interface WorkspaceFileLike {
  id: string;
  folder_id: string | null;
  name: string;
  description: string | null;
  file_size: number;
  mime_type: string | null;
  extension: string | null;
  security_level: SecurityLevel;
  tags: string[];
  created_by: string | null;
  is_pinned: boolean;
  updated_at: string;
  _uploaderName?: string;
}

export interface WorkspaceFolderLike {
  id: string;
  created_by: string | null;
  security_level: SecurityLevel;
  parent_folder_id?: string | null;
}

export function filterVisibleFolders<T extends WorkspaceFolderLike>(
  folders: T[],
  opts: {
    isSuperAdmin: boolean;
    userId: string;
    effectiveClearance: SecurityLevel;
    allDeniedFolderIds: Set<string>;
    grantedFolderIds: Set<string>;
  },
): T[] {
  return folders.filter(f => {
    if (opts.allDeniedFolderIds.has(f.id)) return false;
    return opts.isSuperAdmin
      || f.created_by === opts.userId
      || meetsClearance(f.security_level, opts.effectiveClearance)
      || opts.grantedFolderIds.has(f.id);
  });
}

export function matchesTypeFilter(
  file: Pick<WorkspaceFileLike, 'mime_type' | 'extension'>,
  typeFilter: string,
): boolean {
  if (typeFilter === 'all') return true;
  const mime = file.mime_type ?? '';
  const ext = (file.extension ?? '').toLowerCase();
  if (typeFilter === 'image') return mime.startsWith('image/');
  if (typeFilter === 'pdf') return mime === 'application/pdf' || ext === 'pdf';
  if (typeFilter === 'excel') return mime.includes('spreadsheet') || mime.includes('excel') || ['xlsx', 'xls', 'csv'].includes(ext);
  if (typeFilter === 'word') return mime.includes('word') || mime.includes('document') || ['docx', 'doc'].includes(ext);
  if (typeFilter === 'zip') return mime.includes('zip') || mime.includes('compressed') || ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);
  return !mime.startsWith('image/')
    && mime !== 'application/pdf'
    && !mime.includes('spreadsheet')
    && !mime.includes('excel')
    && !mime.includes('word')
    && !mime.includes('document')
    && !mime.includes('zip')
    && !['pdf', 'xlsx', 'xls', 'csv', 'docx', 'doc', 'zip', 'rar', '7z', 'tar', 'gz'].includes(ext);
}

export function computeWorkspaceStats(
  files: Array<Pick<WorkspaceFileLike, 'folder_id' | 'file_size' | 'security_level' | 'is_pinned' | 'created_by'>>,
  userId: string,
  lockedFolderIdSet: Set<string>,
) {
  const visibleFiles = files.filter(f => !f.folder_id || !lockedFolderIdSet.has(f.folder_id));
  const totalSize = visibleFiles.reduce((s, f) => s + f.file_size, 0);
  const byLevel: Record<SecurityLevel, number> = {
    public: 0, internal: 0, confidential: 0, restricted: 0, top_secret: 0,
  };
  visibleFiles.forEach(f => { byLevel[f.security_level]++; });
  return {
    total: visibleFiles.length,
    totalSize,
    byLevel,
    pinned: visibleFiles.filter(f => f.is_pinned).length,
    mine: visibleFiles.filter(f => f.created_by === userId).length,
    root: visibleFiles.filter(f => !f.folder_id).length,
  };
}

export function filterDisplayedFiles<T extends WorkspaceFileLike>(opts: {
  files: T[];
  selectedFolderId: string | null;
  userId: string;
  isSuperAdmin: boolean;
  effectiveClearance: SecurityLevel;
  deniedFileIds: Set<string>;
  grantedFileIds: Set<string>;
  allDeniedFolderIds: Set<string>;
  lockedFolderIdSet: Set<string>;
  descendantFolderIds: Set<string>;
  secFilter: string;
  typeFilter: string;
  searchQuery: string;
  sortBy: string;
}): T[] {
  let files = opts.files;
  const isOwnerOrAdmin = (f: T) => opts.isSuperAdmin || f.created_by === opts.userId;

  files = files.filter(f => !opts.deniedFileIds.has(f.id));
  if (!opts.isSuperAdmin) {
    files = files.filter(f => !f.folder_id || !opts.allDeniedFolderIds.has(f.folder_id));
  }
  files = files.filter(f =>
    isOwnerOrAdmin(f)
    || meetsClearance(f.security_level, opts.effectiveClearance)
    || opts.grantedFileIds.has(f.id),
  );

  if (opts.selectedFolderId === '__pinned__') files = files.filter(f => f.is_pinned);
  else if (opts.selectedFolderId === '__recent__') {
    files = [...files].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 20);
  }
  else if (opts.selectedFolderId === '__mine__') files = files.filter(f => f.created_by === opts.userId);
  else if (opts.selectedFolderId === '__all__') { /* show every visible file */ }
  else if (opts.selectedFolderId) {
    files = opts.searchQuery.trim() && opts.descendantFolderIds.size > 1
      ? files.filter(f => f.folder_id && opts.descendantFolderIds.has(f.folder_id))
      : files.filter(f => f.folder_id === opts.selectedFolderId);
  }
  else files = files.filter(f => !f.folder_id);

  files = files.filter(f => isOwnerOrAdmin(f) || !f.folder_id || !opts.lockedFolderIdSet.has(f.folder_id));
  if (opts.secFilter !== 'all') files = files.filter(f => f.security_level === opts.secFilter);
  if (opts.typeFilter !== 'all') files = files.filter(f => matchesTypeFilter(f, opts.typeFilter));
  if (opts.searchQuery.trim()) {
    const q = opts.searchQuery.toLowerCase();
    files = files.filter(f =>
      f.name.toLowerCase().includes(q)
      || (f.description ?? '').toLowerCase().includes(q)
      || f.tags.some(t => t.toLowerCase().includes(q))
      || (f._uploaderName ?? '').toLowerCase().includes(q),
    );
  }

  return [...files].sort((a, b) => {
    if (opts.sortBy === 'name') return a.name.localeCompare(b.name);
    if (opts.sortBy === 'size') return b.file_size - a.file_size;
    return b.updated_at.localeCompare(a.updated_at);
  });
}

/** Matches WorkspaceHub button gating (UI layer — DB RLS must not contradict). */
export interface WorkspaceActor {
  userId: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

export function canShowNewFolderButton(actor: WorkspaceActor): boolean {
  return actor.isAdmin || actor.isSuperAdmin;
}

export function canShowClearancesButton(actor: WorkspaceActor): boolean {
  return actor.isSuperAdmin;
}

export function canShowAccessManagerButton(actor: WorkspaceActor): boolean {
  return actor.isSuperAdmin;
}

export function canManageWorkspaceItem(
  actor: WorkspaceActor,
  createdBy: string | null,
): boolean {
  return actor.isSuperAdmin || actor.isAdmin || createdBy === actor.userId;
}

export function canRenameWorkspaceFile(
  actor: WorkspaceActor,
  file: { created_by: string | null; folder_id: string | null },
  folders: Array<{ id: string; created_by: string | null }>,
): boolean {
  if (actor.isSuperAdmin) return true;
  if (file.created_by === actor.userId) return true;
  if (file.folder_id) {
    const parent = folders.find(f => f.id === file.folder_id);
    if (parent?.created_by === actor.userId) return true;
  }
  return false;
}

export function canRenameWorkspaceFolder(
  actor: WorkspaceActor,
  folder: { created_by: string | null },
): boolean {
  return actor.isSuperAdmin || folder.created_by === actor.userId;
}

export function canDirectDelete(
  actor: WorkspaceActor,
): boolean {
  return actor.isSuperAdmin;
}

export function canRequestDelete(
  actor: WorkspaceActor,
  createdBy: string | null,
): boolean {
  if (actor.isSuperAdmin) return false; // super admin deletes directly
  return canManageWorkspaceItem(actor, createdBy);
}

export function canApproveDeleteRequest(actor: WorkspaceActor): boolean {
  return actor.isAdmin || actor.isSuperAdmin;
}

export function canSetItemPassword(
  actor: WorkspaceActor,
  createdBy: string | null,
): boolean {
  return actor.isSuperAdmin || createdBy === actor.userId;
}

export function canShareManageAccess(
  actor: WorkspaceActor,
  createdBy: string | null,
  viewerRestricted: boolean,
): boolean {
  if (viewerRestricted && !actor.isSuperAdmin) return false;
  return actor.isAdmin || actor.isSuperAdmin || createdBy === actor.userId;
}

export function shareButtonMode(
  actor: WorkspaceActor,
): 'manage' | 'readonly' | 'hidden' {
  if (actor.isAdmin || actor.isSuperAdmin) return 'manage';
  return 'readonly';
}

/**
 * Policies that must NOT coexist on live DB (permissive OR makes the open one win).
 * Kept as a checklist for audit tests / runbooks.
 */
export const WORKSPACE_POLICY_ANTIPATTERNS = [
  {
    table: 'workspace_access_grants',
    policy: 'workspace_access_grants_read',
    reason: 'SELECT USING (true) opens every grant row to all authenticated users and overrides workspace_access_grants_select',
  },
  {
    table: 'workspace_access_requests',
    policy: 'workspace_access_requests_self',
    reason: 'FOR ALL on own rows lets a requester UPDATE status (self-approve)',
  },
  {
    table: 'workspace_access_grants',
    policy: 'workspace_access_grants_admin',
    reason: "Exact role = 'SuperAdmin' misses live role 'superAdmin'; duplicates workspace_check_super_admin policies",
  },
  {
    table: 'workspace_access_requests',
    policy: 'workspace_access_requests_admin',
    reason: "Exact role = 'SuperAdmin' misses live role 'superAdmin'; duplicates scoped policies",
  },
  {
    table: 'workspace_security_clearances',
    policy: 'Super admins manage clearances',
    reason: "Exact role = 'SuperAdmin' misses live camelCase superAdmin",
  },
] as const;
