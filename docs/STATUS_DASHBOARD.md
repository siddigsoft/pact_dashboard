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

**Last updated:** 2026-05-07 (Phase 1–3 applied; Phase 4 SQL + runbooks complete and ready)
**Current sprint:** Phase 4 · **SQL READY TO APPLY** — two files in order: (1) `20260520_acct_phase4_advanced.sql` (Tax codes, FX rates, period-close log, budget encumbrances) then (2) `accounting_gl_bridges_phase4.sql` (5 bridge triggers: depreciation, allocation, encumbrance, leave liability). Also ready: `20260502_acct_accounting_notifications.sql` (4 accounting alert triggers — apply after Phase 3+).
**Next up:** (1) Apply `20260520_acct_phase4_advanced.sql` → `docs/sql/PHASE4_ADVANCED_CONTROLS_MANUAL_APPLY.md`. (2) Apply `accounting_gl_bridges_phase4.sql` → `docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md`. (3) Apply `20260502_acct_accounting_notifications.sql` → `docs/sql/ACCT_NOTIFICATIONS_MANUAL_APPLY.md`.

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

## ✅ Phase 3 — COMPLETE

EOSB / salary advances / grant expenses / period-close allocation bridges applied.

| Step | File | Status |
|---|---|---|
| 1 | `supabase/migrations/hr_advances_grant_milestones.sql` (prerequisite) | ✅ APPLIED 2026-05-07 |
| 2 | `supabase/migrations/accounting_gl_bridges_phase3.sql` | ✅ APPLIED 2026-05-07 |

---

## ⚡ Phase 4 — next apply (user action, 3 files in order)

### Step 1 — Advanced Controls tables (prerequisite for Phase 4 bridges)

Paste `supabase/migrations/20260520_acct_phase4_advanced.sql` following
`docs/sql/PHASE4_ADVANCED_CONTROLS_MANUAL_APPLY.md`.

Creates: `acct_tax_codes` (6 Sudan codes seeded), `acct_exchange_rates`,
`acct_period_close_log`, **`acct_budget_encumbrances`** (required by bridge trigger),
`acct_get_exchange_rate()` RPC, `acct_tax_summary()` RPC.

### Step 2 — Phase 4 Bridge triggers

Paste `supabase/migrations/accounting_gl_bridges_phase4.sql` following
`docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md`.

5 bridges: depreciation run log, allocation run log, budget encumbrance journal,
leave liability journal, payroll_run_items.user_id column guard.

**Note:** `leave_requests` bridge disabled by default — enable after payroll/EOSB
data is populated. `acct_budget_encumbrances` bridge disabled by default — enable
after COA + GENERAL fund confirmed.

### Step 3 — Accounting notification triggers (apply any time after Phase 2+)

Paste `supabase/migrations/20260502_acct_accounting_notifications.sql` following
`docs/sql/ACCT_NOTIFICATIONS_MANUAL_APPLY.md`.

4 alert triggers: AP invoice overdue, GL bridge failure, grant expiry (≤30 days),
period needs closing. All guarded — re-run after each phase to pick up skipped triggers.

**Phase 4 code status: ✅ Complete**
- All frontend pages built and routed: Tax Management, Multi-Currency / FX Rates, Budget Encumbrance, Period Close, Depreciation Run, Cost Allocation, Grant Tracking, GL Bridge Audit
- All Phase 4 posting templates registered in `postingTemplates.ts`
- All Phase 4 feature flags surfaced in Accounting Settings page
- GL Bridge Audit `TABLE_LABELS` includes all Phase 4 bridge sources (`acct_depreciation_runs`, `acct_budget_encumbrances`, `leave_requests`, `acct_fixed_assets`)
- **Awaiting user to paste 3 SQL files (in order):** `20260520_acct_phase4_advanced.sql` → `accounting_gl_bridges_phase4.sql` → `20260502_acct_accounting_notifications.sql`

### Phase 5 — Grant Tracking / Cost Allocation / Depreciation / Cash Flow Adjustments (apply any time after Phase 3)

Apply in this order:
1. `supabase/migrations/20260502_acct_phase5_expansion.sql` → `docs/sql/PHASE5_EXPANSION_MANUAL_APPLY.md`
   Creates: `acct_grants`, `acct_grant_expenses`, `acct_cost_allocation_rules`, `acct_allocation_runs`, `acct_depreciation_runs`, `acct_cash_flow_adjustments`, `acct_grant_milestones` (via hr_advances_grant_milestones.sql).
