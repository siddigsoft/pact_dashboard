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

**Last updated:** 2026-05-07 (Phase 1 + Phase 2 applied to pactdb; Phase 3 SQL + runbooks ready to apply)
**Current sprint:** Phase 3 · **SQL READY TO APPLY** — `supabase/migrations/accounting_gl_bridges_phase3.sql` (910 lines) + runbook `docs/sql/PHASE3_GL_BRIDGES_MANUAL_APPLY.md` + rollback all complete. Bridges: EOSB monthly provisions, salary advance disbursements & recoveries, grant programme expenses, payroll→advance auto-deduction. Also adds `run_period_close_allocation` RPC, `get_gl_bridge_log` RPC, and `acct_gl_bridge_coverage` view.
**Next up:** (1) Apply prerequisite `hr_advances_grant_milestones.sql` if not yet in pactdb. (2) Paste `accounting_gl_bridges_phase3.sql` following `docs/sql/PHASE3_GL_BRIDGES_MANUAL_APPLY.md`.

---

## ✅ Phase 1 — COMPLETE

All 3 SQL sprints applied to pactdb. 10/10 acceptance criteria 🟢 in pactdb.

| Step | File | Status |
|---|---|---|
| 1 | `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` + seed | ✅ APPLIED 2026-05-07 |
| 2 | `supabase/migrations/20260508_acct_phase1_sprint1_2.sql` | ✅ APPLIED 2026-05-07 |
| 3 | `supabase/migrations/20260515_acct_phase1_sprint1_3.sql` | ✅ APPLIED 2026-05-07 |

## ✅ Phase 2 — COMPLETE

GL Bridge Engine + P2P tables applied to pactdb. 7 triggers live.

| Step | File | Status |
|---|---|---|
| 1 | `supabase/migrations/20260520_acct_phase2_gl_bridges.sql` | ✅ APPLIED 2026-05-07 |

---

## ⚡ Phase 3 — next apply (user action)

**Step 1 — prerequisite (if not yet applied):**
Paste `supabase/migrations/hr_advances_grant_milestones.sql` first. It creates
`hr_salary_advances`, `hr_salary_advance_recoveries`, `acct_grant_expenses`,
`acct_allocation_runs`, `acct_depreciation_runs`. It is idempotent — safe to run even if
some tables already exist.

**Step 2 — Phase 3:**
Paste `supabase/migrations/accounting_gl_bridges_phase3.sql` following
`docs/sql/PHASE3_GL_BRIDGES_MANUAL_APPLY.md`.

**Note on `payroll_run_items` guard:** same pattern as Phase 2. If HR payroll tables are
absent, Parts J (advance-deduction columns) and the `acct_payroll_advance_recovery` trigger
are gracefully skipped with RAISE NOTICE and can be bound manually later.

---

## 1 · Top-line status

| Phase | Title | Status | % done |
|---|---|---|---|
| 0 | HR audit gaps H1–H10 | ✅ DONE — applied to pactdb | 100% |
| 1 | Accounting foundation (GL, posting engine, sanctions, SoD, audit, tests, seed) | ✅ DONE — applied to pactdb | 100% |
| 2 | Wire payroll / wallets / cost subs / advances / scanner to GL | ✅ DONE — applied to pactdb | 100% |
| 3 | EOSB / salary advances / grant expenses / period-close allocation bridges | 🟡 IN PROGRESS — SQL written + reviewed, runbook ready; awaiting user to apply Phase 3 migration | 50% |
| 4 | Depreciation run / allocation run / budget encumbrance / leave liability bridges | 🟡 IN PROGRESS — SQL written + reviewed, runbook ready; awaiting Phase 3 first | 30% |
| 5 | Donor / grant management + restricted funds (extended) | ⚪ QUEUED | 0% |
| 6 | Sanctions / AML deep-screening + fuzzy ranking | ⚪ QUEUED | 0% |
| 7 | Statutory reporting (PIT, social, zakat) | ⚪ QUEUED | 0% |
| 8 | Audit-pack export + external auditor portal | ⚪ QUEUED | 0% |
| 9 | Donor-side reporting + budget-vs-actual variance | ⚪ QUEUED | 0% |
| 10 | Mobile / Flutter parity for finance flows | ⚪ QUEUED | 0% |

