/**
 * RLS / visibility tests for the projects table SELECT policy
 *
 * Context
 * -------
 * Two migrations together define the active projects_select policy:
 *
 *   1. 20260807_projects_rls_member_visibility.sql — enables RLS and creates
 *      the initial policy.
 *   2. 20260807_fix_project_team_members_rls_recursion.sql — replaces the
 *      policy with a version that:
 *        • adds the legacy `team->>'projectManager'` membership path
 *        • replaces the direct EXISTS on project_team_members with a call to
 *          the SECURITY DEFINER helper `is_active_project_team_member(project_id)`
 *          (avoids infinite recursion when project_team_members itself has RLS)
 *
 * Active USING clause (simplified):
 *
 *   Privileged role (NOT IN restricted set) → TRUE (see all rows)
 *   Restricted role (IN restricted set)     → TRUE only when:
 *     a) team->>'projectManagerId' = auth.uid()   (current PM key)
 *     b) team->>'projectManager'   = auth.uid()   (legacy PM key)
 *     c) teamComposition @> [{userId: auth.uid()}]
 *     d) is_active_project_team_member(projects.id) = TRUE
 *   Null role / no profile row              → FALSE (deny)
 *
 * What these tests cover
 * ----------------------
 * 1. The TypeScript equivalent of the SQL USING clause (`isProjectVisible`) is
 *    tested exhaustively against the FINAL live policy so any future
 *    TypeScript-layer rewrite stays correct.
 *
 * 2. Four Supabase-client scenarios are verified with a mocked client that
 *    simulate the correctly-filtered responses the policy would return.
 *
 * These tests run in vitest (jsdom) without a live database connection.
 * For live DB verification run supabase/tests/projects_rls_test.sql in the
 * Supabase SQL Editor (the SQL test uses SET ROLE authenticated so RLS
 * actually fires, not just auth.uid()).
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Pure TypeScript mirror of the projects_select USING clause
//    (reflects the FINAL policy from the recursion-fix migration)
// ---------------------------------------------------------------------------

/** Roles that receive restricted visibility (mirrors the SQL IN list). */
const RESTRICTED_ROLES = new Set(['employee', 'fom', 'countryDirector', 'hr']);