2. `supabase/migrations/accounting_gl_bridges_phase5.sql` → `docs/sql/PHASE5_GL_BRIDGES_MANUAL_APPLY.md`
   Adds: 3 bridge triggers (`acct_bridge_cash_flow_adj`, `acct_bridge_grant_status`, `acct_bridge_grant_milestone`), `acct_grant_utilization()` RPC, `v_acct_phase5_coverage` view, 3 feature flags.
3. Re-run `20260502_acct_accounting_notifications.sql` so the grant expiry trigger binds to `acct_grants`.

---

## 1 · Top-line status

| Phase | Title | Status | % done |
|---|---|---|---|
| 0 | HR audit gaps H1–H10 | ✅ DONE — applied to pactdb | 100% |
| 1 | Accounting foundation (GL, posting engine, sanctions, SoD, audit, tests, seed) | ✅ DONE — applied to pactdb | 100% |
| 2 | Wire payroll / wallets / cost subs / advances / scanner to GL | ✅ DONE — applied to pactdb | 100% |
| 3 | EOSB / salary advances / grant expenses / period-close allocation bridges | ✅ DONE — applied to pactdb | 100% |
| 4 | Tax codes + FX rates + depreciation / encumbrance / leave liability bridges + accounting alert notifications | 🟡 IN PROGRESS — All code complete; 3 SQL files ready to apply manually | 80% |
| 5 | Donor / grant management + restricted funds (extended) | 🟡 QUEUED — Expansion SQL + GL bridges SQL both written; apply after Phase 4 | 40% |
| 6 | Banking & Treasury — `acct_bank_accounts`, `acct_bank_statement_lines`, bank recon RPC + GL bridge | 🟡 QUEUED — SQL written; apply after Phase 3 (independent of Phases 4–5) | 40% |
| 7 | Statutory reporting (PIT, social, zakat) | ⚪ QUEUED | 0% |
| 8 | Audit-pack export + external auditor portal | ⚪ QUEUED | 0% |
| 9 | Donor-side reporting + budget-vs-actual variance | ⚪ QUEUED | 0% |
| 10 | Mobile / Flutter parity for finance flows | ⚪ QUEUED | 0% |

Legend: ✅ DONE · 🟢 SIGNED OFF · 🟡 IN PROGRESS · 🟠 BLOCKED · ⚪ QUEUED · 🔴 FAIL

---

## 2 · Sprint ledger

### Phase 0 — HR audit

| ID | Sprint | Status | Apply log |
|---|---|---|---|
| HR-0 | H1–H10 closure | ✅ APPLIED | 2026-04-26 |

### Phase 1 — Accounting foundation

| ID | Sprint | Status | Apply log |
|---|---|---|---|
| 1.1 | GL schema + posting engine + TB RPC + feature flags + Sudan COA seed | ✅ APPLIED | 2026-05-07 |
| 1.2 | Sanctions + SoD foundation + finance audit triggers | ✅ APPLIED | 2026-05-07 |
| 1.3 | Posting-engine unit-test suite + synthetic data generator | ✅ APPLIED | 2026-05-07 |
| 1.F | Phase 1 frontend: COA, journals, trial balance, audit trail, Arabic PDF | ✅ SHIPPED IN CODE | 2026-04-26 |

### Phase 2 — GL Bridge Engine

| ID | Sprint | Status | Apply log |
|---|---|---|---|
| 2.1 | Bridge engine + 7 triggers + P2P tables + recon RPC | ✅ APPLIED | 2026-05-07 |
| 2.F | P2P frontend + GL Bridge dashboard + posting templates | ✅ SHIPPED IN CODE | 2026-05-07 |

### Phase 3 — HR / Grant / Period-Close Bridges

| ID | Sprint | Status | Apply log |
|---|---|---|---|
| 3.PRE | `hr_advances_grant_milestones.sql` prerequisite tables | ✅ APPLIED | 2026-05-07 |
| 3.1 | EOSB accruals + salary advance disbursement/recovery + grant expense bridges + period-close RPC + coverage view | ✅ APPLIED | 2026-05-07 |

### Phase 4 — Tax / FX / Depreciation / Encumbrance / Leave Bridges