Legend: ✅ DONE · 🟢 SIGNED OFF · 🟡 IN PROGRESS · 🟠 BLOCKED · ⚪ QUEUED · 🔴 FAIL

---

## 2 · Sprint ledger

### Phase 0 — HR audit (already in pactdb)

| ID | Sprint | Status | Files |
|---|---|---|---|
| HR-0 | H1–H10 closure | ✅ APPLIED | `20260425_hr_audit_remediation.sql` · `HR_AUDIT_MANUAL_APPLY.sql` · `HR_AUDIT_FIX_PATCH.sql` |

### Phase 1 — Accounting foundation

| ID | Sprint | Status | Apply log | Files |
|---|---|---|---|---|
| 1.1 | GL schema + posting engine + TB RPC + feature flags + Sudan COA seed | 🟢 SIGNED OFF | ✅ APPLIED 2026-05-07 | `20260501_acct_phase1_sprint1_1.sql` · runbook · rollback · seed |
| 1.2 | Sanctions + SoD foundation + finance audit triggers | 🟢 SIGNED OFF | ✅ APPLIED 2026-05-07 | `20260508_acct_phase1_sprint1_2.sql` · runbook · rollback |
| 1.3 | Posting-engine unit-test suite (20 tests) + synthetic data generator | 🟢 SIGNED OFF | ✅ APPLIED 2026-05-07 | `20260515_acct_phase1_sprint1_3.sql` · runbook · rollback |
| 1.F | Phase 1 frontend: COA, journals, trial balance, audit trail, Arabic PDF | ✅ SHIPPED | 2026-04-26 | n/a (frontend) |

### Phase 2 — GL Bridge Engine

| ID | Sprint | Status | Apply log | Files |
|---|---|---|---|---|
| 2.1 | Bridge engine + 7 triggers (payroll, withdrawals, ops costs, down payments, salary advances, wallet rewards, P2P) + P2P tables (PR→PO→GRN→Invoice→Payment→Cheque) + recon RPC + bridge log view | 🟢 SIGNED OFF | ✅ APPLIED 2026-05-07 | `20260520_acct_phase2_gl_bridges.sql` · `PHASE2_GL_BRIDGES_MANUAL_APPLY.md` · `PHASE2_GL_BRIDGES_ROLLBACK.sql` |
| 2.F | P2P frontend + GL Bridge dashboard + posting templates | ✅ SHIPPED | 2026-05-07 | n/a (frontend) |

### Phase 3 — HR / Grant / Period-Close Bridges

| ID | Sprint | Status | Apply log | Files |
|---|---|---|---|---|
| 3.PRE | Prerequisite tables — `hr_salary_advances`, `hr_salary_advance_recoveries`, `acct_grant_expenses`, `acct_allocation_runs`, `acct_depreciation_runs` | 🟡 READY TO APPLY | ⏳ pending | `hr_advances_grant_milestones.sql` |
| 3.1 | EOSB accruals + salary advance disbursement + recovery + grant expense bridges + period-close allocation RPC + `get_gl_bridge_log` RPC + `acct_gl_bridge_coverage` view | 🟡 READY TO APPLY | ⏳ pending — apply after 3.PRE | `accounting_gl_bridges_phase3.sql` · `PHASE3_GL_BRIDGES_MANUAL_APPLY.md` · `PHASE3_GL_BRIDGES_ROLLBACK.sql` |

### Phase 4 — Depreciation / Encumbrance / Leave Bridges

| ID | Sprint | Status | Apply log | Files |
|---|---|---|---|---|
| 4.1 | Depreciation run log + allocation run log + budget encumbrance journal + leave liability journal | 🟡 READY TO APPLY — apply after Phase 3 | ⏳ pending | `accounting_gl_bridges_phase4.sql` · `PHASE4_GL_BRIDGES_MANUAL_APPLY.md` · `PHASE4_GL_BRIDGES_ROLLBACK.sql` |

