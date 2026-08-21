import { describe, expect, it } from 'vitest';
import {
  CLEARANCE_ORDER,
  VIRTUAL_FOLDER_NAMES,
  collectDescendantFolderIds,
  computeWorkspaceStats,
  filterDisplayedFiles,
  filterVisibleFolders,
  fmtSize,
  matchesTypeFilter,
  meetsClearance,
  type SecurityLevel,
  type WorkspaceFileLike,
} from '../workspaceHubLogic';

const USER = 'user-admin';
const OTHER = 'hope-birungi';

function file(partial: Partial<WorkspaceFileLike> & Pick<WorkspaceFileLike, 'id' | 'name'>): WorkspaceFileLike {
  return {
    folder_id: null,
    description: null,
    file_size: 1024,
    mime_type: 'application/octet-stream',
    extension: null,
    security_level: 'internal',
    tags: [],
    created_by: OTHER,
    is_pinned: false,
    updated_at: '2026-08-15T10:00:00.000Z',
    ...partial,
  };
}

const screenshotFiles: WorkspaceFileLike[] = [
  file({
    id: 'zip',
    name: 'images.zip',
    folder_id: null,
    file_size: 3.9 * 1048576,
    mime_type: 'application/zip',
    extension: 'zip',
    security_level: 'confidential',
    created_by: OTHER,
    updated_at: '2026-08-15T12:00:00.000Z',
  }),
  file({
    id: 'video',
    name: 'IMG_4045.MP4',
    folder_id: null,
    file_size: 3.0 * 1048576,
    mime_type: 'video/mp4',
    extension: 'mp4',
    security_level: 'internal',
    created_by: OTHER,
    is_pinned: true,
    updated_at: '2026-08-15T11:00:00.000Z',
  }),
  file({
    id: 'png',
    name: 'Screenshot_20240807_063056.png',
    folder_id: null,
    file_size: 306 * 1024,
    mime_type: 'image/png',
    extension: 'png',
    security_level: 'internal',
    created_by: USER,
    updated_at: '2026-08-15T10:00:00.000Z',
  }),
];

const emptyFilter = {
  userId: USER,
  isSuperAdmin: false,
  effectiveClearance: 'confidential' as SecurityLevel,
  deniedFileIds: new Set<string>(),
  grantedFileIds: new Set<string>(),
  allDeniedFolderIds: new Set<string>(),
  lockedFolderIdSet: new Set<string>(),
  descendantFolderIds: new Set<string>(),
  secFilter: 'all',
  typeFilter: 'all',
  searchQuery: '',
  sortBy: 'date',
};

describe('fmtSize', () => {
  it('formats the sizes shown in the workspace file list', () => {
    expect(fmtSize(3.9 * 1048576)).toBe('3.9 MB');
    expect(fmtSize(3.0 * 1048576)).toBe('3.0 MB');
    expect(fmtSize(306 * 1024)).toBe('306 KB');
  });

  it('formats the All Files tile total', () => {
    expect(fmtSize(32.3 * 1048576)).toBe('32.3 MB');
  });

  it('formats bytes below 1 KB', () => {
    expect(fmtSize(0)).toBe('0 B');
    expect(fmtSize(512)).toBe('512 B');
  });
});

describe('clearance', () => {
  it('orders public < internal < confidential < restricted < top_secret', () => {
    expect(CLEARANCE_ORDER.public).toBeLessThan(CLEARANCE_ORDER.internal);
    expect(CLEARANCE_ORDER.internal).toBeLessThan(CLEARANCE_ORDER.confidential);
    expect(CLEARANCE_ORDER.confidential).toBeLessThan(CLEARANCE_ORDER.restricted);
    expect(CLEARANCE_ORDER.restricted).toBeLessThan(CLEARANCE_ORDER.top_secret);
  });

  it('lets an internal user see Internal files but not Confidential', () => {
    expect(meetsClearance('internal', 'internal')).toBe(true);
    expect(meetsClearance('confidential', 'internal')).toBe(false);
  });
});

describe('workspace KPI tiles', () => {
  it('counts All Files, Starred, and My Files the way the hub tiles do', () => {
    const extra = file({
      id: 'locked-secret',
      name: 'secret.docx',
      folder_id: 'locked-folder',
      file_size: 1000,
      is_pinned: true,
      created_by: USER,
    });
    const stats = computeWorkspaceStats([...screenshotFiles, extra], USER, new Set(['locked-folder']));

    expect(stats.total).toBe(3);
    expect(stats.pinned).toBe(1);
    expect(stats.mine).toBe(1);
    expect(stats.byLevel.confidential).toBe(1);
    expect(stats.byLevel.internal).toBe(2);
    expect(fmtSize(stats.totalSize)).toBe('7.2 MB');
  });
});

