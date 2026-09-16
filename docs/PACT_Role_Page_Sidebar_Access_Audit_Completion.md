# PACT Role / Page / Sidebar Access — Completion Evidence
Updated: 16 September 2026
Branch: codex/complete-access-coordination

## Status
The remaining Phase 5–6 delivery items from the 15 September audit are complete for the current release slice: server authorization migrations are applied, legacy access editors are retired into the canonical Access Control Workspace, access matrix tests pass, and TypeScript verification is clean.

## Server authorization (applied remotely)
Verified on the linked Supabase project:

| Migration | Result |
| --- | --- |
| 20260916093611_standardize_access_override_metadata | Applied |
| 20260916094052_expire_page_overrides_in_access_manifest | Applied |
| 20260916100000_canonical_resource_authorization | Applied |
| 20260916101000_resource_override_ceilings | Applied |
| 20260916103000_complete_role_access_baseline | Applied (
ole_tab_configs, expanded upsert_role_access, assign/remove RPCs) |
| 20260916104000_server_override_attribution | Applied (ttribute_access_override triggers + 
ole_tab_blocks in access context) |
| 20260916120000_protect_role_definition_mutations | Applied (delete_role_access, protected-role/owner guards, SA appointment restrictive policy) |
| 20260916121000_finance_resource_capability_gates | Applied (restrictive capability policies on finance tables + transition guard) |

Verification SQL confirmed: 
ole_tab_configs, delete_role_access, finance capability policies/triggers, and attribution triggers are present.

## Legacy cleanup
Retired / redirected into /super-admin-hub?tab=user-access (canonical Unified Access Manager):

- Deleted: PageAccessOverview, UserAccessProfile, UserPermissionOverrides, SecurityPanel, RoleAccessMap, CostSubmissionPermissions, PermissionsManagement, SuperAdminPageAccessPanel
- Hub aliases: permissions and page-grants → user-access
- Routes: /page-access, /permissions-management → Users workspace
- Registry: removed duplicate sa-page-grants target; sa-permissions-mgmt points at Users

## Verification evidence
- 
px tsc --noEmit — clean
- Vitest access suites — **258 passed** across:
  - src/lib/__tests__/current-user-access.test.ts
  - src/lib/__tests__/access-workspace-url.test.ts
  - src/lib/__tests__/protected-route-coverage.test.ts
  - src/hooks/__tests__/useCurrentUserAccessManifest.test.tsx
  - src/lib/__tests__/page-roles.test.ts
- Fix included: navigation manifest now denies a page by registry slug before evaluating redirected hub destinations (so a 
eports page block cannot re-admit via /analytics?tab=reports).

## Remaining follow-ups (explicitly deferred)
- Dedicated SECURITY DEFINER RPCs for page/action override mutations (client still writes override tables under existing SA RLS; attribution/audit triggers are live).
- Broader module coverage beyond the finance capability gate set.
- Optional move of leftover helpers off the PageAccessControl redirect stub into a pure registry module.

## Acceptance criteria mapping
| Criterion | Evidence |
| --- | --- |
| Role identified by 
ole_id through lifecycle | upsert_role_access / ssign_role_to_user / delete_role_access |
| Custom role appears in editors | Role selectors load from 
oles; baselines saved via staged lifecycle |
| Effective access for nav/route | Shared get_current_user_access_context + manifest evaluator |
| Assignment is non-destructive | Canonical multi-role assignments; no delete-all client path |
| Protected routes resolve to registry targets | protected-route-coverage test |
| Sidebar preferences cannot restore denied pages | Manifest nav denial test |
| Sensitive finance reads/mutations gated | Restrictive capability policies + transition trigger |
| Access changes audited/attributed | Access audit trail + override attribution triggers |