### Phases 5–10

Detailed sprint breakdowns live in `docs/PLANNING_INDEX.md`. Unblocked after Phase 4.

---

## 3 · SQL artefact registry

| File | Sprint | Type | Applied to pactdb |
|---|---|---|---|
| `supabase/migrations/20260425_hr_audit_remediation.sql` | HR-0 | Migration | ✅ 2026-04-26 |
| `docs/sql/HR_AUDIT_MANUAL_APPLY.sql` | HR-0 | Bundle runbook | ✅ |
| `docs/sql/HR_AUDIT_FIX_PATCH.sql` | HR-0 | Hot-patch | ✅ |
| `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` | 1.1 | Migration | ✅ 2026-05-07 |
| `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md` | 1.1 | Runbook | n/a |
| `docs/sql/PHASE1_SPRINT1_1_ROLLBACK.sql` | 1.1 | Rollback | n/a |
| `docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql` | 1.1 | Seed | ✅ 2026-05-07 |
| `supabase/migrations/20260508_acct_phase1_sprint1_2.sql` | 1.2 | Migration | ✅ 2026-05-07 |
| `docs/sql/PHASE1_SPRINT1_2_MANUAL_APPLY.md` | 1.2 | Runbook | n/a |
| `docs/sql/PHASE1_SPRINT1_2_ROLLBACK.sql` | 1.2 | Rollback | n/a |
| `supabase/migrations/20260515_acct_phase1_sprint1_3.sql` | 1.3 | Migration | ✅ 2026-05-07 |
| `docs/sql/PHASE1_SPRINT1_3_MANUAL_APPLY.md` | 1.3 | Runbook | n/a |
| `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql` | 1.3 | Rollback | n/a |
| `supabase/migrations/20260520_acct_phase2_gl_bridges.sql` | 2.1 | Migration (1 465 lines) | ✅ 2026-05-07 |
| `docs/sql/PHASE2_GL_BRIDGES_MANUAL_APPLY.md` | 2.1 | Runbook | n/a |
| `docs/sql/PHASE2_GL_BRIDGES_ROLLBACK.sql` | 2.1 | Rollback | n/a |
| `supabase/migrations/hr_advances_grant_milestones.sql` | 3.PRE | Prerequisite tables (idempotent) | ⏳ pending |
| `supabase/migrations/accounting_gl_bridges_phase3.sql` | 3.1 | Migration (910 lines) | ⏳ pending — after 3.PRE |
| `docs/sql/PHASE3_GL_BRIDGES_MANUAL_APPLY.md` | 3.1 | Runbook | n/a |
| `docs/sql/PHASE3_GL_BRIDGES_ROLLBACK.sql` | 3.1 | Rollback | n/a |
| `supabase/migrations/accounting_gl_bridges_phase4.sql` | 4.1 | Migration (446 lines) | ⏳ pending — after 3.1 |
| `docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md` | 4.1 | Runbook | n/a |
| `docs/sql/PHASE4_GL_BRIDGES_ROLLBACK.sql` | 4.1 | Rollback | n/a |
| `supabase/migrations/20260425_personal_tasks_co_assignee_rls_v2.sql` | Hot-patch | RLS rewrite | ⏳ pending (apply any time) |
| `supabase/migrations/20260409_timesheet_module.sql` | Timesheet | Migration | ✅ 2026-04-26 |
| `supabase/migrations/20260426_timesheet_entries_insert_status_guard.sql` | Timesheet hot-patch | RLS hardening | ✅ 2026-04-26 |

> When the user applies a file in pactdb, change the column to ✅ + the date they ran it.

---

## 4 · Phase 1 acceptance-criteria matrix