describe('virtual folder views', () => {
  it('names the sidebar shortcuts shown in PACT Workspace', () => {
    expect(VIRTUAL_FOLDER_NAMES.__all__).toBe('All Files');
    expect(VIRTUAL_FOLDER_NAMES.__pinned__).toBe('Pinned Files');
    expect(VIRTUAL_FOLDER_NAMES.__mine__).toBe('My Files');
    expect(VIRTUAL_FOLDER_NAMES.__task_docs__).toBe('Task Documents');
    expect(VIRTUAL_FOLDER_NAMES.__recent__).toBe('Recent Files');
  });

  it('All Files lists every visible file sorted by newest first', () => {
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
    });
    expect(rows.map(f => f.name)).toEqual([
      'images.zip',
      'IMG_4045.MP4',
      'Screenshot_20240807_063056.png',
    ]);
  });

  it('Starred lists only pinned files', () => {
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__pinned__',
    });
    expect(rows.map(f => f.id)).toEqual(['video']);
  });

  it('My Files lists only files uploaded by the current user', () => {
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__mine__',
    });
    expect(rows.map(f => f.id)).toEqual(['png']);
  });

  it('root view shows only files not inside a folder', () => {
    const nested = file({ id: 'nested', name: 'inside.pdf', folder_id: 'documents-2' });
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: [...screenshotFiles, nested],
      selectedFolderId: null,
    });
    expect(rows.every(f => f.folder_id === null)).toBe(true);
    expect(rows).toHaveLength(3);
  });

  it('Recent keeps the 20 most recently updated files', () => {
    const files = Array.from({ length: 25 }, (_, i) => file({
      id: `f${i}`,
      name: `file-${i}.txt`,
      updated_at: `2026-08-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files,
      selectedFolderId: '__recent__',
    });
    expect(rows).toHaveLength(20);
    expect(rows[0].id).toBe('f24');
    expect(rows[19].id).toBe('f5');
  });
});

describe('security and access', () => {
  it('hides confidential files from a user with only internal clearance', () => {
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      effectiveClearance: 'internal',
    });
    expect(rows.map(f => f.id)).toEqual(['video', 'png']);
  });

  it('still shows a confidential file to the person who uploaded it', () => {
    const ownZip = { ...screenshotFiles[0], created_by: USER };
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: [ownZip, screenshotFiles[1]],
      selectedFolderId: '__all__',
      effectiveClearance: 'internal',
    });
    expect(rows.map(f => f.id)).toEqual(['zip', 'video']);
  });

  it('shows a file above clearance when there is an explicit grant', () => {
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      effectiveClearance: 'internal',
      grantedFileIds: new Set(['zip']),
    });
    expect(rows.map(f => f.id)).toContain('zip');
  });

  it('denials win over grants and clearance', () => {
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      deniedFileIds: new Set(['video']),
      grantedFileIds: new Set(['video']),
    });
    expect(rows.map(f => f.id)).not.toContain('video');
  });

  it('hides files in a denied folder unless the viewer is a super admin', () => {
    const nested = file({ id: 'hr', name: 'payroll.xlsx', folder_id: 'hr-folder' });
    const staff = filterDisplayedFiles({
      ...emptyFilter,
      files: [nested],
      selectedFolderId: '__all__',
      allDeniedFolderIds: new Set(['hr-folder']),
    });
    const admin = filterDisplayedFiles({
      ...emptyFilter,
      files: [nested],
      selectedFolderId: '__all__',
      isSuperAdmin: true,
      allDeniedFolderIds: new Set(['hr-folder']),
    });
    expect(staff).toHaveLength(0);
    expect(admin.map(f => f.id)).toEqual(['hr']);
  });

  it('hides files in a locked folder except for the uploader', () => {
    const locked = file({ id: 'locked', name: 'notes.txt', folder_id: 'desktop', created_by: OTHER });
    const ownLocked = file({ id: 'own', name: 'mine.txt', folder_id: 'desktop', created_by: USER });
    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: [locked, ownLocked],
      selectedFolderId: '__all__',
      lockedFolderIdSet: new Set(['desktop']),
    });
    expect(rows.map(f => f.id)).toEqual(['own']);
  });
});

describe('search, type, and sort', () => {
  it('filters by file name, uploader, tags, and description', () => {
    const tagged = file({
      id: 'tagged',
      name: 'brief.pdf',
      description: 'Q3 review',
      tags: ['finance'],
      _uploaderName: 'Hope Birungi',
      updated_at: '2026-08-16T00:00:00.000Z',
    });
    const files = [...screenshotFiles, tagged];

    expect(filterDisplayedFiles({
      ...emptyFilter, files, selectedFolderId: '__all__', searchQuery: 'images',
    }).map(f => f.id)).toEqual(['zip']);

    expect(filterDisplayedFiles({
      ...emptyFilter, files, selectedFolderId: '__all__', searchQuery: 'Hope',
    }).map(f => f.id)).toEqual(['tagged']);

    expect(filterDisplayedFiles({
      ...emptyFilter, files, selectedFolderId: '__all__', searchQuery: 'finance',
    }).map(f => f.id)).toEqual(['tagged']);

    expect(filterDisplayedFiles({
      ...emptyFilter, files, selectedFolderId: '__all__', searchQuery: 'Q3',
    }).map(f => f.id)).toEqual(['tagged']);
  });

  it('filters by type the way the workspace type dropdown does', () => {
    expect(matchesTypeFilter({ mime_type: 'image/png', extension: 'png' }, 'image')).toBe(true);
    expect(matchesTypeFilter({ mime_type: 'application/zip', extension: 'zip' }, 'zip')).toBe(true);
    expect(matchesTypeFilter({ mime_type: 'video/mp4', extension: 'mp4' }, 'other')).toBe(true);
    expect(matchesTypeFilter({ mime_type: 'application/pdf', extension: 'pdf' }, 'other')).toBe(false);

    const rows = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      typeFilter: 'zip',
    });
    expect(rows.map(f => f.id)).toEqual(['zip']);
  });

  it('sorts by name and size', () => {
    const byName = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      sortBy: 'name',
    });
    expect(byName.map(f => f.name)).toEqual([
      'images.zip',
      'IMG_4045.MP4',
      'Screenshot_20240807_063056.png',
    ]);

    const bySize = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      sortBy: 'size',
    });
    expect(bySize.map(f => f.id)).toEqual(['zip', 'video', 'png']);
  });

  it('filters by security label (Confidential vs Internal)', () => {
    const confidential = filterDisplayedFiles({
      ...emptyFilter,
      files: screenshotFiles,
      selectedFolderId: '__all__',
      secFilter: 'confidential',
    });
    expect(confidential.map(f => f.id)).toEqual(['zip']);
  });
});

describe('folders', () => {
  it('hides folders above clearance unless owned, granted, or admin', () => {
    const folders = [
      { id: 'desktop', created_by: OTHER, security_level: 'internal' as const },
      { id: 'hr', created_by: OTHER, security_level: 'restricted' as const },
      { id: 'mine', created_by: USER, security_level: 'restricted' as const },
    ];
    const visible = filterVisibleFolders(folders, {
      isSuperAdmin: false,
      userId: USER,
      effectiveClearance: 'internal',
      allDeniedFolderIds: new Set(),
      grantedFolderIds: new Set(['hr']),
    });
    expect(visible.map(f => f.id).sort()).toEqual(['desktop', 'hr', 'mine']);
  });

  it('never shows a denied folder, even to the creator', () => {
    const folders = [{ id: 'blocked', created_by: USER, security_level: 'internal' as const }];
    const visible = filterVisibleFolders(folders, {
      isSuperAdmin: false,
      userId: USER,
      effectiveClearance: 'top_secret',
      allDeniedFolderIds: new Set(['blocked']),
      grantedFolderIds: new Set(),
    });
    expect(visible).toHaveLength(0);
  });

  it('collects a folder and all nested children for All Levels search', () => {
    const ids = collectDescendantFolderIds('projects', {
      projects: [{ id: 'alpha' }, { id: 'beta' }],
      alpha: [{ id: 'alpha-docs' }],
    });
    expect([...ids].sort()).toEqual(['alpha', 'alpha-docs', 'beta', 'projects']);
  });

  it('does not collect descendants for Starred / My Files virtual views', () => {
    expect(collectDescendantFolderIds('__pinned__', { projects: [{ id: 'a' }] }).size).toBe(0);
    expect(collectDescendantFolderIds(null, { projects: [{ id: 'a' }] }).size).toBe(0);
  });

  it('expands search into nested folders only when a query is present', () => {
    const nested = file({ id: 'deep', name: 'proposal.docx', folder_id: 'alpha-docs' });
    const childMap = {
      projects: [{ id: 'alpha' }],
      alpha: [{ id: 'alpha-docs' }],
    };
    const descendants = collectDescendantFolderIds('projects', childMap);

    const browsing = filterDisplayedFiles({
      ...emptyFilter,
      files: [nested],
      selectedFolderId: 'projects',
      descendantFolderIds: descendants,
      searchQuery: '',
    });
    expect(browsing).toHaveLength(0);

    const searching = filterDisplayedFiles({
      ...emptyFilter,
      files: [nested],
      selectedFolderId: 'projects',
      descendantFolderIds: descendants,
      searchQuery: 'proposal',
    });
    expect(searching.map(f => f.id)).toEqual(['deep']);
  });
});
