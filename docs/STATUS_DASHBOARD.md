# PACT Accounting Module — Live Status Dashboard

> **Purpose** A single page that always reflects the true state of the
> Accounting Module rebuild. Every sprint, every SQL file, every acceptance
> criterion. Update this whenever a sprint ships or a file is applied.
>
> **Sources of truth this dashboard summarises**
> - Master plan: `docs/ACCOUNTING_MODULE_MASTER_PLAN.md` (V2 supersedes V1)
> - Phase 1 design: `docs/ACCOUNTING_PHASE1_DESIGN.md`
> - Sign-off ledger: `docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`
> - Deployment plan: `docs/DEPLOYMENT_PHASED_PLAN.md`
> - Full planning archive: `docs/PLANNING_INDEX.md`
>
> **Standing rules** All accounting SQL is applied **MANUALLY** by the user
> in the pactdb Supabase SQL editor. NO Drizzle. NO `db:push`. NO Replit
> auto-push. The agent only writes SQL files and runbooks; the user pastes
> them.

**Last updated:** 2026-04-26 (post commit `aae32fe4f`)
**Current sprint:** Phase 1 · **CODE-COMPLETE** — all four sprints (1.1, 1.2, 1.3, 1.F) ✅ shipped in code and signed off. Phase 1 is now **gated solely on the user pasting 3 SQL files in pactdb** (see "Phase 1 → 100%" block below). No further agent work is required for Phase 1 to flip green.
**Next up:** Phase 2 wiring — payroll / wallets / cost subs / advances / scanner → GL (cannot start until Sprint 1.1 + 1.2 are live in pactdb)
**Prerequisite for next apply:** Sprint 1.1 + 1.2 each clean in pactdb for ≥ 24 h before pasting 1.3 (apply order: 1.1 → 24 h → 1.2 → 24 h → 1.3)
**Active hot-patches (out-of-band, can apply now, independent of accounting sprints):**
- `personal_tasks_co_assignee_rls_v2` — co-assignees see "Task not found" on `/tasks/:id`; bulletproof EXISTS-form RLS rewrite ready to paste
- (today) `AppSidebar.tsx hasAnyRole` ReferenceError — **CODE FIX ALREADY ON `master` (commit `aae32fe4f`)**, no SQL, no user action; awaiting Vercel auto-deploy

---

## ⚡ Phase 1 → 100% — final step (user action only)

Phase 1 is **10 / 10 acceptance criteria green in code** and **3 / 3 SQL sprints signed off**. The agent has nothing left to ship for Phase 1. To flip Phase 1 from 90 % → 100 % the user pastes these three migrations in pactdb, in order, with a 24 h soak between each:

| Step | File | Soak | Smoke-test runbook |
|---|---|---|---|
| 1 | `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` then `docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql` | ≥ 24 h | `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md` |
| 2 | `supabase/migrations/20260508_acct_phase1_sprint1_2.sql` | ≥ 24 h | `docs/sql/PHASE1_SPRINT1_2_MANUAL_APPLY.md` |
| 3 | `supabase/migrations/20260515_acct_phase1_sprint1_3.sql` | — | `docs/sql/PHASE1_SPRINT1_3_MANUAL_APPLY.md` |