| # | Criterion | Status |
|---|---|---|
| 1 | Any service can post a balanced journal via `acct_post_journal` | 🟢 in pactdb |
| 2 | Trial balance RPC returns balanced fund-aware totals | 🟢 in pactdb |
| 3 | Sanctions block prevents posting to a sanctioned partner | 🟢 in pactdb |
| 4 | SoD matrix prevents same user posting + approving same journal | 🟡 PARTIAL — posting-path enforcement deferred to Phase 2 draft/approve UI |
| 5 | Feature flags gate every accounting subsystem | 🟢 in pactdb |
| 6 | Posting-engine unit-test suite passes (≥ 95% branch coverage) | 🟢 in pactdb |
| 7 | Synthetic data generator produces a reproducible test ledger | 🟢 in pactdb |
| 6b | Idempotency on posting (race-safe) | 🟢 in pactdb |
| 7b | Period close prevents posting to closed periods | 🟢 in pactdb |
| 8 | Functional currency + FX coherence per line | 🟢 in pactdb |
| 9 | Bilingual EN/AR with Arabic jsPDF font registered | 🟢 in pactdb |
| 10 | Audit trail backed by triggers on funds, accounts, periods, flags | 🟢 in pactdb |

---

## 5 · Open / blocked / risk register

| Item | State | Owner | Notes |
|---|---|---|---|
| **Apply `hr_advances_grant_milestones.sql` to pactdb** | ⏳ **NEXT ACTION (1 of 2)** | User | Prerequisite for Phase 3. Idempotent — safe to run even if some tables exist. |
| **Apply Phase 3 GL bridges to pactdb** | ⏳ **NEXT ACTION (2 of 2)** | User | `accounting_gl_bridges_phase3.sql` — follow `docs/sql/PHASE3_GL_BRIDGES_MANUAL_APPLY.md` |
| **Apply Phase 4 GL bridges to pactdb** | ⏳ QUEUED — after Phase 3 | User | `accounting_gl_bridges_phase4.sql` — follow `docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md` |
| Phase 2 `payroll_runs` trigger — conditional | ⚠️ May have skipped with NOTICE | Agent/User | Bind manually if needed: `CREATE TRIGGER acct_bridge_payroll_runs AFTER UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.acct_trig_payroll_runs();` |
| Phase 3 `payroll_run_items` trigger — conditional | ⚠️ May skip with NOTICE if table absent | Agent/User | Same pattern — bind manually after HR payroll tables confirmed |
| Phase 4 leave liability bridge — disabled by default | ⚠️ Enable manually after payroll/EOSB data populated | User | `UPDATE feature_flags SET is_enabled=true WHERE key='acct.bridge.leave_requests';` |
| Phase 4 budget encumbrance bridge — disabled by default | ⚠️ Enable after COA + GENERAL fund confirmed | User | `UPDATE feature_flags SET is_enabled=true WHERE key='acct.bridge.acct_budget_encumbrances';` |
| Posting-path SoD enforcement (criterion #4) | 🟠 Deferred to Phase 2 journal draft/approve UI | Agent | Phase 2 ships journal draft/approve UI which passes real `entry_id` to `acct_check_sod` |
| 2FA enforcement on finance roles | 🟠 Manual config | User | Supabase Auth dashboard, not SQL |
| Co-assignees see "Task not found" on `/tasks/:id` | 🟠 Awaiting user to paste `20260425_personal_tasks_co_assignee_rls_v2.sql` | User | Runbook: `docs/sql/PERSONAL_TASKS_CO_ASSIGNEE_RLS_V2_APPLY.md` |
| `task_can_start` RPC missing in pactdb | ✅ Mitigated in code — client-side fallback via `getBlockingTasks()` | Agent | Permanent fix: paste `supabase/migrations/20260426_task_can_start_rpc.sql` |
| Redeploy `send-whatsapp` edge function | 🟠 Awaiting user | User | `supabase functions deploy send-whatsapp` |
| Task Reward Deductions | 🟠 Awaiting user to paste `20260425_task_reward_deductions.sql` + redeploy `credit-task-reward` | User | Runbook: `docs/runbooks/2026-04-25_task_reward_deductions.md` |
