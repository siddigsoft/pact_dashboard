# PACT Accounting Module — §2 Reality-Check Delta Report

**Companion to:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` §2
**Date:** 2026-04-25
**Method:** grep / file inspection over `src/`, `supabase/migrations/`,
`supabase/functions/`.
**Conclusion:** §2 is mostly accurate but contains **8 inaccuracies** that
need patching before Phase 1 starts. None invalidates the plan; all are
small wording / path / status fixes.

---

## Findings summary

| Status | Count |
|---|---|
| Confirmed accurate | 11 |
| **Inaccurate — patch needed** | **8** |
| Confirmed not-yet-existing (correct in plan) | 6 |

---

## 1. Confirmed accurate ✅

| §2 row | Verified |
|---|---|
| **FX rates** — `exchange_rates` + `exchangeRate.service.ts` + `ExchangeRates.tsx` | Files exist at the named paths. |
| **Statutory deductions** — `payroll_statutory_brackets` + `computeStatutoryDeductions` | Both present in `supabase/migrations/20260424_hr_audit_complete.sql` (HR audit H10 just landed) and in `src/pages/PayrollAdmin.tsx`. Sudan PIT brackets seeded. |
| **3-tier approval engine** — `approval-workflows.service.ts` + `approval_workflows` table | Service file present; migration `20260421_phase2_1_approval_workflows.sql` defines the tables. |
| **NotificationTriggerService — email + push channels** | Confirmed `EmailNotificationService` import + `send-fcm-push` invocation. |
| **AI / OCR** — `scan-transaction` Edge Function + `TransactionScanner.tsx` page | Both present (note route is `/admin/transaction-scanner` — see §2 patch). |
| **Recharts wrapper** — `src/components/ui/chart.tsx` | Present. |
| **Webhooks pattern** — `moda-webhook`, `whatsapp-webhook`, `google-calendar-oauth` | Confirmed; **plus 30+ other Edge Functions** including `dispatch-notification`, `send-email`, `send-fcm-push`, `send-whatsapp`, `escalation-check`, `payroll-auto-run`, `daily-digest-cron`, `task-daily-digest`, `task-dependency-reminder-cron` — much richer infrastructure than §2 implies. |
| **Hubs + Departments** — both tables exist | Confirmed `departments_and_employment_records` + `hub_operations_*` migrations. |
| **`hierarchy_audit_log`** — exists | Confirmed `20260426_hierarchy_audit_log.sql`. |
| **Wallets** — `wallets` + `wallet_transactions` | Confirmed `supabase/migrations/create_wallet_tables.sql`. |
| **Reconciliation Dashboard** — page exists | Confirmed `src/pages/ReconciliationDashboard.tsx`. |

---

## 2. Inaccuracies — recommended §2 patches ⚠️

### Patch 1 — `acct_*` tables status

**§2 says:** *"`acct_*` tables — Defined in v1 master plan, partially scaffolded — Phase 1 finalises them."*

**Reality:** `rg "acct_accounts|acct_journal|acct_funds" --type sql` returned **zero hits**. They exist only in v1's prose, not as migrations.

**Patch:** Change row to *"`acct_*` tables — Named in v1 master plan; **not yet created** — Phase 1 introduces them."*

---

### Patch 2 — `ConsolidatedFinancialTab.tsx`

**§2 says:** *"Consolidated financial view — `ConsolidatedFinancialTab.tsx` — Same UI; data source switches to GL once Phase 1 ships."*

**Reality:** `rg -i "ConsolidatedFinancial"` returned no matches. The file does not exist by that name.

**Patch:** Either (a) drop this row, or (b) replace with the actual consolidated-finance entry-point if it exists under a different name. **Action:** ask Finance which page they call "the consolidated view" — likely `FinancialOperations.tsx` (which surfaced in the FX grep).

---

### Patch 3 — Existing report route paths

**§2 says** the deep-link targets are: `/reports/advance-requests`, `/cost-submission-reports`, `/wallet-reports`, `/project-analytics`, `/reconciliation`, `/salary-retainer-report`, `/notification-analytics`.

**Reality** (from `src/App.tsx`):

| §2 path | Actual path | Status |
|---|---|---|
| `/reports/advance-requests` | **`/advance-requests-report`** | ❌ Patch path |
| `/cost-submission-reports` | **`/cost-submission/reports`** | ❌ Patch path |
| `/wallet-reports` | `/wallet-reports` | ✅ |
| `/project-analytics` | **Not found** in `App.tsx` | ❌ Confirm exists or drop |
| `/reconciliation` | **`/reconciliation-dashboard`** | ❌ Patch path |
| `/salary-retainer-report` | `/salary-retainer-report` | ✅ |
| `/notification-analytics` | `/notification-analytics` | ✅ |

**Patch:** Update §2 + §4.13 with the corrected paths. Drop or confirm `/project-analytics`.

---

### Patch 4 — TransactionScanner route

**§2 implies:** `TransactionScanner.tsx` is at the top level.

**Reality:** Route is **`/admin/transaction-scanner`** — admin-scoped.

**Patch:** No content change needed in §2; **§4.14 should note** that AI journal-coding lives behind admin auth — relevant for SoD.

---

### Patch 5 — `partners` flags `is_vendor` / `is_customer` / `is_donor`

**§2 says:** *"Extended with `is_vendor`, `is_customer`, `is_donor` flags. No parallel tables."*

**Reality:** `rg "is_vendor|is_customer|is_donor"` returned **zero hits**. The flags don't exist yet.

**Patch:** Wording fine — the verb "extended" implies "will be extended". To remove ambiguity, change to *"**Will be extended** in Phase 2 with `is_vendor`, `is_customer`, `is_donor` flags. No parallel tables."*

---

### Patch 6 — `pg_graphql` enablement

**§3 says:** *"GraphQL via Supabase's native `pg_graphql` at `/graphql/v1`."*

**Reality:** `rg "pg_graphql"` matches only the plan document itself. The extension is **not yet enabled** on the Supabase project.

**Patch:** Add to **Phase 5 acceptance criteria**: *"Run `CREATE EXTENSION IF NOT EXISTS pg_graphql;` migration; verify `/graphql/v1` responds; expose introspection via API key scope."*

---

### Patch 7 — `branches` and `cost_centers` tables

**§2 says** these don't exist; this is **correct**. But the plan should explicitly note that **Phase 4 introduces both** so the schema-evolution sequence is clear (Phase 1 uses `hubs`/`departments` placeholders, Phase 4 migrates).

**Patch:** Add a one-line "Migration sequence:" note under §4.1 multi-entity bullet.

---

### Patch 8 — Edge Functions list richer than implied

**§2 lists** 3 webhooks (`moda-webhook`, `whatsapp-webhook`, `google-calendar-oauth`).

**Reality:** **34 Edge Functions** exist, including ones directly relevant to accounting:
- `payroll-auto-run` — already automated payroll runner pattern.
- `dispatch-notification` — central notification dispatcher.
- `escalation-check` — already escalates unacted approvals.
- `daily-digest-cron`, `task-daily-digest`, `task-dependency-reminder-cron` — already use `pg_cron`.
- `subscription-renewal-check` — recurring-event pattern proven.
- `contract-expiry-check`, `monitoring-flag-no-response` — threshold-alert pattern proven.

**Patch:** §3 "Background jobs via `pg_cron` + Edge Functions" should add: *"Pattern proven by existing `payroll-auto-run`, `daily-digest-cron`, `escalation-check`, `subscription-renewal-check`, `contract-expiry-check`, `monitoring-flag-no-response` functions — reuse the cron registration pattern."* This **strengthens Phase 1 confidence** because the cron + Edge Function infra is already battle-tested.

---

## 3. Confirmed not-yet-existing (correct in plan) ✅

| Item | §2 status | Verified absent |
|---|---|---|
| GL posting from any operational page | "What does NOT exist" | ✅ no `acct_post_journal` callers |
| `branches` table (legal entities, distinct from hubs) | "What does NOT exist" | ✅ |
| Public REST / GraphQL beyond PostgREST | "What does NOT exist" | ✅ |
| Bank-feed integrations | "What does NOT exist" | ✅ |
| Live mobile-money APIs | "What does NOT exist" | ✅ |
| Fund-restriction model, donor-compliance regime, sanctions screening | "What does NOT exist" | ✅ |

---

## 4. Net impact on Phase 1

| Patch | Phase 1 impact |
|---|---|
| 1 (acct_* status) | **Sharpens scope** — Phase 1 builds them from scratch, no half-done state to inherit. |
| 2 (ConsolidatedFinancialTab path) | **Clarification needed** before Phase 3 — not Phase 1 blocker. |
| 3 (report paths) | Affects **Phase 3** deep-link work, not Phase 1. |
| 4 (TransactionScanner admin-scoped) | **Relevant to SoD matrix** in Phase 1 — confirms AI suggestions go through admin gate. |
| 5 (partners flags wording) | No Phase 1 impact (flags added in Phase 2). |
| 6 (pg_graphql enablement) | **Phase 5** issue, not Phase 1. |
| 7 (branches/cost_centers sequence) | Confirms Phase 1 uses `hubs`/`departments` proxies — no new work. |
| 8 (Edge Functions richer) | **Reduces Phase 1 risk** — cron + Edge Function pattern already proven. |

**Bottom line:** Phase 1 starts on **firmer ground** than §2 implied. The only must-do action is **Patch 1** (clarify `acct_*` is greenfield) and **Patch 4** (lock SoD treatment of the AI scanner). The other six patches are documentation hygiene.

---

## 5. Recommended next action

Apply patches 1, 4, 8 to `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` §2 + §3
**before** kicking off Phase 1. Patches 2, 3, 5, 6, 7 can be batched into a
single doc-tidy PR alongside the Phase 1 sprint design.

---

*End of delta report.*