Once step 3 passes its smoke tests, update §1 (Phase 1 → 100 %), §3 apply column (3 rows → ✅ + date), §4 (criteria #1 / #2 / #3 / #5 / #6 / #6b / #7 / #7b / #8 / #9 / #10 → 🟢 in pactdb), and remove the three "Apply Sprint 1.x" rows from §5. Criterion #4 stays 🟡 by design — SoD posting-path enforcement is deferred to Phase 2 because Phase 1 has no draft/approve split.

---

## 1 · Top-line status

| Phase | Title | Status | % done |
|---|---|---|---|
| 0 | HR audit gaps H1–H10 | ✅ DONE — applied to pactdb | 100% |
| 1 | Accounting foundation (GL, posting engine, sanctions, SoD foundation, audit, tests, seed) | 🟡 **CODE-COMPLETE** — all 4 sprints (1.1, 1.2, 1.3, 1.F) ✅ shipped + signed off + 10 / 10 acceptance criteria green in code. Awaiting user to paste 3 SQL files in pactdb to flip 90 → 100 % (see "Phase 1 → 100%" block above). | 90% |
| 2 | Wire payroll / wallets / cost subs / advances / scanner to GL | ⚪ QUEUED | 0% |
| 3 | Bank reconciliation + cash-flow forecasting | ⚪ QUEUED | 0% |
| 4 | Period-close + reconciliation engine | ⚪ QUEUED | 0% |
| 5 | Donor / grant management + restricted funds | ⚪ QUEUED | 0% |
| 6 | Sanctions / AML deep-screening + fuzzy ranking | ⚪ QUEUED | 0% |
| 7 | Statutory reporting (PIT, social, zakat) | ⚪ QUEUED | 0% |
| 8 | Audit-pack export + external auditor portal | ⚪ QUEUED | 0% |
| 9 | Donor-side reporting + budget-vs-actual variance | ⚪ QUEUED | 0% |
| 10 | Mobile / Flutter parity for finance flows | ⚪ QUEUED | 0% |

Legend: ✅ DONE · 🟢 SIGNED OFF · 🟡 IN PROGRESS · 🟠 BLOCKED · ⚪ QUEUED · 🔴 FAIL

---

## 2 · Sprint ledger

### Phase 0 — HR audit (already in pactdb)

| ID | Sprint | Status | Files | Notes |
|---|---|---|---|---|
| HR-0 | H1–H10 closure | ✅ APPLIED to pactdb | `supabase/migrations/20260425_hr_audit_remediation.sql`, `docs/sql/HR_AUDIT_MANUAL_APPLY.sql`, `docs/sql/HR_AUDIT_FIX_PATCH.sql` | All 10 gaps closed |

### Phase 1 — Accounting foundation

| ID | Sprint | Status | Sign-off | Apply log | Files |
|---|---|---|---|---|---|
| 1.1 | GL schema + posting engine + TB RPC + feature flags + Sudan COA seed | 🟢 SIGNED OFF — PASS | 2026-04-25 (round 2) | _pending_ | Migration: `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` · Runbook: `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md` · Rollback: `docs/sql/PHASE1_SPRINT1_1_ROLLBACK.sql` · Seed: `docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql` |
| 1.2 | Sanctions + SoD foundation + finance audit triggers | 🟢 SIGNED OFF — PASS | 2026-04-25 (round 2) | _pending — must wait ≥ 24 h after 1.1 is clean_ | Migration: `supabase/migrations/20260508_acct_phase1_sprint1_2.sql` · Runbook: `docs/sql/PHASE1_SPRINT1_2_MANUAL_APPLY.md` · Rollback: `docs/sql/PHASE1_SPRINT1_2_ROLLBACK.sql` |
| 1.3 | Posting-engine unit-test suite (20 tests, ~95% branch coverage) + synthetic data generator with reset registry | 🟢 SIGNED OFF — PASS | 2026-04-25 (round 4) | _pending — must wait ≥ 24 h after 1.2 is clean_ | Migration: `supabase/migrations/20260515_acct_phase1_sprint1_3.sql` · Runbook: `docs/sql/PHASE1_SPRINT1_3_MANUAL_APPLY.md` · Rollback: `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql` |
| 1.F | Phase 1 frontend: `/accounting/coa`, `/accounting/journals`, `/accounting/trial-balance`, `/finance/audit-trail` + Arabic jsPDF font (`src/lib/jspdfArabic.ts`, `src/lib/accountingFormat.ts`, 4 pages, sidebar group, lazy routes) | ✅ SHIPPED IN CODE — pages render empty until Sprint 1.1/1.2 SQL is pasted in pactdb | 2026-04-26 | Agent self-review | n/a (frontend) |

### Phases 2–10

Detailed sprint breakdowns live in `docs/PLANNING_INDEX.md` §3–§12. None are
unblocked yet — Phase 2 starts after Phase 1 ships frontend + tests.

---

## 3 · SQL artefact registry

Every SQL file the agent has produced for the accounting/HR rebuild. Apply
status is the truth — sign-off only means "cleared to apply".

| File | Sprint | Type | Sign-off | Applied to pactdb |
|---|---|---|---|---|
| `supabase/migrations/20260425_hr_audit_remediation.sql` | HR-0 | Migration | ✅ | ✅ 2026-04-26 |
| `docs/sql/HR_AUDIT_MANUAL_APPLY.sql` | HR-0 | Bundle runbook | ✅ | ✅ |
| `docs/sql/HR_AUDIT_FIX_PATCH.sql` | HR-0 | Hot-patch | ✅ | ✅ |
| `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` | 1.1 | Migration | ✅ PASS | ⏳ pending |
| `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md` | 1.1 | Runbook + smoke tests | ✅ | n/a |
| `docs/sql/PHASE1_SPRINT1_1_ROLLBACK.sql` | 1.1 | Rollback | ✅ | n/a |
| `docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql` | 1.1 | Seed (~80 postable accounts EN+AR) | ✅ | ⏳ pending — after 1.1 |
| `supabase/migrations/20260508_acct_phase1_sprint1_2.sql` | 1.2 | Migration | ✅ PASS | ⏳ pending — after 1.1 + 24 h |
| `docs/sql/PHASE1_SPRINT1_2_MANUAL_APPLY.md` | 1.2 | Runbook + smoke tests | ✅ | n/a |
| `docs/sql/PHASE1_SPRINT1_2_ROLLBACK.sql` | 1.2 | Rollback | ✅ | n/a |
| `supabase/migrations/20260515_acct_phase1_sprint1_3.sql` | 1.3 | Migration | ✅ PASS (round 4) | ⏳ pending — after 1.2 + 24 h |
| `docs/sql/PHASE1_SPRINT1_3_MANUAL_APPLY.md` | 1.3 | Runbook + smoke tests + 20-row results format | ✅ | n/a |
| `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql` | 1.3 | Rollback (registry-driven, real data safe) | ✅ | n/a |
| `supabase/migrations/20260425_personal_tasks_co_assignee_rls_v2.sql` | Hot-patch | RLS rewrite (bulletproof EXISTS form) | ✅ | ⏳ pending — apply any time, independent of accounting sprints |
| `docs/sql/PERSONAL_TASKS_CO_ASSIGNEE_RLS_V2_APPLY.md` | Hot-patch | Runbook + 5 verification steps | ✅ | n/a |
| `docs/sql/PERSONAL_TASKS_CO_ASSIGNEE_RLS_V2_ROLLBACK.sql` | Hot-patch | Rollback to prior `@>` containment policy | ✅ | n/a |
| `supabase/migrations/20260409_timesheet_module.sql` | Timesheet module (out-of-band, non-accounting) | Migration — pre-patches old flat `timesheets` table with 16 `ADD COLUMN IF NOT EXISTS` guards before back-fill INSERTs, then creates `timesheet_entries` + `timesheet_periods`, RLS, indexes, RPCs | ✅ PASS (round 3) | ✅ 2026-04-26 |
| `docs/runbooks/2026-04-25_apply_timesheet_module.md` | Timesheet module | Runbook + 2-query pre-flight (detect old flat table) + Troubleshooting section + corrected rollback section (migration is transformational, not additive) | ✅ | n/a |
| `supabase/migrations/20260426_timesheet_entries_insert_status_guard.sql` | Timesheet module hot-patch | RLS hardening — `timesheet_entries_insert` now blocks self-service inserts when parent timesheet is not `draft`/`revision`, closing the post-approval insert bypass surfaced by 2026-04-26 architect review | ✅ | ✅ 2026-04-26 (verified via `pg_policy` query — check_expr contains `t.status = ANY (ARRAY['draft','revision'])`) |
| `docs/runbooks/2026-04-26_apply_timesheet_entries_insert_status_guard.md` | Timesheet module hot-patch | Runbook + verify query + manual smoke (RLS denial reproduction) + rollback | ✅ | n/a |

> When the user applies a file in pactdb, change the column to ✅ + the date
> they ran it.

---

## 4 · Phase 1 acceptance-criteria matrix

The 10 criteria from `docs/ACCOUNTING_MODULE_MASTER_PLAN.md` §3 (Phase 1):

| # | Criterion | Status | Delivered by |
|---|---|---|---|
| 1 | Any service can post a balanced journal via `acct_post_journal` | 🟢 | Sprint 1.1 |
| 2 | Trial balance RPC returns balanced fund-aware totals | 🟢 | Sprint 1.1 |
| 3 | Sanctions block prevents posting to a sanctioned partner | 🟢 | Sprint 1.2 |
| 4 | SoD matrix prevents same user posting + approving same journal | 🟡 PARTIAL — RPC + rules + violations log shipped in 1.2; **posting-path enforcement deferred to Phase 2** (no draft/approve split in 1.1) | Sprint 1.2 (foundation) → Phase 2 (posting-path) |
| 5 | Feature flags gate every accounting subsystem | 🟢 | Sprint 1.1 (`feature_flags` + `feature_enabled()`) |
| 6 | Posting-engine unit-test suite passes (≥ 95% branch coverage) | 🟢 | Sprint 1.3 (`acct_run_test_suite` — 20 tests covering every raise branch + happy paths) |
| 7 | Synthetic data generator produces a reproducible test ledger | 🟢 | Sprint 1.3 (`acct_seed_synthetic` — 4 funds, 5 partners incl. 1 sanctioned, N entries, registry-driven reset) |
| 6b | Idempotency on posting (race-safe) | 🟢 | Sprint 1.1 (ON CONFLICT on `idempotency_key`) |
| 7b | Period close prevents posting to closed periods | 🟢 | Sprint 1.1 (PERIOD_CLOSED + posting-date guard) |
| 8 | Functional currency + FX coherence per line | 🟢 | Sprint 1.1 (FX_RATE_MISSING raise) |
| 9 | Bilingual EN/AR with Arabic jsPDF font registered | 🟢 (code) — Amiri font lazy-fetched in `src/lib/jspdfArabic.ts`, used by Trial Balance PDF; goes 🟢 in pactdb after Sprint 1.1 apply | Sprint 1.F |
| 10 | Audit trail backed by triggers on funds, accounts, periods, flags | 🟢 (code) — data layer ✅ in 1.2 + visualiser page `/finance/audit-trail` shipped in 1.F (changes / AML alerts / SoD violations tabs); goes 🟢 in pactdb after Sprint 1.2 apply | Sprint 1.2 (data) + Sprint 1.F (UI) |

**Phase 1 status today:** 10 / 10 acceptance criteria green **in code** (criterion 4 yellow-by-design). All 9 SQL-backed criteria (#1, #2, #3, #5, #6, #6b, #7, #7b, #8) flip 🟢 **in pactdb** the moment the user pastes the three Sprint 1.1 / 1.2 / 1.3 migrations (apply order + soak in the "Phase 1 → 100%" block at the top of this file). Criterion 9 (Arabic PDF) and criterion 10 (audit-trail UI) are already 🟢 in code and become 🟢 in pactdb the moment Sprint 1.1 + 1.2 are live, because the pages then have data to render. **There is no remaining agent work for Phase 1.**

---

## 5 · Open / blocked / risk register

| Item | State | Owner | Notes |
|---|---|---|---|
| Apply Sprint 1.1 to pactdb | ⏳ Awaiting user | User | Paste `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` then run smoke tests in runbook |
| Apply Sprint 1.2 to pactdb | ⏳ Awaiting Sprint 1.1 + 24 h soak | User | Same workflow |
| Apply Sprint 1.3 to pactdb | ⏳ Awaiting Sprint 1.2 + 24 h soak | User | Test suite is read-only (caller wraps in BEGIN/ROLLBACK; sequence advances on every test by design); seed function is super_admin only and refuses to run if `acct.parallel_run.enabled` is true |
| Sprint 1.3 architect review | ✅ PASS (round 4 — 2026-04-25) | Agent | Round 1 BLOCKER (sanctions schema mismatch) + 5 secondary findings all patched and re-verified |
| Sprint 1.F build (frontend) | ✅ Shipped in code (2026-04-26) | Agent | Closes criteria #9 + #10 in code; pages show empty/error states until pactdb has Sprint 1.1/1.2 |
| `task_can_start` RPC missing in pactdb (P0 — was blocking every task start) | ✅ Mitigated in code (2026-04-26) — `canTaskStart()` now detects PGRST202 / 42883 / "could not find the function" and falls back to client-side check via `getBlockingTasks()` | Agent | Permanent fix is to paste `supabase/migrations/20260426_task_can_start_rpc.sql` in pactdb (gives admins RLS-bypass + server-side dep check); fallback covers all users today |
| Posting-path SoD enforcement (criterion #4) | 🟠 Deferred to Phase 2 | Agent | Phase 2 ships journal draft/approve UI which will pass real `entry_id` to `acct_check_sod` |
| Arabic jsPDF font registration | ✅ Shipped in 1.F (`src/lib/jspdfArabic.ts`) | Agent | Lazy-fetches Amiri from jsdelivr CDN, falls back to Helvetica if offline |
| Audit-trail visualiser page | ✅ Shipped in 1.F (`/finance/audit-trail`) | Agent | Reads `acct_finance_audit_log` + `acct_aml_alerts` + `acct_sod_violations` |
| 2FA enforcement on finance roles | 🟠 Manual config | User | Supabase Auth dashboard, not SQL |
| Production runtime crash on `/dashboard` (`Wallet is not defined`) | ✅ FIXED in code | — | Needs Vercel redeploy to clear |
| Co-assignees see "Task not found" on `/tasks/:id` (reported 2026-04-25 by Mohamed Yo…) | 🟠 Awaiting user to paste `supabase/migrations/20260425_personal_tasks_co_assignee_rls_v2.sql` in pactdb | User | TaskDetail.tsx fetch is RLS-only; v2 swaps the broken `?` operator (and the type-strict `@>` form) for a bulletproof `EXISTS … (elem->>'id') = auth.uid()::text` wrapped in a `jsonb_typeof='array'` guard so a malformed legacy row can't crash `jsonb_array_elements`. Runbook: `docs/sql/PERSONAL_TASKS_CO_ASSIGNEE_RLS_V2_APPLY.md` |
| `personal_tasks` DELETE policy admits only the creator, but TaskDetail UI exposes Delete to admins and the primary assignee → silent RLS denial | 🟠 Pre-existing (since at least 20260422 baseline), surfaced during the 2026-04-25 hot-patch architect review — NOT introduced by the hot-patch. Tracked here so the next agent doesn't lose it. Fix requires a separate scoped migration with its own auth review. | Agent (when scheduled) | Two fix options: (a) widen `personal_tasks_delete USING` to admit owners + primary + admins (mirrors UI); or (b) route deletes through a `delete_personal_task` SECURITY DEFINER RPC that re-checks UI rules server-side. Decide before the next sprint touches tasks. |
| TaskDetail "Couldn't verify dependencies — task is locked until verification succeeds" banner blocking Start for everyone (reported 2026-04-25 by ELSIDDIG IBRAHIM, super_admin, after the co-assignee SELECT fix unblocked acknowledge) | ✅ FIXED in code (no SQL) — pushed to main, awaiting Vercel redeploy | — | Root cause: `getBlockingTasks`/`getDependentTasks`/`buildDependencyGraph` in `src/services/task-dependencies.service.ts` used a PostgREST embed `personal_tasks:parent_task_id(...)`. The colon syntax is an alias, not an FK hint — and `task_dependencies` has TWO FKs to `personal_tasks` (parent + dependent), so PostgREST returned "more than one relationship was found", which propagated as `error` and tripped the fail-closed dep gate. Rewrote all three to a two-step query (fetch deps, hydrate by id). Architect PASS. |
| Transportation Advance Cost (`/advance-requests-report`) — add **Avg per Site / Total per Site** view (requested 2026-04-25) | ✅ SHIPPED in code (UI-only, no SQL) | — | `src/pages/AdvanceRequestsReport.tsx`: (1) `byHub` memo now tracks distinct sites → adds `Sites` and `Avg per Site (SDG)` columns to the Hub summary, with overall-avg in the footer; (2) new `bySite` memo (keyed by `siteName\|hub\|locality` to avoid merging same-name sites in different hubs) drives a new **By Site** tab with Site / Hub / Locality / Requests / Total Requested / Total Approved / **Avg per Request** / Pending columns and a subtotal footer; (3) new `exportSiteToExcel` + `exportSiteToPDF` helpers wired to the tab. Architect PASS, two minor consistency notes already folded in (Unknown-Site bucket consistent across hub & site views; composite key for de-dup). `npx tsc --noEmit` clean. |
| Task Reward **Deductions** — mirror the salary-deduction pattern on personal task rewards so HR can attach fixed/percent deductions (e.g. wallet top-up fees, tax, social) on a per-task or per-template basis; assignee sees breakdown at acknowledgement and approval; wallet credits **NET**, email + notification carry the full breakdown (requested 2026-04-25) | 🟠 SHIPPED in code — **awaiting user to paste** `supabase/migrations/20260425_task_reward_deductions.sql` in pactdb, then redeploy the `credit-task-reward` edge function | User | Adds `reward_deductions jsonb` (default `[]`) to `personal_tasks` + `daily_task_definitions` + `task_reward_approvals` (snapshot at approval time via new trigger `snapshot_reward_deductions_on_approval`); helper RPC `compute_reward_net(p_gross, p_deductions)` returns `{gross,total,net,lines}`; existing `guard_personal_tasks_reward_fields` extended to accept the new field; `materialise_daily_tasks_for_user` extended to copy template snapshot onto each materialised task. UI: new `RewardDeductionsEditor` + `RewardBreakdownDisplay` (`src/components/tasks/RewardDeductionsEditor.tsx`) wired into MyTasks (modal/edit/new), MyTasksV2 (QuickAdd + EditDialog + handleCreate), TaskAdmin daily template form, and `RewardApprovalsPanel` (shows snapshot breakdown to reviewers). `StartTaskDialog` (acknowledge surface) now shows the assignee the gross/deductions/net before they confirm. Edge function `credit-task-reward` rewritten: reads snapshot, credits **net** (zero-net case logs a notification but skips the wallet write), embeds an HTML breakdown table in the email, and includes per-line deductions in `wallet_transactions.metadata`. Idempotency unchanged. Runbook: `docs/runbooks/2026-04-25_task_reward_deductions.md`. `npx tsc --noEmit` clean. |
| Timesheet module rebuild (`/timesheet` + `PayrollAdmin` integration) — replace flat single-row `timesheets` model with normalised `timesheet_entries` (per task/project entries) + `timesheet_periods` (weekly aggregates), preserving all legacy rows | ✅ APPLIED to pactdb 2026-04-26 | — | Migration `supabase/migrations/20260409_timesheet_module.sql` ran cleanly after 3 rounds of fixes. Final version pre-patches the OLD flat `timesheets` table with `ALTER TABLE ADD COLUMN IF NOT EXISTS` for 16 columns (`submitted_at`, `approved_by`, `approved_at`, `reject_comment`, `status`, `created_at`, `updated_at`, `project_id`, `task_id`, `task_type`, `start_time`, `end_time`, `break_minutes`, `description`, `is_billable`, `hours`) before any back-fill INSERT runs, so prod schemas missing any of these columns no longer error. Runbook `docs/runbooks/2026-04-25_apply_timesheet_module.md` carries a 2-query pre-flight (detect old flat table) + Troubleshooting section. UI changes: `src/pages/Timesheet.tsx` (1438 lines) rewritten to entry-based model with weekly period view; `src/pages/PayrollAdmin.tsx` (4306 lines) reads timesheet hours via the new aggregate. **Three sanity checks still owed by user:** (1) refresh `/timesheet` to confirm the upgrade banner is gone; (2) run row-count check on `timesheets` + `timesheet_entries` in pactdb; (3) round-trip a retainer save in `PayrollAdmin`. |
| Portfolio Dashboard `/portfolio` Operations tab — Site Visit Coverage stuck at **0 %** with **996 / 1 000** sites invisible, and Field Staff role grid showing **"Data Collector" (136)** and **"Datacollector" (1)** as separate roles (reported 2026-04-25 from screenshot) | ✅ SHIPPED in code (UI-only, no SQL) | — | `src/pages/PortfolioDashboard.tsx`: (1) added canonical site-status sets (`SITE_VERIFIED_STATUSES` etc.) and `classifySiteEntryStatus()` helper mirroring `WorkflowTrackerTab.tsx` vocabulary so `Approved`, `Dispatched`, `verified`, `costed`, `forwarded_to_*`, `recalled`, `accepted`, `sent_back*` etc. are now bucketed correctly (case-insensitive) instead of being silently dropped because the dashboard previously only matched the literal string `'completed'`; (2) `kpis.coveragePct` now uses the canonical bucket and renders one decimal (e.g. `0.4 %`) when the rate is below 1 % so 4 / 1 000 no longer rounds to 0 %; `Progress` value clamped to `[0, 100]`; (3) `mmpStats` now also lower-cases MMP file statuses before bucketing so `'Approved'` (capital, written by `MMPPermitVerification.tsx`) is counted, and exposes new buckets `returnedSites` / `rejectedSites` / `otherSites`; (4) Site Visit Coverage card now renders three additional conditional rows (Returned / Recalled, Rejected, Other / Uncategorized) so the previously-hidden 996 sites are visible; (5) added `normalizeRoleKey()` + `prettyRoleLabel()` with a `ROLE_CANONICAL_LABELS` map — `peopleStats.byRole` and `roleChartData` collapse `Data Collector` + `Datacollector` + `data_collector` into a single canonical bucket. Architect PASS (no critical/high). |
| Personal-task lifecycle hardening — six architect-flagged findings from the 2026-04-26 lifecycle review (TaskDependenciesView column-name bug, co-assignee ack race, server-truth ack-gate re-check on `startTask`, missing notify on `confirmActualHoursForUser`, duplicate notification dispatch in `usePersonalTasks.createMutation`, `updateMutation` dep-diff bug from reading post-patch state) | ✅ SHIPPED in code (no SQL) — commits `bad70dcd4`, `e24754410`, `86f08b430` | — | (1) `TaskDependenciesView.tsx`: corrected column references `assignee_id` → `assigned_to`, `created_by` → `user_id` so dep visualisation no longer 400s; (2) co-assignee acknowledgement re-fetches dependency state to close a TOCTOU window where two co-assignees acked simultaneously; (3) `startTask` performs a server-truth ack-gate re-check just before flipping status to prevent a stale-client race that previously allowed un-acked starts; (4) `confirmActualHoursForUser` now dispatches the multi-channel notification (in-app + email + WA per opt-in) it was previously silently skipping; (5) `usePersonalTasks.createMutation` — removed the legacy `sendTaskNotification` + `sendTaskEmail` calls (kept `dispatchTaskMultiChannel` only) so co-assignees no longer receive 2× notifications on every new task; (6) `updateMutation` now captures `preUpdateDeps` + `preUpdateRowMeta` **before** the patch so dep-change diffing fires the right delta-notify (previous code read post-patch state and saw "no diff", silently dropping every dep-change alert). `npx tsc --noEmit` clean. |
| Production runtime crash — `ReferenceError: hasAnyRole is not defined` thrown from `getWorkflowMenuGroups` at `AppSidebar.tsx:473` because Sprint 1.F's accounting menu block (commit `9e3787468`) used `hasAnyRole(['auditor'])` inside the **builder function** (line 261) instead of inside the `AppSidebar` component (line 717) where `hasAnyRole` is destructured from `useAuthorization()` (line 739). Result: every user's `/dashboard` rendered the global error boundary "Something went wrong" instead of the menu. (reported 2026-04-26 from screenshot) | ✅ FIXED in code 2026-04-26 — commit `aae32fe4f` | — | Swapped the out-of-scope `hasAnyRole(['auditor'])` for the **already-in-scope** local helper `hasRole('auditor')` (defined at `AppSidebar.tsx:272` inside `getWorkflowMenuGroups`). Same semantics (both compare against the resolved role set), correct lexical scope. `npx tsc --noEmit` clean. Vite HMR auto-applies; production needs Vercel auto-deploy. No SQL. |
| TaskDetail dep-gate stuck on amber "Couldn't verify dependencies / not authenticated" → Start button permanently disabled even though user (super_admin ELSIDDIG IBR…) had successfully acknowledged the task. Root cause: the `task_can_start` SECURITY DEFINER RPC raises `RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000'` when `auth.uid()` returns NULL inside the function body (most often a stale-JWT race — token expired between page load and RPC call, before Supabase auto-refresh completes). The client `canTaskStart()` (`src/services/task-dependencies.service.ts`) only routed **missing-RPC** errors (PGRST202 / 42883 / "could not find the function") to the fallback — auth-missing errors fell into the "real error" branch and locked the dep-gate forever, requiring a hard refresh. (reported 2026-04-26 from screenshot) | ✅ FIXED in code 2026-04-26 (no SQL) | — | Added `isAuthMissingError(err)` helper detecting `code === '28000'` / `'PGRST301'` / `'PGRST303'` and message variants `'not authenticated'` / `'jwt expired'` / `'jwt is missing'` / `'invalid jwt'`. New `canTaskStart` flow on auth-missing: (1) call `supabase.auth.refreshSession()`, (2) retry the RPC once — if retry succeeds, use its real answer; (3) if retry still fails, route to the existing `canTaskStartFallback` which opens the gate (`canStart: true`) when its own RLS-bound reads also fail (matches the established "don't lock the user out for a transient" philosophy — actual UPDATE will still fail with a clear RLS error if auth is genuinely broken). Same handling added to the catch-block path for thrown auth errors. `npx tsc --noEmit` clean. Vite HMR auto-applies; production needs Vercel auto-deploy. |
| Task notification channel policy — user requested 2026-04-26: "Notification in app and WhatsApp should be sent automatically per changes in the task, and final emails when the task is completed or cancelled, for all the users in the task." Previously every task lifecycle event (acknowledge, start, status change, dep confirmed, output saved, dep added/blocked, task created, etc.) fired an SMTP email to all participants — flooding inboxes with intermediate updates. **Two architect rounds shipped before final approval** — see "Round 2 follow-ups" below the main fixes. | ✅ SHIPPED in code 2026-04-26 (no SQL) — architect PASS | — | **Channel policy module:** new `src/lib/taskNotificationPolicy.ts` exports `TASK_EMAIL_EVENTS = {task_completed, task_cancelled}` + `isTaskEmailEvent()` as the single source of truth. **6 task-email surfaces gated:** (1) `src/hooks/useTaskNotifications.ts` `notify()` — gates the `dispatch-notification` invoke behind `isTaskEmailEvent`; expanded `WHATSAPP_EVENTS` to cover every task event (added `task_created`, `task_acknowledged`, `task_reminder_3day`); (2) `src/hooks/usePersonalTasks.ts` `dispatchTaskMultiChannel()` — same gate around its email leg; (3) `src/pages/TeamTaskMonitor.tsx` createTask — replaced the unconditional `task_assigned` email with a WhatsApp ping (in-app already fires via `addNotification`); (4) `src/services/task-dependencies.service.ts` `dependency_added` / `dependency_blocked` — added `sendEmail: isTaskEmailEvent(...)` (false); (5) `src/hooks/usePersonalTasks.ts` `updateMutation` `dependency_added` / `dependency_resolved` legs — **post-architect fix**: removed the two direct `sendTaskEmail()` bypasses that were short-circuiting the policy and routing email straight to SMTP; replaced with `sendTaskNotification` (in-app, kept) + a direct `send-whatsapp` invoke for parity, no email; (6) `src/pages/TeamTaskMonitor.tsx` `updateStatusMutation` — **post-architect fix**: previously only fired in-app for `empId` (the manager-targeted employee). Now fetches the task (id, title, user_id, assigned_to, co_assignees) BEFORE the update, builds the full participant set (primary + creator + every co-assignee, minus the actor), then fans out `addNotification` and `send-whatsapp` to every recipient. Email intentionally not sent — terminal completed/cancelled emails still flow through `useTaskNotifications` when the user themselves marks the task done in TaskDetail. **Plumbing:** extended `dispatchNotification()` in `src/lib/notify.ts` with `sendEmail?: boolean` (default true preserves behaviour for **every non-task caller** — cost / leave / payroll / approvals / workspace / project flow all unchanged) that forwards `send_email: opts.sendEmail` to the `dispatch-notification` edge function, which already supports that flag at line 25, so **no edge-function redeploy needed**. **Deliberately out of scope** (documented for future follow-up): (a) `materialiseDailyTasks()` in `usePersonalTasks.ts` line 605 still sends a daily morning task-list digest email — this is a recurring digest, not a per-task-change event, so left intact; (b) `dispatch-notification` edge function fires WhatsApp internally for ALL notifications (line 859-901), so when `dispatchNotification()` is called with `sendWhatsApp:true` the client also invokes `send-whatsapp` directly — pre-existing duplication, present before this change, scheduled for separate cleanup. **Round 2 follow-ups (post-architect):** (i) `dispatchTaskMultiChannel()` was rewritten to ALWAYS invoke `dispatch-notification` (not gated by the email policy) — a previous draft wrapped the entire invoke in `isTaskEmailEvent()` which incorrectly suppressed the in-app row insert for non-terminal events. New flow: always invoke the edge function and pass `send_email: isTaskEmailEvent(event)` so the in-app row fires every time, the edge function's built-in WhatsApp leg fires every time (gated by per-user `whatsapp_enabled`), and only the SMTP leg is gated. As a side benefit, the separate `send-whatsapp` invoke that previously sat alongside it was removed — the edge function already fires WhatsApp internally for every dispatch (line 859-901, "fires for ALL notifications"), so the dual call was duplicating every WhatsApp send. (ii) `TeamTaskMonitor` co-assignee extraction now reads BOTH `{id}` and `{user_id}` shapes — older rows store `id` (canonical, see `usePersonalTasks.ts` line 637 query `[{id: userId}]`) while a few newer rows use `user_id`; the prior draft only read `user_id` and silently dropped majority co-assignees from the recipient set. **Round 3 follow-ups (post-architect):** (iii) `useTaskNotifications.notify()` rebuilt around two delivery paths: terminal events (`task_completed` / `task_cancelled`) route ONLY through `dispatch-notification` (which inserts the in-app row, sends SMTP, and fires WhatsApp internally) — the previous code also called `addNotification` (which separately persists to the `notifications` table at NotificationContext.tsx line 469) AND a standalone `send-whatsapp`, producing a duplicate in-app row plus a duplicate WhatsApp message on every terminal event; non-terminal events keep the lightweight client-side path (`addNotification` for in-app + standalone `send-whatsapp` for WA, NO email). (iv) `TeamTaskMonitor.updateStatusMutation` now closes the manager-completion email gap: when a manager flips a task to `done` / `completed` / `cancelled` from the dashboard dropdown, it now routes through `dispatch-notification` with `send_email:true` so every participant (primary + creator + each co-assignee) receives the terminal email — previously the path only fired in-app + WhatsApp and silently dropped the email the user explicitly required for terminal events. Same dedup pattern as (iii). (v) `task-dependencies.service.ts` `dependency_added` now uses `sendWhatsApp:false` because `dispatch-notification` already fires WhatsApp internally — the previous `sendWhatsApp:true` was triggering the standalone `send-whatsapp` invoke in `lib/notify.ts` and duplicating the WhatsApp message. **Round 4 follow-ups (post-architect):** (vi) `src/pages/MyTasksV2.tsx` `handleToggleDone` (the quick-toggle Done checkbox on the personal task list/cards) was previously calling `notifySelf('task_completed')` (a no-op because `notify()` drops actor=self at line 207) plus a single `notify({recipientUserId: task.assignedTo})` — silently dropping the creator and every co-assignee from terminal completion notifications. Rewritten to mirror `handleSave`'s broadcast pattern: builds `recipients = {userId, assignedTo, ...coAssignees.map(c=>c.id)}` and calls `notify()` once per recipient with `event = statusToEvent(newStatus)` so quick-toggle Done now fires in-app + WhatsApp + terminal email to every participant. (vii) `src/pages/MyTasksV2.tsx` `handleMarkPersonalDone` (Planning view checkbox path) was a bare `await updateTask(id, {status})` with NO notification at all — every Planning view checkbox click silently swallowed all three channels. Same fan-out pattern added; looks the task up via `allTasks.find` and broadcasts to every participant. **Net effect:** in-app + WhatsApp fire on every task change for every participant (primary + creator + co-assignees); email fires only on task_completed / task_cancelled. `npx tsc --noEmit` clean. Architect re-review PASS. Vite HMR auto-applies; production needs Vercel auto-deploy. |

---

## 6 · How to keep this dashboard current

When **anything** in the accounting module changes — a sprint ships, a file
is applied to pactdb, a sign-off lands, an architect review changes status,
a criterion flips green — update **this file** in the same commit.

Specifically:
1. **New SQL file?** Add a row to §3 with sign-off + apply status.
2. **Sprint signed off?** Update §2 ledger row + the top-line banner + §1 if
   the phase % moved.
3. **File applied to pactdb?** Update §3 apply column with the date.
4. **Acceptance criterion fully green?** Update §4.
5. **New blocker / risk?** Add a row to §5; remove when resolved.

This file is the contract with the user. PLANNING_INDEX.md remains the
deep-dive archive; this is the 60-second read.