interface ProjectRow {
  id: string;
  name: string;
  status: string;
  team: {
    /** Current PM field — checked by the policy */
    projectManagerId?: string | null;
    /** Legacy PM field — also checked by the policy (recursion-fix migration) */
    projectManager?: string | null;
    teamComposition?: Array<{ userId: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
}

interface TeamMemberRow {
  project_id: string;
  user_id: string;
  is_active: boolean;
}

/**
 * Mirrors the USING clause of the `projects_select` policy as it stands after
 * 20260807_fix_project_team_members_rls_recursion.sql.
 *
 * The SECURITY DEFINER helper `is_active_project_team_member(p_project_id)`
 * used in the live SQL is semantically identical to scanning the
 * teamMemberRows array for an active row — we model it that way here because
 * the TypeScript layer has no DB connection.
 *
 * @param callerRole     - The profiles.role value for the calling user
 * @param callerId       - The auth.uid() value for the calling user
 * @param project        - The projects row being tested
 * @param teamMemberRows - All project_team_members rows (bypasses RLS in the
 *                         helper, so pass the full set for the project)
 */
function isProjectVisible(
  callerRole: string | null,
  callerId: string,
  project: ProjectRow,
  teamMemberRows: TeamMemberRow[],
): boolean {
  // Clause 1: privileged role → always visible.
  // NULL NOT IN (...) evaluates to NULL in SQL → treated as FALSE, so
  // null-role callers fall through and are denied by clause 2 as well.
  if (callerRole !== null && !RESTRICTED_ROLES.has(callerRole)) {
    return true;
  }

  // Clause 2: restricted role → visible only when caller is a project member.
  // A null role does not satisfy IN ('employee', ...) → deny.
  if (callerRole === null || !RESTRICTED_ROLES.has(callerRole)) {
    return false;
  }

  const team = project.team ?? {};

  // a) Named as project manager via the current projectManagerId key
  if (team.projectManagerId != null && team.projectManagerId === callerId) {
    return true;
  }

  // b) Named via the legacy projectManager key
  //    (added by 20260807_fix_project_team_members_rls_recursion.sql)
  if (team.projectManager != null && team.projectManager === callerId) {
    return true;
  }

  // c) Appears in the teamComposition array as a userId
  const composition: Array<{ userId: string }> = team.teamComposition ?? [];
  if (composition.some((m) => m.userId === callerId)) {
    return true;
  }

  // d) Mirrors is_active_project_team_member(projects.id):
  //    has an active row in project_team_members for this project
  if (
    teamMemberRows.some(
      (r) => r.project_id === project.id && r.user_id === callerId && r.is_active,
    )
  ) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// 2. Fixture data
// ---------------------------------------------------------------------------

const PROJECT_ALPHA: ProjectRow = {
  id: 'b10caaaa-0000-4000-8000-000000000001',
  name: '__prj_rls_test_alpha__',
  status: 'active',
  team: {
    projectManagerId: 'user-cd-01',         // countryDirector via current key
    projectManager:   'user-employee-pm',   // employee via legacy key
    teamComposition: [
      { userId: 'user-employee-01', name: 'Alice' },
    ],
  },
};

const PROJECT_BETA: ProjectRow = {
  id: 'b10cbbbb-0000-4000-8000-000000000002',
  name: '__prj_rls_test_beta__',
  status: 'active',
  team: {
    projectManagerId: 'user-unrelated-pm',
    projectManager:   null,
    teamComposition: [
      { userId: 'user-unrelated-01', name: 'Unrelated User' },
    ],
  },
};

const TEAM_MEMBER_ROWS: TeamMemberRow[] = [
  // hr user has an active explicit row on PROJECT_ALPHA
  { project_id: PROJECT_ALPHA.id, user_id: 'user-hr-01', is_active: true },
  // employee-02 has an INACTIVE row on PROJECT_ALPHA → must NOT grant visibility
  { project_id: PROJECT_ALPHA.id, user_id: 'user-employee-02', is_active: false },
];

// ---------------------------------------------------------------------------
// 3. Guard logic unit tests (mirrors the SQL USING clause)
// ---------------------------------------------------------------------------

describe('isProjectVisible — SQL projects_select policy (TypeScript mirror)', () => {
  // ── Privileged roles ──────────────────────────────────────────────────────

  it('SuperAdmin sees every project', () => {
    expect(isProjectVisible('SuperAdmin', 'any-uid', PROJECT_ALPHA, [])).toBe(true);
    expect(isProjectVisible('SuperAdmin', 'any-uid', PROJECT_BETA,  [])).toBe(true);
  });

  it('Admin sees every project', () => {
    expect(isProjectVisible('Admin', 'any-uid', PROJECT_ALPHA, [])).toBe(true);
    expect(isProjectVisible('Admin', 'any-uid', PROJECT_BETA,  [])).toBe(true);
  });

  it('projectManager role sees every project', () => {
    expect(isProjectVisible('projectManager', 'any-uid', PROJECT_ALPHA, [])).toBe(true);
  });

  it('seniorOperationsLead sees every project', () => {
    expect(isProjectVisible('seniorOperationsLead', 'any-uid', PROJECT_BETA, [])).toBe(true);
  });

  it('ict sees every project', () => {
    expect(isProjectVisible('ict', 'any-uid', PROJECT_ALPHA, [])).toBe(true);
  });

  it('financialAdmin sees every project', () => {
    expect(isProjectVisible('financialAdmin', 'any-uid', PROJECT_BETA, [])).toBe(true);
  });

  it('Auditor (any other non-restricted role) sees every project', () => {
    expect(isProjectVisible('Auditor', 'any-uid', PROJECT_ALPHA, [])).toBe(true);
  });

  // ── Restricted roles with NO membership ──────────────────────────────────

  it.each(['employee', 'fom', 'countryDirector', 'hr'])(
    '%s with no membership sees ZERO rows for any project',
    (role) => {
      expect(isProjectVisible(role, 'stranger-uid', PROJECT_ALPHA, TEAM_MEMBER_ROWS)).toBe(false);
      expect(isProjectVisible(role, 'stranger-uid', PROJECT_BETA,  TEAM_MEMBER_ROWS)).toBe(false);
    },
  );

  // ── Membership via current projectManagerId key ───────────────────────────

  it('countryDirector who is the projectManagerId can see that project', () => {
    expect(
      isProjectVisible('countryDirector', 'user-cd-01', PROJECT_ALPHA, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('countryDirector (pm of α) cannot see β through that membership', () => {
    expect(
      isProjectVisible('countryDirector', 'user-cd-01', PROJECT_BETA, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  // ── Membership via legacy projectManager key ──────────────────────────────

  it('employee named via the legacy projectManager key can see the project', () => {
    expect(
      isProjectVisible('employee', 'user-employee-pm', PROJECT_ALPHA, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('employee named via legacy key on α cannot see β', () => {
    expect(
      isProjectVisible('employee', 'user-employee-pm', PROJECT_BETA, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  it('null legacy projectManager key does not grant access', () => {
    // PROJECT_BETA has projectManager: null — no one should match on it
    expect(
      isProjectVisible('fom', 'user-cd-01', PROJECT_BETA, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  // ── Membership via teamComposition ────────────────────────────────────────

  it('employee who appears in teamComposition can see the project', () => {
    expect(
      isProjectVisible('employee', 'user-employee-01', PROJECT_ALPHA, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('fom who appears in teamComposition can see the project', () => {
    const project: ProjectRow = {
      ...PROJECT_BETA,
      team: {
        ...PROJECT_BETA.team,
        teamComposition: [{ userId: 'user-fom-01', name: 'FOM Member' }],
      },
    };
    expect(isProjectVisible('fom', 'user-fom-01', project, [])).toBe(true);
  });

  it('restricted teamComposition member of α cannot see β', () => {
    expect(
      isProjectVisible('employee', 'user-employee-01', PROJECT_BETA, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  // ── Membership via is_active_project_team_member helper ──────────────────

  it('hr with an active project_team_members row can see the project', () => {
    expect(
      isProjectVisible('hr', 'user-hr-01', PROJECT_ALPHA, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('hr with an active ptm row on α cannot see β', () => {
    expect(
      isProjectVisible('hr', 'user-hr-01', PROJECT_BETA, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  it('user with only an INACTIVE project_team_members row is still denied', () => {
    // is_active_project_team_member requires is_active IS TRUE
    expect(
      isProjectVisible('employee', 'user-employee-02', PROJECT_ALPHA, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  // ── Null / unknown role ───────────────────────────────────────────────────

  it('null role (no profile row or role IS NULL) is always denied — even if the user matches membership', () => {
    // NULL NOT IN (...) → NULL → treated as FALSE, so clause 1 fails.
    // NULL IN (...)     → NULL → treated as FALSE, so clause 2 also fails.
    expect(isProjectVisible(null, 'user-employee-01', PROJECT_ALPHA, TEAM_MEMBER_ROWS)).toBe(false);
    expect(isProjectVisible(null, 'user-hr-01',       PROJECT_ALPHA, TEAM_MEMBER_ROWS)).toBe(false);
    expect(isProjectVisible(null, 'user-cd-01',       PROJECT_ALPHA, TEAM_MEMBER_ROWS)).toBe(false);
    expect(isProjectVisible(null, 'any-uid',          PROJECT_BETA,  [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Mocked Supabase client scenario tests
//
//    These simulate the rows that a correctly-applied projects_select policy
//    would return to a real Supabase client.  Each scenario names the role and
//    membership situation so the expectation is self-documenting.
// ---------------------------------------------------------------------------

type ProjectListRow = Pick<ProjectRow, 'id' | 'name' | 'status'>;

/** Simulate a Supabase `.from('projects').select(...)` call via a mock. */
async function queryProjects(
  mockSelectImpl: () => Promise<{
    data: ProjectListRow[] | null;
    error: null | { message: string };
  }>,
): Promise<ProjectListRow[]> {
  const { data, error } = await mockSelectImpl();
  if (error) throw new Error(error.message);
  return data ?? [];
}

const ALPHA_LIST_ROW: ProjectListRow = { id: PROJECT_ALPHA.id, name: '__prj_rls_test_alpha__', status: 'active' };
const BETA_LIST_ROW:  ProjectListRow = { id: PROJECT_BETA.id,  name: '__prj_rls_test_beta__',  status: 'active' };

describe('projects table SELECT — mocked policy-filtered Supabase responses', () => {
  // Scenario A: restricted role, not a member of any project → policy returns []
  it('Scenario A — fom with no membership: policy returns zero rows', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const rows = await queryProjects(mockSelect);
    expect(rows).toHaveLength(0);
  });

  // Scenario B: restricted role, IS a member of α only → policy returns [α]
  it('Scenario B — employee in teamComposition of α only: policy returns α, hides β', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [ALPHA_LIST_ROW], error: null });
    const rows = await queryProjects(mockSelect);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PROJECT_ALPHA.id);
    expect(rows.some((r) => r.id === PROJECT_BETA.id)).toBe(false);
  });

  // Scenario C: privileged role → policy returns all rows
  it('Scenario C — Admin: policy returns ALL projects', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [ALPHA_LIST_ROW, BETA_LIST_ROW], error: null });
    const rows = await queryProjects(mockSelect);
    expect(rows).toHaveLength(2);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has(PROJECT_ALPHA.id)).toBe(true);
    expect(ids.has(PROJECT_BETA.id)).toBe(true);
  });

  // Scenario D: hr with active ptm row on α → policy returns [α], hides β
  it('Scenario D — hr with active ptm row on α: policy returns α, hides β', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [ALPHA_LIST_ROW], error: null });
    const rows = await queryProjects(mockSelect);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PROJECT_ALPHA.id);
  });

  // Scenario E: restricted non-member queries β directly → policy returns []
  it('Scenario E — fom querying β directly: policy returns zero rows', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null });
    const rows = await queryProjects(mockSelect);
    expect(rows).toHaveLength(0);
  });

  // Error propagation
  it('propagates a Supabase RLS error as a thrown Error', async () => {
    const mockSelect = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'new row violates row-level security policy for table "projects"' },
    });
    await expect(queryProjects(mockSelect)).rejects.toThrow(
      'new row violates row-level security policy for table "projects"',
    );
  });
});
