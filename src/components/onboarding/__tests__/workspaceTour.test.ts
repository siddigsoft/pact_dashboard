import { beforeEach, describe, expect, it } from 'vitest';
import { hasCompletedWorkspaceTour, markWorkspaceTourCompleted } from '../workspaceTour';

describe('workspace tour completion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts incomplete and marks complete per user', () => {
    expect(hasCompletedWorkspaceTour('u1')).toBe(false);
    markWorkspaceTourCompleted('u1');
    expect(hasCompletedWorkspaceTour('u1')).toBe(true);
    expect(hasCompletedWorkspaceTour('u2')).toBe(false);
  });
});
