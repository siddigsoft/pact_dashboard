import { describe, expect, it } from 'vitest';
import { isAssignedProjectManager, projectTaskUrl } from './projectIdentity';
describe('project ownership and task deep links', () => {
  it('recognizes the canonical manager ID', () => {
    expect(isAssignedProjectManager({ projectManagerId: 'manager' }, { id: 'manager' })).toBe(true);
  });
  it('does not accept a stale legacy manager when a canonical ID exists', () => {
    expect(isAssignedProjectManager({ projectManagerId: 'new', projectManager: 'old' }, { id: 'old' })).toBe(false);
  });
  it('retains legacy ID and display-name compatibility when no canonical ID exists', () => {
    expect(isAssignedProjectManager({ projectManager: 'm' }, { id: 'm' })).toBe(true);
    expect(isAssignedProjectManager({ projectManager: 'Manager' }, { id: 'm', fullName: 'Manager' })).toBe(true);
    expect(isAssignedProjectManager({}, { id: 'm' })).toBe(false);
  });
  it('does not grant an empty user management access', () => {
    expect(isAssignedProjectManager({ projectManagerId: 'm' }, null)).toBe(false);
  });
  it('uses the existing task section and task parameter, with safe encoding', () => {
    const url = new URL(projectTaskUrl('p/a', 't&a'), 'https://example.test');
    expect(url.pathname).toBe('/projects/p%2Fa');
    expect(url.searchParams.get('tab')).toBe('field_tasks');
    expect(url.searchParams.get('task')).toBe('t&a');
  });
});
