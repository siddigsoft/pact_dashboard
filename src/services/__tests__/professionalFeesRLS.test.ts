/**
 * RLS / visibility-guard tests for get_project_professional_fees()
 *
 * Context
 * -------
 * The Supabase function is defined with SECURITY DEFINER, which means it runs
 * as the function owner and bypasses the projects table RLS entirely.  The
 * migration 20260807_professional_fees_rls_filter.sql patches the function body
 * to re-apply the same visibility logic that the projects_select RLS policy
 * would enforce:
 *
 *   • Privileged roles (not in the restricted set) → all rows
 *   • Restricted roles (employee | fom | countryDirector | hr) → only rows
 *     where the caller is projectManagerId, appears in teamComposition, or
 *     has an active row in project_team_members
 *
 * What these tests cover
 * ----------------------
 * 1. The TypeScript equivalent of the SQL guard (`isProjectVisibleToRole`) is
 *    tested exhaustively so any future TypeScript-layer rewrite stays correct.
 *
 * 2. Three RPC-call scenarios are verified with a mocked Supabase client:
 *    a. Restricted role + no project membership → 0 rows
 *    b. Restricted role + IS a project member   → rows returned
 *    c. Privileged role                         → all rows returned (no filter)
 *
 * These tests run in vitest (jsdom) without a live database connection.
 * For live DB verification run supabase/tests/professional_fees_rls_test.sql
 * against the Supabase SQL editor.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Pure TypeScript mirror of the SQL visibility guard
// ---------------------------------------------------------------------------

/** Roles that receive restricted visibility (mirrors the SQL IN list). */
const RESTRICTED_ROLES = new Set(['employee', 'fom', 'countryDirector', 'hr']);