| ID | Sprint | Status | Apply log | Files |
|---|---|---|---|---|
| 4.ADV | Advanced Controls tables: `acct_tax_codes`, `acct_exchange_rates`, `acct_period_close_log`, `acct_budget_encumbrances` + `acct_tax_summary()` + `acct_get_exchange_rate()` | 🟡 READY TO APPLY | ⏳ pending | `20260520_acct_phase4_advanced.sql` · `PHASE4_ADVANCED_CONTROLS_MANUAL_APPLY.md` · `PHASE4_ADVANCED_CONTROLS_ROLLBACK.sql` |
| 4.1 | Bridge triggers: depreciation run log + allocation run log + budget encumbrance journal + leave liability journal | 🟡 READY TO APPLY — after 4.ADV | ⏳ pending | `accounting_gl_bridges_phase4.sql` · `PHASE4_GL_BRIDGES_MANUAL_APPLY.md` · `PHASE4_GL_BRIDGES_ROLLBACK.sql` |
| 4.NOT | Accounting alert notifications: AP overdue + GL bridge failure + grant expiry + period-close reminder | 🟡 READY TO APPLY — any time after Phase 3 | ⏳ pending | `20260502_acct_accounting_notifications.sql` · `ACCT_NOTIFICATIONS_MANUAL_APPLY.md` |

### Phase 5 — Grants / Cash Flow / Depreciation GL Bridges

| ID | Sprint | Status | Files |
|---|---|---|---|
| 5.EXP | Phase 5 expansion tables: `acct_grants`, `acct_grant_expenses`, `acct_cost_allocation_rules`, `acct_allocation_runs`, `acct_depreciation_runs`, `acct_cash_flow_adjustments` | 🟡 READY TO APPLY | `20260502_acct_phase5_expansion.sql` · `PHASE5_EXPANSION_MANUAL_APPLY.md` |
| 5.1 | Phase 5 GL bridges: 3 triggers + `acct_grant_utilization()` RPC + `v_acct_phase5_coverage` view + 3 feature flags | 🟡 READY TO APPLY — after 5.EXP | `accounting_gl_bridges_phase5.sql` · `PHASE5_GL_BRIDGES_MANUAL_APPLY.md` |

### Phase 6 — Banking & Treasury

| ID | Sprint | Status | Files |
|---|---|---|---|
| 6.1 | `acct_bank_accounts` + `acct_bank_statement_lines` + `acct_bank_recon_summary()` RPC + GL bridge trigger + 2 feature flags | 🟡 READY TO APPLY — after Phase 3 (independent of 4 & 5) | `accounting_phase6_banking.sql` · `PHASE6_BANKING_MANUAL_APPLY.md` |

### Phases 7–10

Detailed sprint breakdowns live in `docs/PLANNING_INDEX.md`. Unblocked after Phase 4.

---

## 3 · SQL artefact registry

