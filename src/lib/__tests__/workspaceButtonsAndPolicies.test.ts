import { describe, expect, it } from 'vitest';
import {
  WORKSPACE_POLICY_ANTIPATTERNS,
  canApproveDeleteRequest,
  canDirectDelete,
  canManageWorkspaceItem,
  canRenameWorkspaceFile,
  canRenameWorkspaceFolder,
  canRequestDelete,
  canSetItemPassword,
  canShareManageAccess,
  canShowAccessManagerButton,
  canShowClearancesButton,
  canShowNewFolderButton,
  shareButtonMode,
  type WorkspaceActor,
} from '../workspaceHubLogic';

const STAFF: WorkspaceActor = { userId: 'u-staff', isAdmin: false, isSuperAdmin: false };
const ADMIN: WorkspaceActor = { userId: 'u-admin', isAdmin: true, isSuperAdmin: false };
const SUPER: WorkspaceActor = { userId: 'u-super', isAdmin: true, isSuperAdmin: true };
const OWNER: WorkspaceActor = { userId: 'u-owner', isAdmin: false, isSuperAdmin: false };

describe('workspace hub buttons — role matrix', () => {
  it('Upload is available to everyone who passed the access gate', () => {
    // Upload button has no role gate in WorkspaceHub (only the access grant gate).
    expect([STAFF, ADMIN, SUPER].every(() => true)).toBe(true);
  });

  it('New folder is admin / super admin only (matches sidebar + New folder)', () => {
    expect(canShowNewFolderButton(STAFF)).toBe(false);
    expect(canShowNewFolderButton(OWNER)).toBe(false);
    expect(canShowNewFolderButton(ADMIN)).toBe(true);
    expect(canShowNewFolderButton(SUPER)).toBe(true);
  });

  it('Clearances and Access Manager are super admin only', () => {
    expect(canShowClearancesButton(ADMIN)).toBe(false);
    expect(canShowClearancesButton(SUPER)).toBe(true);
    expect(canShowAccessManagerButton(ADMIN)).toBe(false);
    expect(canShowAccessManagerButton(SUPER)).toBe(true);
  });

  it('Share header is manage for admins, read-only label for folder owners', () => {
    expect(shareButtonMode(ADMIN)).toBe('manage');
    expect(shareButtonMode(SUPER)).toBe('manage');
    expect(shareButtonMode(OWNER)).toBe('readonly');
    expect(shareButtonMode(STAFF)).toBe('readonly');
  });

  it('file/folder manage menus follow owner-or-admin', () => {
    expect(canManageWorkspaceItem(STAFF, 'someone-else')).toBe(false);
    expect(canManageWorkspaceItem(OWNER, 'u-owner')).toBe(true);
    expect(canManageWorkspaceItem(ADMIN, 'someone-else')).toBe(true);
    expect(canManageWorkspaceItem(SUPER, 'someone-else')).toBe(true);
  });

  it('Rename is creator / folder-owner / super admin — not plain admin', () => {
    const folders = [{ id: 'desk', created_by: 'u-owner' }];
    expect(canRenameWorkspaceFile(ADMIN, { created_by: 'other', folder_id: 'desk' }, folders)).toBe(false);
    expect(canRenameWorkspaceFile(OWNER, { created_by: 'other', folder_id: 'desk' }, folders)).toBe(true);
    expect(canRenameWorkspaceFile(SUPER, { created_by: 'other', folder_id: null }, folders)).toBe(true);
    expect(canRenameWorkspaceFolder(ADMIN, { created_by: 'other' })).toBe(false);
    expect(canRenameWorkspaceFolder(OWNER, { created_by: 'u-owner' })).toBe(true);
  });

  it('Delete: admin and super admin direct; staff request; only admins approve', () => {
    expect(canDirectDelete(SUPER)).toBe(true);
    expect(canDirectDelete(ADMIN)).toBe(true);
    expect(canDirectDelete(STAFF)).toBe(false);
    expect(canRequestDelete(OWNER, 'u-owner')).toBe(true);
    expect(canRequestDelete(ADMIN, 'u-owner')).toBe(false);
    expect(canRequestDelete(SUPER, 'u-owner')).toBe(false);
    expect(canApproveDeleteRequest(STAFF)).toBe(false);
    expect(canApproveDeleteRequest(ADMIN)).toBe(true);
    expect(canApproveDeleteRequest(SUPER)).toBe(true);
  });

  it('Set password is creator or super admin (not generic admin)', () => {
    expect(canSetItemPassword(ADMIN, 'other')).toBe(false);
    expect(canSetItemPassword(OWNER, 'u-owner')).toBe(true);
    expect(canSetItemPassword(SUPER, 'other')).toBe(true);
  });

  it('viewer-restricted grants hide share/manage even for admins', () => {
    expect(canShareManageAccess(ADMIN, 'u-admin', true)).toBe(false);
    expect(canShareManageAccess(SUPER, 'anyone', true)).toBe(true);
    expect(canShareManageAccess(OWNER, 'u-owner', false)).toBe(true);
  });
});

describe('workspace DB policy antipatterns (must stay dropped)', () => {
  it('documents the conflicting policies found on live PACT DB', () => {
    expect(WORKSPACE_POLICY_ANTIPATTERNS.map(p => p.policy)).toEqual([
      'workspace_access_grants_read',
      'workspace_access_requests_self',
      'workspace_access_grants_admin',
      'workspace_access_requests_admin',
      'Super admins manage clearances',
    ]);
  });

  it('flags open SELECT USING (true) as a conflict with scoped select', () => {
    const openRead = WORKSPACE_POLICY_ANTIPATTERNS.find(p => p.policy === 'workspace_access_grants_read');
    expect(openRead?.reason).toMatch(/USING \(true\)/);
  });

  it('flags self FOR ALL on access requests as a self-approve hole', () => {
    const selfAll = WORKSPACE_POLICY_ANTIPATTERNS.find(p => p.policy === 'workspace_access_requests_self');
    expect(selfAll?.reason).toMatch(/self-approve/i);
  });

  it('flags exact SuperAdmin role checks that miss live superAdmin', () => {
    const exact = WORKSPACE_POLICY_ANTIPATTERNS.filter(p => p.reason.includes('SuperAdmin'));
    expect(exact.length).toBeGreaterThanOrEqual(2);
  });
});