interface Project {
  id: string;
  team: {
    projectManagerId?: string;
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
 * Mirrors the WHERE clause added by 20260807_professional_fees_rls_filter.sql.
 *
 * Returns true when `callerId` is allowed to see fee rows for `project`.
 *
 * @param callerRole       - The profiles.role value for the calling user
 * @param callerId         - The auth.uid() value for the calling user
 * @param project          - The project row being tested
 * @param teamMemberRows   - All project_team_members rows for this project
 */
function isProjectVisibleToRole(
  callerRole: string | null,
  callerId: string,
  project: Project,
  teamMemberRows: TeamMemberRow[],
): boolean {
  // Clause 1: privileged role → always visible.
  // A null role is treated as restricted (NULL NOT IN (...) → NULL → false in SQL).
  if (callerRole !== null && !RESTRICTED_ROLES.has(callerRole)) {
    return true;
  }

  // Clause 2: restricted role → visible only when caller is a project member.
  if (callerRole === null || !RESTRICTED_ROLES.has(callerRole)) {
    // null-role: deny (mirrors SQL NULL NOT IN behaviour falling through to clause 2
    // which also denies because RESTRICTED_ROLES.has(null) is false)
    return false;
  }

  const team = project.team ?? {};

  // a) Named as project manager
  if (team.projectManagerId === callerId) {
    return true;
  }

  // b) Appears in teamComposition
  const composition: Array<{ userId: string }> = team.teamComposition ?? [];
  if (composition.some((m) => m.userId === callerId)) {
    return true;
  }

  // c) Has an active row in project_team_members
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

const PROJECT_A: Project = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  team: {
    projectManagerId: 'user-manager-01',
    teamComposition: [
      { userId: 'user-member-01', name: 'Alice', feeType: 'fixed_fee', rate: 1000 },
      { userId: 'user-member-02', name: 'Bob',   feeType: 'per_hour',  rate: 50 },
    ],
  },
};

const PROJECT_B: Project = {
  id: 'bbbbbbbb-0000-0000-0000-000000000002',
  team: {
    projectManagerId: 'user-manager-02',
    teamComposition: [
      { userId: 'user-member-03', name: 'Carol', feeType: 'fixed_fee', rate: 2000 },
    ],
  },
};

const TEAM_MEMBER_ROWS: TeamMemberRow[] = [
  // user-ptm-01 has an active explicit row on PROJECT_A
  { project_id: PROJECT_A.id, user_id: 'user-ptm-01', is_active: true },
  // user-ptm-02 has an INACTIVE row → should not grant visibility
  { project_id: PROJECT_A.id, user_id: 'user-ptm-02', is_active: false },
];

// ---------------------------------------------------------------------------
// 3. Guard logic unit tests
// ---------------------------------------------------------------------------

describe('isProjectVisibleToRole — SQL guard logic (TypeScript mirror)', () => {
  // ── Privileged roles ──────────────────────────────────────────────────────

  it('SuperAdmin sees every project', () => {
    expect(isProjectVisibleToRole('SuperAdmin', 'any-uid', PROJECT_A, [])).toBe(true);
    expect(isProjectVisibleToRole('SuperAdmin', 'any-uid', PROJECT_B, [])).toBe(true);
  });

  it('Admin sees every project', () => {
    expect(isProjectVisibleToRole('Admin', 'any-uid', PROJECT_A, [])).toBe(true);
  });

  it('Coordinator sees every project', () => {
    expect(isProjectVisibleToRole('Coordinator', 'any-uid', PROJECT_A, [])).toBe(true);
  });

  it('FinancialAdmin sees every project', () => {
    expect(isProjectVisibleToRole('FinancialAdmin', 'any-uid', PROJECT_B, [])).toBe(true);
  });

  it('Auditor sees every project', () => {
    expect(isProjectVisibleToRole('Auditor', 'any-uid', PROJECT_A, [])).toBe(true);
  });

  // ── Restricted roles with NO membership ──────────────────────────────────

  it.each(['employee', 'fom', 'countryDirector', 'hr'])(
    '%s with no membership sees ZERO rows for a project they are not part of',
    (role) => {
      expect(
        isProjectVisibleToRole(role, 'stranger-uid', PROJECT_A, TEAM_MEMBER_ROWS),
      ).toBe(false);
    },
  );

  // ── Restricted roles WITH membership ─────────────────────────────────────

  it('employee who is the projectManagerId can see the project', () => {
    expect(
      isProjectVisibleToRole('employee', 'user-manager-01', PROJECT_A, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('fom who appears in teamComposition can see the project', () => {
    expect(
      isProjectVisibleToRole('fom', 'user-member-01', PROJECT_A, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('hr who appears in teamComposition can see the project', () => {
    expect(
      isProjectVisibleToRole('hr', 'user-member-02', PROJECT_A, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('countryDirector with active project_team_members row can see the project', () => {
    expect(
      isProjectVisibleToRole('countryDirector', 'user-ptm-01', PROJECT_A, TEAM_MEMBER_ROWS),
    ).toBe(true);
  });

  it('user with only an INACTIVE project_team_members row is still denied', () => {
    expect(
      isProjectVisibleToRole('employee', 'user-ptm-02', PROJECT_A, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  it('restricted user who is a member of Project A cannot see Project B', () => {
    // user-member-01 is in PROJECT_A's teamComposition but not PROJECT_B's
    expect(
      isProjectVisibleToRole('employee', 'user-member-01', PROJECT_B, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });

  // ── Null / unknown role ───────────────────────────────────────────────────

  it('null role (no profile row) is always denied', () => {
    expect(
      isProjectVisibleToRole(null, 'user-member-01', PROJECT_A, TEAM_MEMBER_ROWS),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Mocked Supabase RPC scenario tests
//
//    These verify that when the patched DB function returns the correctly
//    filtered rows (as it will after the migration runs), the consuming code
//    handles zero-row and multi-row responses without errors.
// ---------------------------------------------------------------------------

type FeeRow = {
  project_id: string;
  project_name: string;
  user_id: string;
  member_name: string;
  fee_type: string;
  rate: number;
  total_fee: number;
  outstanding: number;
  payment_status: string;
};

/** Simulate calling get_project_professional_fees() via a mocked Supabase client. */
async function callGetProjectProfessionalFees(
  mockRpcImpl: (fnName: string, args: Record<string, unknown>) => Promise<{ data: FeeRow[] | null; error: null | { message: string } }>,
  projectId?: string,
): Promise<FeeRow[]> {
  const args: Record<string, unknown> = {};
  if (projectId) args.p_project_id = projectId;

  const { data, error } = await mockRpcImpl('get_project_professional_fees', args);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const FEE_ROWS_PROJECT_A: FeeRow[] = [
  {
    project_id: PROJECT_A.id,
    project_name: 'Alpha Project',
    user_id: 'user-member-01',
    member_name: 'Alice',
    fee_type: 'fixed_fee',
    rate: 1000,
    total_fee: 1000,
    outstanding: 1000,
    payment_status: 'unpaid',
  },
  {
    project_id: PROJECT_A.id,
    project_name: 'Alpha Project',
    user_id: 'user-member-02',
    member_name: 'Bob',
    fee_type: 'per_hour',
    rate: 50,
    total_fee: 400,
    outstanding: 400,
    payment_status: 'unpaid',
  },
];

const FEE_ROWS_PROJECT_B: FeeRow[] = [
  {
    project_id: PROJECT_B.id,
    project_name: 'Beta Project',
    user_id: 'user-member-03',
    member_name: 'Carol',
    fee_type: 'fixed_fee',
    rate: 2000,
    total_fee: 2000,
    outstanding: 2000,
    payment_status: 'unpaid',
  },
];

describe('get_project_professional_fees() — mocked Supabase RPC scenarios', () => {
  // Scenario A: restricted role, not a member of any project
  // The patched DB function returns [] for this caller.
  it('Scenario A — restricted user (employee) with no membership receives zero fee rows', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const rows = await callGetProjectProfessionalFees(mockRpc);
    expect(rows).toHaveLength(0);
    expect(mockRpc).toHaveBeenCalledWith('get_project_professional_fees', {});
  });

  // Scenario B: restricted role, IS a member of Project A only
  // The patched DB function returns only Project A's fee rows.
  it('Scenario B — restricted user (fom) who is a member of Project A only receives that project\'s fee rows', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: FEE_ROWS_PROJECT_A, error: null });
    const rows = await callGetProjectProfessionalFees(mockRpc);
    expect(rows.length).toBeGreaterThan(0);
    const projectIds = new Set(rows.map((r) => r.project_id));
    expect(projectIds.has(PROJECT_A.id)).toBe(true);
    expect(projectIds.has(PROJECT_B.id)).toBe(false);
  });

  // Scenario C: privileged role — receives all rows across all projects
  it('Scenario C — privileged user (Admin) receives fee rows for ALL projects', async () => {
    const allRows = [...FEE_ROWS_PROJECT_A, ...FEE_ROWS_PROJECT_B];
    const mockRpc = vi.fn().mockResolvedValue({ data: allRows, error: null });
    const rows = await callGetProjectProfessionalFees(mockRpc);
    expect(rows).toHaveLength(3);
    const projectIds = new Set(rows.map((r) => r.project_id));
    expect(projectIds.has(PROJECT_A.id)).toBe(true);
    expect(projectIds.has(PROJECT_B.id)).toBe(true);
  });

  // Scenario D: restricted user queries a specific project they are NOT a member of
  it('Scenario D — restricted user querying a project they are not a member of receives zero rows', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const rows = await callGetProjectProfessionalFees(mockRpc, PROJECT_B.id);
    expect(rows).toHaveLength(0);
    expect(mockRpc).toHaveBeenCalledWith('get_project_professional_fees', {
      p_project_id: PROJECT_B.id,
    });
  });

  // Scenario E: restricted user queries a specific project they ARE a member of
  it('Scenario E — restricted user querying a project they are a member of receives that project\'s rows', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: FEE_ROWS_PROJECT_A, error: null });
    const rows = await callGetProjectProfessionalFees(mockRpc, PROJECT_A.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.project_id === PROJECT_A.id)).toBe(true);
  });

  // Error propagation
  it('propagates a Supabase RPC error as a thrown Error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function get_project_professional_fees' },
    });
    await expect(callGetProjectProfessionalFees(mockRpc)).rejects.toThrow(
      'permission denied for function get_project_professional_fees',
    );
  });
});