| File | Sprint | Type | Applied to pactdb |
|---|---|---|---|
| `supabase/migrations/20260425_hr_audit_remediation.sql` | HR-0 | Migration | ✅ 2026-04-26 |
| `docs/sql/HR_AUDIT_MANUAL_APPLY.sql` | HR-0 | Runbook | ✅ |
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
| `supabase/migrations/hr_advances_grant_milestones.sql` | 3.PRE | Prerequisite tables | ✅ 2026-05-07 |
| `supabase/migrations/accounting_gl_bridges_phase3.sql` | 3.1 | Migration (910 lines) | ✅ 2026-05-07 |
| `docs/sql/PHASE3_GL_BRIDGES_MANUAL_APPLY.md` | 3.1 | Runbook | n/a |
| `docs/sql/PHASE3_GL_BRIDGES_ROLLBACK.sql` | 3.1 | Rollback | n/a |
| `supabase/migrations/20260520_acct_phase4_advanced.sql` | 4.ADV | Migration (188 lines) — Tax codes, FX rates, period-close log, budget encumbrances | ⏳ pending |
| `docs/sql/PHASE4_ADVANCED_CONTROLS_MANUAL_APPLY.md` | 4.ADV | Runbook | n/a |
| `docs/sql/PHASE4_ADVANCED_CONTROLS_ROLLBACK.sql` | 4.ADV | Rollback | n/a |
| `supabase/migrations/accounting_gl_bridges_phase4.sql` | 4.1 | Migration (459 lines) — 5 bridge triggers | ⏳ pending — after 4.ADV |
| `docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md` | 4.1 | Runbook | n/a |
| `docs/sql/PHASE4_GL_BRIDGES_ROLLBACK.sql` | 4.1 | Rollback | n/a |
| `supabase/migrations/20260502_acct_accounting_notifications.sql` | 4.NOT | Migration (299 lines) — 4 alert triggers (all guarded) | ⏳ pending — apply any time after Phase 3 |
| `docs/sql/ACCT_NOTIFICATIONS_MANUAL_APPLY.md` | 4.NOT | Runbook | n/a |
| `supabase/migrations/20260502_acct_phase5_expansion.sql` | 5.EXP | Migration (131 lines) — Phase 5 tables | ⏳ pending — apply after Phase 4 |
| `docs/sql/PHASE5_EXPANSION_MANUAL_APPLY.md` | 5.EXP | Runbook | n/a |
| `docs/sql/PHASE5_EXPANSION_ROLLBACK.sql` | 5.EXP | Rollback | n/a |
| `supabase/migrations/accounting_gl_bridges_phase5.sql` | 5.1 | Migration — 3 triggers + `acct_grant_utilization()` RPC + coverage view + 3 flags | ⏳ pending — apply after 5.EXP |
| `docs/sql/PHASE5_GL_BRIDGES_MANUAL_APPLY.md` | 5.1 | Runbook | n/a |
| `docs/sql/PHASE5_GL_BRIDGES_ROLLBACK.sql` | 5.1 | Rollback | n/a |
| `supabase/migrations/accounting_phase6_banking.sql` | 6.1 | Migration — `acct_bank_accounts` + `acct_bank_statement_lines` + recon RPC + GL bridge + 2 flags | ⏳ pending — apply any time after Phase 3 |
| `docs/sql/PHASE6_BANKING_MANUAL_APPLY.md` | 6.1 | Runbook | n/a |
| `docs/sql/PHASE6_BANKING_ROLLBACK.sql` | 6.1 | Rollback | n/a |
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
| **Apply `20260520_acct_phase4_advanced.sql`** | ⏳ **NEXT ACTION (1 of 3)** | User | Tax codes, FX rates, budget encumbrances. Runbook: `docs/sql/PHASE4_ADVANCED_CONTROLS_MANUAL_APPLY.md` |
| **Apply `accounting_gl_bridges_phase4.sql`** | ⏳ **NEXT ACTION (2 of 3)** — after 4.ADV | User | 5 bridge triggers. Runbook: `docs/sql/PHASE4_GL_BRIDGES_MANUAL_APPLY.md` |
| **Apply `20260502_acct_accounting_notifications.sql`** | ⏳ **NEXT ACTION (3 of 3)** — any time after Phase 3 | User | 4 accounting alert triggers. Runbook: `docs/sql/ACCT_NOTIFICATIONS_MANUAL_APPLY.md` |
| Phase 4 leave liability bridge — disabled by default | ⚠️ Enable after payroll/EOSB data populated | User | `UPDATE feature_flags SET is_enabled=true WHERE key='acct.bridge.leave_requests';` |
| Phase 4 budget encumbrance bridge — disabled by default | ⚠️ Enable after COA + GENERAL fund confirmed | User | `UPDATE feature_flags SET is_enabled=true WHERE key='acct.bridge.acct_budget_encumbrances';` |
| Phase 2 `payroll_runs` trigger — conditional | ⚠️ May have skipped with NOTICE | Agent/User | Bind manually if needed: `CREATE TRIGGER acct_bridge_payroll_runs AFTER UPDATE ON public.payroll_runs FOR EACH ROW EXECUTE FUNCTION public.acct_trig_payroll_runs();` |
| Phase 3 `payroll_run_items` trigger — conditional | ⚠️ May skip if table absent | Agent/User | Same pattern — bind manually after HR payroll tables confirmed |
| Phase 4 `leave_requests` trigger — conditional | ⚠️ May skip if table absent | Agent/User | Bind manually: `CREATE TRIGGER acct_bridge_leave_requests AFTER UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.acct_trig_leave_requests();` |
| Posting-path SoD enforcement (criterion #4) | 🟠 Deferred to Phase 2 journal draft/approve UI | Agent | Phase 2 ships journal draft/approve UI which passes real `entry_id` to `acct_check_sod` |
| 2FA enforcement on finance roles | 🟠 Manual config | User | Supabase Auth dashboard, not SQL |
| Co-assignees see "Task not found" on `/tasks/:id` | 🟠 Awaiting user to paste `20260425_personal_tasks_co_assignee_rls_v2.sql` | User | Runbook: `docs/sql/PERSONAL_TASKS_CO_ASSIGNEE_RLS_V2_APPLY.md` |
| `task_can_start` RPC missing in pactdb | ✅ Mitigated in code — client-side fallback | Agent | Permanent fix: paste `supabase/migrations/20260426_task_can_start_rpc.sql` |
| Redeploy `send-whatsapp` edge function | 🟠 Awaiting user | User | `supabase functions deploy send-whatsapp` |
| Task Reward Deductions | 🟠 Awaiting user to paste `20260425_task_reward_deductions.sql` + redeploy `credit-task-reward` | User | Runbook: `docs/runbooks/2026-04-25_task_reward_deductions.md` |
