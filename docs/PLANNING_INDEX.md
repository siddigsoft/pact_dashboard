# PACT Planning Master Index

_Last assembled: 2026-04-25._

This file is a one-stop view of every active planning document for the PACT
Accounting & HR work. Each document below appears in full, in the recommended
reading order. The originals still live as separate files (see the **File**
line in each section header) — this index is regenerated, not authoritative,
so any edits should be made in the source files.

---

## Reading order at a glance

| # | Document | What it is | File | Status |
|---|---|---|---|---|
| 1 | Accounting Module Master Plan — **Consolidated (V2)** | The single source of truth for the Accounting & Finance module: scope, phases, schemas, RLS, RPCs, UI, deployment plan. | `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` | **ACTIVE — primary plan** |
| 2 | §2 Reality-Check Delta Report | Audit of what V1 promised vs. what actually exists in code/DB; produced the H1–H10 HR gap list that drove this sprint. | `docs/ACCOUNTING_REALITY_CHECK_DELTA.md` | **ACTIVE — closes ↔ V2 §2** |
| 3 | Phase 1 Sprint Design Doc | Concrete design for Phase 1 (GL foundations: chart_of_accounts, journals, ledgers, period close). Implements V2 §3.1. | `docs/ACCOUNTING_PHASE1_DESIGN.md` | **ACTIVE — next sprint** |
| 4 | Open Questions Sign-off Sheet | Outstanding decisions blocking design freeze (currency model, fiscal year, multi-entity, etc.) with proposed defaults. | `docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md` | **OPEN — needs user sign-off** |
| 5 | PACT Notion-Style Block Editor — Saved Plan | Plan for the in-app rich block editor used by accounting notes, JE memos, and reporting narratives. | `docs/BLOCK_EDITOR_PLAN.md` | **ACTIVE — supporting** |
| 6 | PACT Accounting & Finance Module — Master Plan (V1) | Original master plan. Superseded by V2 above; kept for historical reference and traceability. | `docs/ACCOUNTING_MODULE_MASTER_PLAN.md` | **SUPERSEDED by #1** |
| 7 | Accounting — Reporting, Charting & Projection Extension | Draft tab in your workspace describing the reporting / charting / projection layer. **Not yet saved as a file** in the repo. | _(unsaved)_ | **DRAFT — not in repo** |

## Cross-cutting state right now (2026-04-25)

> **Open Questions Sign-off:** ✅ **FULLY SIGNED OFF — 2026-04-25.** All six
> roles have signed (Country Director, Finance Manager, HR Director,
> Engineering Lead, Internal Audit Lead, Donor Compliance Officer). Phases
> 1–9 scope-confirmed. Three info-needed values (D3 NICRA rate, D4 active
> grants, E5 pension provider) are tracked for Phase 2.5 kick-off — they do
> **not** block Phase 1.
>
> **Phase 1 GL Foundations build:** ACTIVE. Sprint 1.1 manual-SQL bundle
> shipped — `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` +
> `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md`. Apply via the pactdb SQL
> editor in the order documented in the runbook.

> 📊 **For the 60-second status read, see `docs/STATUS_DASHBOARD.md`.** This file is the deep archive; the dashboard is the always-current scorecard.

- HR Audit Phase 0 (gaps **H1–H10**) — **DONE in code & DB**; all migrations applied to `pactdb`.
- Reviewer fixes for H1/H6/H8 — **DONE** (`supabase/migrations/20260425_hr_audit_remediation.sql`).
- Production runtime crash on `/dashboard` (`Wallet is not defined`) — **FIXED** in `src/components/AppSidebar.tsx`; needs a Vercel redeploy.
- Manual SQL bundle for HR audit is at `docs/sql/HR_AUDIT_MANUAL_APPLY.sql`.
- **Phase 1 Sprint 1.1 (GL schema + posting engine + TB RPC + feature flags):** ✅ **SIGNED OFF — PASS (2026-04-25).** Architect review cleared (round 2 PASS after authz / idempotency / posting-date patches). Cleared to apply to pactdb. Sign-off log: `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md` §Sign-off log.
- **Phase 1 Sprint 1.2 (sanctions + SoD foundation + finance audit triggers):** ✅ **SIGNED OFF — PASS (2026-04-25).** Architect round 1 FAIL → 4 patches → round 2 PASS. Ships: sanctions block in posting RPC + acct_aml_alerts, acct_check_sod RPC + 4 seed rules + violations log, generic acct_finance_audit_log + triggers on funds/accounts/periods/feature_flags. **Posting-path SoD enforcement is explicitly Phase 2** (no draft/approve split in Sprint 1.1). Files: `supabase/migrations/20260508_acct_phase1_sprint1_2.sql`, `docs/sql/PHASE1_SPRINT1_2_MANUAL_APPLY.md`, `docs/sql/PHASE1_SPRINT1_2_ROLLBACK.sql`. Cleared to apply to pactdb after Sprint 1.1 has been clean for ≥ 24 h.
- **Phase 1 Sprint 1.3 (posting-engine unit-test suite + synthetic data generator):** ✅ **SIGNED OFF — PASS (2026-04-25, round 4).** Architect round 1 returned 1 BLOCKER (sanctions inserts/queries used non-existent columns; Sprint 1.2 schema is `list, external_id, full_name, aliases, country, match_hash, raw, loaded_at`) + 3 MAJOR (T17 missing `count(*)=1` assertion, "read-only" claim overstated re sequence advancement, runbook hardcoded 3-funds/31-markers ignoring GENERAL-fund branching) + 2 MINOR (T03/T04 not exception-safe, rollback errored on missing marker table). All patched: sanctions schema fixed in both seed + T18 (`v_sanc_row_id` captured via RETURNING), T17 now asserts `count(*)=1`, T03/T04 hardened with original-state capture before mutation + outer EXCEPTION + unconditional restore via coalesce, runbook switched to formula-driven totals (`funds + entries + partners + sanctions`) listing all 4 valid scenarios (28/29/31/32), rollback gained `to_regclass` guards on every table for true no-op safety, S6 cleanup split into S6a (data-only wipe with TRUNCATE) and S6b (full rollback). Round 4 PASS. Ships: `acct_run_test_suite` (20 tests covering every raise branch + happy paths + idempotency replay + sanctions block + SoD same-entry + trial-balance balanced), `acct_seed_synthetic` (3-or-4 funds, 0-or-2 partners incl. 1 sanctioned, N balanced entries, registry-driven `p_reset` that never touches real data, `acct.parallel_run.enabled` production guardrail), `acct_synthetic_marker` registry. Files: `supabase/migrations/20260515_acct_phase1_sprint1_3.sql`, `docs/sql/PHASE1_SPRINT1_3_MANUAL_APPLY.md`, `docs/sql/PHASE1_SPRINT1_3_ROLLBACK.sql`. Cleared to apply to pactdb after Sprint 1.2 has been clean for ≥ 24 h.
- **Phase 1 Sprint 1.F (frontend pages + Arabic jsPDF font):** queued — closes Phase 1 acceptance criteria #9 + #10.

---

## Table of contents

1. [Accounting Module Master Plan — Consolidated (V2)](#doc-1)
2. [§2 Reality-Check Delta Report](#doc-2)
3. [Phase 1 Sprint Design Doc](#doc-3)
4. [Open Questions Sign-off Sheet](#doc-4)
5. [Block Editor — Saved Plan](#doc-5)
6. [Accounting Master Plan V1 (superseded)](#doc-6)
7. [Reporting / Charting / Projection Extension (draft — not in repo)](#doc-7)



<a id="doc-1"></a>
---

# 1. Accounting Module Master Plan — Consolidated (V2)

> **File:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md`  
> **Status:** ACTIVE — primary plan, supersedes V1.

# PACT Accounting & Finance Module — Master Plan **(Consolidated)**

**Status:** Final draft for sign-off · **Owner:** Finance + Engineering
**Last updated:** 2026-04-25
**Supersedes:** `docs/ACCOUNTING_MODULE_MASTER_PLAN.md` (v1) and the previous
addendum-stack edition of this file (v2 + v3 + v4 + v5).
**Target compliance:** Sudan + East African Community (Kenya, Uganda, Tanzania,
Rwanda, Ethiopia, South Sudan); donor regimes (USAID, EU PRAG, UN OCHA, FCDO,
Global Fund); IFRS for SMEs + nonprofit fund-accounting overlay.

This document is reorganised by **topic, not by version**. Five planning
passes have been collapsed into one canonical plan. Where a decision was made
during a particular pass it's stated here as the decision, not as "v3 says…".

---

## Table of contents

1. Executive summary
2. What already exists in PACT *(reality check)*
3. System overview & architecture
4. Functional scope
5. Non-functional requirements
6. Phased rollout
7. Open questions still pending sign-off
8. Out of scope
9. Companion documents

---

## 1. Executive summary

A full audit-grade accounting module for a humanitarian / development field-ops
platform, built **on top of the existing PACT stack** (React + Supabase) — not
replacing it. The module:

- Uses **double-entry posting** with idempotency-keyed RPCs.
- Adopts **fund accounting** (with-restriction vs without-restriction) from day
  one, alongside corporate-style P&L / Balance Sheet — **dual-render**.
- Is **multi-entity, multi-currency, bilingual EN/AR + RTL, offline-safe**.
- Reuses PACT's existing **3-tier approval engine, RLS, hubs / departments,
  notifications (in-app + email + WhatsApp + push), exchange-rate service, OCR
  pipeline, jsPDF / xlsx exports, audit log**.
- Adds **donor-compliance, sanctions/AML screening, P2P cycle, AR cycle,
  inventory & GIK, lease accounting, multi-signatory treasury, internal audit
  & risk, e-filing, ESG tagging, crisis-mode workflows, full reporting
  layer**.
- Ships **public REST + GraphQL** (via Supabase `pg_graphql`) + outbound
  webhooks.
- Uses a **bounded-contexts** model inside one Supabase project — not
  microservices.

Headline constraints, all **non-negotiable**:

- **Fund-restriction model in COA from day 1** — retrofitting later across
  years of journals is cripplingly expensive.
- **Sanctions screening before the first journal posts** — no payment goes
  out unscreened.
- **Segregation of Duties enforced at the database**, not by hiding UI.
- **Two new roles only** — `accountant` and `auditor`. Everything else reuses
  existing PACT roles.
- **Existing PACT report pages stay** — new `/reports/*` index pages
  deep-link to them rather than replace.

---

## 2. What already exists in PACT *(reality check)*

The codebase already contains a lot of finance plumbing the plan reuses:

| Capability | Where it lives today | How the plan reuses it |
|---|---|---|
| **FX rates** | `exchange_rates` table, `src/services/exchangeRate.service.ts`, `ExchangeRates.tsx` | Wired straight into the posting engine; no redesign. |
| **Statutory deductions** (Sudan PIT, Social Insurance, Zakat) | `payroll_statutory_brackets` + `computeStatutoryDeductions()` in `PayrollAdmin.tsx` (HR audit H10) | Becomes the first payroll → GL bridge in Phase 2. |
| **3-tier approval engine** | `src/services/approval-workflows.service.ts` (+ `approval_workflows`, `task_approvals`, `task_approval_records`) | Reused for every accounting approval; no new framework. |
| **Notifications service** | `NotificationTriggerService` → in-app + email (IONOS SMTP) + WhatsApp (Wasender) + push (FCM). **No SMS today.** | Reused for accounting notifications + threshold alerts. |
| **AI / OCR** | `scan-transaction` edge function (Gemini 2.0 Flash → Groq fallback), `TransactionScanner.tsx` | Feeds AI-suggested journal lines for accountant review. |
| **Pseudo-ledger** | `wallets` + `wallet_transactions` (`supabase/migrations/create_wallet_tables.sql`) | **Stays** as a subordinate sub-ledger reconciling daily to a `Wallet Liabilities` GL account. Not absorbed. |
| **Consolidated financial view** | `FinancialOperations.tsx` *(current best-guess; finance to confirm exact page; no `ConsolidatedFinancialTab.tsx` exists)* | Same UI; data source switches to GL once Phase 1 ships. |
| **Reconciliation dashboard** | `ReconciliationDashboard.tsx` (route `/reconciliation-dashboard`) | Same UI; gets a real GL behind it. |
| **Existing partial finance features** | Cash-flow forecaster, duplicate-payment detector, period-close, budget-vs-actual (per `replit.md`) | Extended, not reintroduced. |
| **Recharts** | `src/components/ui/chart.tsx` | Chart engine for the new reporting layer. |
| **Edge Functions infrastructure** | 34 functions including `moda-webhook`, `whatsapp-webhook`, `google-calendar-oauth`, `payroll-auto-run`, `dispatch-notification`, `escalation-check`, `daily-digest-cron`, `subscription-renewal-check`, `contract-expiry-check`, `monitoring-flag-no-response`, `task-daily-digest`, `task-dependency-reminder-cron`, `send-email`, `send-fcm-push`, `send-whatsapp` | Cloned for bank-feed / payroll / procurement / e-filing webhooks. **Cron + Edge Function pattern already battle-tested** — Phase 1 reuses, no new framework. |
| **Hubs + Departments** | `hubs`, `departments` tables (migrations `001_hub_operations_tables.sql`, `20260331_departments_and_employment_records.sql`) | Used as **branch / cost-center proxies** in Phases 1–3; real `branches` and (optionally) `cost_centers` arrive in Phase 4. |
| **CRM Partners** | `partners` table | **Will be extended in Phase 2** with `is_vendor`, `is_customer`, `is_donor` flags (not present today). No parallel tables. |
| **Existing report pages** | `/advance-requests-report`, `/cost-submission/reports`, `/wallet-reports`, `/reconciliation-dashboard`, `/salary-retainer-report`, `/notification-analytics` (verified in `App.tsx`); `/project-analytics` *to be confirmed* | **Deep-linked** from the new `/reports/*` index pages. Not replaced. |
| **Audit infrastructure** | `hierarchy_audit_log` (migration `20260426_hierarchy_audit_log.sql`) + per-table audit triggers | Layer the audit-trail visualiser on top, no new audit table. |
| **Permissions** | Resource-action permission model | Add only `accountant` + `auditor`; map everything else to existing roles (`super_admin`, `admin`, `hr`, `finance`, hub-manager). |
| **`acct_*` tables** | Named in v1 master plan; **not yet created** (greenfield — `rg "acct_accounts\|acct_journal\|acct_funds" --type sql` returns zero hits) | Phase 1 introduces them from scratch. |

What does **not** exist anywhere yet:

- GL posting from any operational page (zero pages currently emit journals).
- Real `branches` (legal entities) — distinct from hubs.
- Public REST / GraphQL surface beyond Supabase's auto-generated PostgREST.
- Bank-feed integrations (Plaid, Yodlee, local equivalents).
- Live mobile-money APIs (M-Pesa, Airtel, Sudan EBS) — only references in code.
- Fund-restriction model, donor-compliance regime, sanctions screening.
- P2P cycle (PR / PO / GRN / 3-way match), invoices, credit notes,
  customer / vendor statements.
- Inventory, commodities, gifts-in-kind, vouchers.
- Lease accounting (IFRS 16), capital projects (CIP / WIP).
- Multi-signatory bank-account configuration, cheque register, bulk
  disbursement files.
- Internal audit module, risk register, whistleblower channel.
- Government e-filing connectors (iTax, EFRIS, VFD, EBM, ZRA).
- ESG / SDG tagging.
- Crisis / emergency-mode bypass workflows.
- AI journal coding suggestions, anomaly detection, accountant chat.
- FX revaluation at period close + intercompany clearing.
- Audit-pack ZIP generator, sensitivity-analysis engine, threshold-alert
  rule engine, report scheduling + server-side chart rendering.

---

## 3. System overview & architecture

- **Bounded contexts** inside one Supabase project — Ledger, AR, AP, Banking,
  Tax, Reporting. Each owns its tables, RPCs, RLS policies. **Not
  microservices.**
- **GraphQL** via Supabase's native `pg_graphql` at `/graphql/v1` — no
  parallel Apollo / Relay server.
- **REST** via Supabase PostgREST plus versioned `/api/v1/...` Edge Functions
  for cases the defaults don't cover.
- **Auth** via Supabase JWT with per-scope OAuth2 tokens for external
  consumers (`journals:read`, `journals:post`, `coa:admin`, `reports:read`).
- **Posting engine** is a single RPC `acct_post_journal(p_payload jsonb,
  p_idempotency_key text)`. Idempotent, balance-validated (debits = credits
  at line level), immutable lines, contra-journal reversal pattern.
- **Storage shape** — every monetary column is a pair: `original_amount` +
  `original_currency` alongside `functional_amount` + `functional_currency`.
- **Database design rules from day one**:
  - `branch_id` / `hub_id`, `fund_id`, `restriction_type`, `function`
    (program / M&G / fundraising), `project_id`, `grant_id`, `cost_center_id`
    (= `department_id` proxy in Phase 1) on every journal line.
  - Partition `acct_journal_lines` by fiscal period.
  - Composite indexes for `(account_id, period_id)`, `(branch_id, period_id)`,
    `(project_id, period_id)`, `(grant_id, period_id)`, `(idempotency_key)`.
  - Materialised views for TB / P&L / BS / Statement of Activities — refreshed
    on journal post via NOTIFY/LISTEN.
- **Background jobs** via `pg_cron` + Edge Functions: period close, FX
  revaluation, year-end rollover, scheduled email reports, sanctions
  re-screening, recurring journal generation, sub-ledger reconciliation.
  **Pattern proven by existing `payroll-auto-run`, `daily-digest-cron`,
  `escalation-check`, `subscription-renewal-check`, `contract-expiry-check`,
  `monitoring-flag-no-response`, `task-daily-digest`,
  `task-dependency-reminder-cron` Edge Functions** — reuse the cron
  registration pattern; no new framework.
- **Offline behaviour** — journal-bearing actions taken offline (cash
  advances, expense claims) queue with idempotency keys; conflict resolution
  is last-writer-wins on header, immutable lines.
- **Bilingual EN + AR with proper RTL** baked into every report, export,
  email, notification, and PDF.

---

## 4. Functional scope

### 4.1 Core ledger

- **Chart of Accounts** with hierarchical accounts, sub-types
  (current/non-current, operating/non-operating), branch-specific overlays,
  COA versioning so historical reports stay reproducible.
- **`acct_*` tables**: `acct_accounts`, `acct_journal_entries`,
  `acct_journal_lines`, `acct_fiscal_years`, `acct_fiscal_periods`,
  `acct_tax_codes`, `acct_assets`, `acct_budgets`, `acct_funds`,
  `acct_donor_regimes`, `acct_grants`, `acct_pledges`, `acct_sub_recipients`,
  `acct_purchase_requisitions`, `acct_purchase_orders`, `acct_grn`,
  `acct_invoices`, `acct_leases`, `acct_capital_projects`.
- **Currency model** — transactional vs functional currency; FX captured at
  transaction date; revalued at period close; auto-reversal at next period
  start; FX gain/loss accounts auto-posted.
- **Multi-entity** — `branches` (legal entities) introduced in Phase 4;
  intercompany clearing accounts per branch + reciprocal-entry RPC; group-
  level consolidation RPC. **Migration sequence:** Phase 1 uses `hubs` /
  `departments` as branch / cost-center proxies; Phase 4 introduces real
  `branches` + (optionally) `cost_centers` tables and migrates existing
  `acct_*` rows.
- **Posting controls** — debit = credit per entry; period must be open;
  account must be active; `idempotency_key` unique; sanctions block; SoD
  check.
- **Reversal pattern** — contra-journal (auditable). Delete-and-replace
  forbidden.
- **Audit-trail visualiser** — layered on existing `hierarchy_audit_log` +
  per-table triggers.

### 4.2 Fund accounting *(nonprofit overlay)*

- **Net Asset classification** — every journal line tags an
  `acct_funds.restriction_type`: `without_restriction`, `with_restriction`,
  `board_designated`, `quasi_endowment`.
- **Statement of Activities** — replaces P&L for nonprofit views (corporate
  P&L stays for any commercial sub-entity). Includes "net assets released
  from restrictions" line.
- **Statement of Financial Position** — Balance Sheet with three-column net
  asset breakdown.
- **Statement of Functional Expenses** — expenses split by **function**
  (Programs / Management & General / Fundraising) AND natural category. Every
  expense journal line tags a `function`.
- **Statement of Cash Flows** — direct method (donors prefer it); indirect
  available too.
- **Net assets released from restrictions** — auto-journal triggered when a
  restricted grant deliverable completes, scheduled per grant.
- **Pledges receivable** — `acct_pledges` with present-value amortisation,
  allowance for uncollectible.
- **Conditional vs unconditional contributions** (ASU 2018-08) — per-grant
  condition tracker; conditional contributions don't recognise revenue until
  conditions are met.
- **Quasi-endowments / board-designated funds** — sub-types of
  unrestricted.

### 4.3 Sources of postings *(integration list — complete)*

Every operational page that touches money posts to the GL via the same RPC:

- Payroll runs (gross / each statutory line / net / wallet credit / employer
  contributions / pension / loans).
- Wallets + withdrawals (cash-side journals; wallets reconcile daily to
  `Wallet Liabilities`).
- Operational cost submissions (final approval triggers expense journal).
- Down-payment requests, salary advances, retainers, transport, classification
  fees, financial-gap reclaim — receivable / prepayment / expense as
  appropriate.
- MMP per-diems, project field tasks (per-diem registry auto-applies; donor
  audits compare actuals to schedule).
- Transaction scanner output → AI-suggested journal lines, posted as drafts
  for accountant review.
- Procurement (PR → PO encumbrance → GRN accrual → Invoice posting).
- Inventory distribution (commodity expense + beneficiary count).
- Lease commencement → ROU asset + lease liability + monthly amortisation.
- E-vouchers / cash-transfer programming.

### 4.4 Statutory tax & e-filing

- **Sudan**: PIT, Social Insurance, Zakat (already in
  `payroll_statutory_brackets`). HAC / NGO Commission reports. Customs
  duty-exemption tracking for humanitarian goods. ZRA e-filing when live.
- **Kenya**: iTax (PAYE, VAT, WHT, NHIF, NSSF), eTIMS e-invoicing.
- **Uganda**: URA EFRIS e-invoicing, PAYE / NSSF.
- **Tanzania**: TRA VFD e-invoicing.
- **Rwanda**: RRA EBM e-invoicing.
- **Ethiopia**: eTax + WHT certificates.
- **WHT certificates** auto-generated per vendor per period; reverse-charge VAT
  for cross-border services.
- **Statutory bracket registry per country** seeded as part of EAC rollout
  (sourcing per Q-C6).

### 4.5 Donor & grant compliance

- **`acct_donor_regimes`** — USAID (FAR / AIDAR / 2 CFR 200), EU PRAG, UN
  OCHA, FCDO, GIZ, Global Fund. Each has eligibility rules, allowable-cost
  matrix, indirect-cost cap, reporting templates.
- **Per-line tagging** — every journal line carries `grant_id` +
  `donor_regime_id` so the same expense can be eligible-for-A and ineligible-
  for-B simultaneously.
- **Cost-share / matching contribution** — `cost_share` flag on journal lines
  + per-grant target tracking.
- **Indirect Cost Rate (NICRA)** — `indirect_cost_rates` table, allocation
  engine, **cap blocker on posting** (over-cap charges rejected).
- **Burn rate per grant** with projected end-date — under/over-burn alerts.
- **Time & effort certification** — `time_effort_certifications` + monthly
  cert workflow per employee per grant.
- **Donor reporting templates** — engine maps GL accounts → donor-specific
  Excel / PDF cells (FFR / SF-425, EU PRAG narrative, UN OCHA, FCDO, etc.).
- **Donor-specific budget vs actual** with **re-budgeting workflow** —
  threshold-based prior-approval requests for line shifts.
- **Sub-recipient pass-through sub-ledger** — `acct_sub_recipients` + cascade
  reporting when PACT re-grants to local partners.
- **Procurement compliance log** — competitive bid evidence, sole-source
  justification, vendor vetting (hooked off §4.7).
- **Carry-forward funds across fiscal years** — restricted-fund balances
  carry to next year with original restriction intact.
- **Multi-year grant amortisation** — advance-grant deferred-revenue model;
  recognise revenue as conditions are met across multiple fiscal years.

### 4.6 Sanctions & AML screening *(must ship before first journal posts)*

- Screening at vendor / partner / employee onboarding against **OFAC SDN +
  EU consolidated + UN consolidated** baseline (HMT UK + DFAT Australia
  optional per Q-D2).
- Nightly **re-screening** of all active partners against latest lists.
- **Hit-handling workflow** — block payment, escalate, document false-
  positive resolution. Hits create `aml_alerts` row + block journal posting
  until cleared.
- **PEP flagging** for enhanced due diligence.
- **Disbursement threshold escalation** — payments above configurable
  threshold require second approver + KYC re-verify.
- Full **audit log** of all screening decisions.

### 4.7 Procurement-to-pay (P2P) cycle

- **Purchase Requisitions** — requester → budget check → approval chain.
- **Purchase Orders** — committed spend (encumbrance) reduces available
  budget without yet hitting the GL as actual.
- **Goods Received Notes / Service Acceptance** — physical receipt logged,
  triggers accrual journal.
- **3-way match** (PO ↔ GRN ↔ Invoice) — mismatches block payment.
- **Vendor master** on `partners` extended with `is_vendor`, payment terms,
  tax ID, encrypted bank details, preferred currency.
- **Petty cash** — per-branch floats, daily count reconciliation, replenishment
  workflow, custodian rotation with handover sign-off.
- **Expense-advance settlement** — closes advances against actual expense
  claims and posts the variance.
- **Per-diem rates registry** per location + grade — auto-applies to MMP and
  field-task expenses.

### 4.8 Receivables & billing (AR cycle)

- **Invoices** to donors / customers (`acct_invoices`) — bilingual templates,
  multi-currency, partial payments.
- **Credit & debit notes** with auto-reversal of original GL impact.
- **Customer / donor statements** — monthly statement of account with aged
  balances (PDF + email).
- **Recurring billing** for retainer agreements (currently `retainer_runs`
  pays out but never bills back to donors).
- **Receipts** — money in, allocated against invoices (full / partial /
  unidentified pool).
- **Bank deposit slips** — reconcile receipts to bank credits.

### 4.9 Inventory, commodities & gifts-in-kind *(humanitarian-ops core)*

- **Inventory module** with warehouses, stock cards, reorder levels.
- **Commodity tracking** to **Sphere Standards** (per-commodity unit, per-
  beneficiary distribution log).
- **Costing** — FIFO / weighted-average per warehouse; per-commodity
  write-down policy.
- **Gifts-in-Kind (GIK) valuation** — donated goods at fair value at receipt
  date; produces non-cash revenue + inventory asset.
- **Donated services** — recognised when they create / enhance non-financial
  assets or require specialised skills (donor-policy dependent).
- **Distribution → expense recognition** — when a beneficiary receives a kit,
  inventory expense posts automatically with beneficiary count + GPS.
- **Stock counts & shrinkage write-offs** — cycle counts + investigation
  workflow before write-off journal.
- **Pre-positioned stock** for emergency response (released on activation —
  see §4.18).
- **Beneficiary registry linkage** — per-distribution journal carries
  beneficiary-list reference for donor audit.
- **Vouchers / cash-transfer programming (CTP)** — e-vouchers, mobile-money
  transfers tracked separately from operational disbursements.

### 4.10 Lease accounting (IFRS 16) & capital projects

- **Lease register** (`acct_leases`) — start, end, payment schedule, discount
  rate, escalation clause.
- **ROU asset + lease liability** auto-generated on lease commencement.
- **Monthly amortisation + interest journal** auto-posted.
- **Modification handling** — extension, partial termination, reassessment.
- **Short-term + low-value lease elections** (under-12-months exemption).
- **Capital projects / Construction-in-Progress (CIP / WIP)** —
  `acct_capital_projects` accumulates costs; transfers to fixed asset on
  completion.
- **Capitalisation policy threshold** (e.g. ≥ $1,000) — configurable per
  branch.
- **Asset impairment testing** + **disposal / write-off workflow**.
- **Insurance register** linked to assets.

### 4.11 Multi-signatory cash & treasury

- **Multi-signatory bank accounts** with combination rules ("any 2 of 5",
  "A plus any of B/C/D").
- **Cheque register** with sequence integrity check.
- **Cheque void / stop-payment** with audit reason.
- **Bank guarantee & letter-of-credit register** (off-balance-sheet).
- **Bulk-disbursement files** — M-Pesa B2C bulk, NACHA, SEPA / EBA, local
  bank batch formats.
- **Failed-payment retry** workflow with reason-code mapping.
- **Refund processing** with original-transaction linkage.
- **Daily cash position projection** (multi-bank, multi-currency, 30-day
  forecast).
- **Cash-pooling** across branches — sweep idle balances to HQ overnight.
- **Bank-feed reconciliation** with AI matching suggestions.
- **Mobile-money APIs** — M-Pesa, Airtel, Sudan EBS (priority per Q-A3).

### 4.12 HR financial extensions

- **Pension / provident fund** management — employer + employee contributions,
  fund-manager remittance file.
- **Loan management beyond advances** — housing loan, vehicle loan, salary
  loan with interest, amortisation schedule, payroll deduction schedule,
  early settlement.
- **Garnishments / court orders** — third-party deductions with priority
  ordering.
- **Severance & gratuity accruals** — separate from EOSB if local law
  requires.
- **Multi-currency payroll** for expat / cross-border staff — pay in one
  currency, cost in another.
- **Tax equalisation** for expat staff — hypothetical home-country tax vs
  actual host-country tax.
- **Per-diem reconciliation** — actual vs schedule, refund-of-excess
  workflow.
- **Volunteer / consultant honoraria** — separate from payroll, often
  WHT-exempt or different rate.

### 4.13 Reporting layer

Five top-level routes plus deep-links to existing PACT report pages:

| Route | Purpose | Audience |
|---|---|---|
| `/reports/financial` | TB, GL, **Statement of Activities** (replaces P&L for nonprofit), **Statement of Financial Position** (BS), **Statement of Functional Expenses**, **Statement of Cash Flows** (direct), Equity, AR/AP Aging, Bank Recon, Fixed Assets | Finance, Auditors |
| `/reports/project` | Project profitability, project spend vs budget, donor utilisation, wallet liability ageing | PMs, Country Director, Finance |
| `/reports/cost-center` | Department / cost-center spend vs budget, allocations, hierarchy roll-ups | Branch Managers, Finance |
| `/reports/scenario` | Budget vs Actual vs Forecast, best/worst case, sensitivity (FX / tax / payroll) | Finance, Country Director |
| `/reports/forecast` | Predictive cash flow by project / branch / cost-center, variance trends | Finance, Treasury |

**Deep-link targets (verified paths in `src/App.tsx`):**
`/advance-requests-report`, `/cost-submission/reports`, `/wallet-reports`,
`/reconciliation-dashboard`, `/salary-retainer-report`,
`/notification-analytics`. `/project-analytics` to be confirmed.

Plus:

- **Donor-specific reports** — FFR (SF-425), EU PRAG narrative, UN OCHA,
  FCDO, etc., generated from the template engine in §4.5.
- **Charting engine** — Recharts wrappers for bar / line / pie / stacked
  area, with bilingual axis-label helper. Waterfall via custom composed
  chart (per Q-B3).
- **Bilingual EN / AR exports** in PDF / Excel / CSV.
- **Audit-pack ZIP generator** — TB + GL + sub-ledgers + supporting docs +
  legal-hold flagged items.
- **Read-only auditor account** scoped to a frozen period range.
- **Drill-everywhere** — every figure click-throughs to source journal then
  source document.

### 4.14 AI & analytics

- **AI journal coding suggestions** — proposes COA accounts for a
  transaction; reuses existing Gemini / Groq stack. Lives behind admin auth
  at `/admin/transaction-scanner`. **SoD treatment:** an accountant can
  accept / reject a suggestion, but only an admin can change the underlying
  scanner configuration — keeps the AI suggestion path traceable.
- **Anomaly detection** — unusual amount / frequency / vendor.
- **Single chat interface** for accountants and report queries (no second
  chat UI).
- **Predictive cash-flow forecasting** built on historical journals.
- **Automated ratio analysis** — liquidity, profitability, efficiency.
- **Sensitivity-analysis engine** — `compute_sensitivity_scenario(
  p_scenario_id, p_variables jsonb)` RPC drives same numbers across API,
  UI, email.
- **Forecast-accuracy tracking** — compare forecast vs actual over time.

### 4.15 Banking & mobile money

- See §4.11 for multi-signatory + bulk files.
- **Bank-feed reconciliation engine** — start with one bank format (e.g.
  CBOS CSV), expand later.
- **Mobile-money disbursement APIs** in priority order from Q-A3.
- **Charge-back / dispute handling** for mobile-money + card payments.

### 4.16 Notifications & alerts

- Reuses `NotificationTriggerService`.
- **Channels**: in-app + email (IONOS) + WhatsApp (Wasender) + push (FCM).
  **SMS deferred** until a provider is contracted.
- **Audit log of notifications** in the existing notifications table — no
  new audit table.
- **Threshold alerts** — `report_alert_rules` table (`report_key`, `metric`,
  `comparator`, `threshold`, `period`, `notify_roles[]`, `notify_channels[]`).
  Scheduled evaluator dispatches via the same notification service.
- **Scheduled email reports** with embedded charts (rendering decision per
  Q-B4).

### 4.17 APIs

- **REST** under `/api/v1/...` (versioned) via Edge Functions for cases
  PostgREST defaults don't cover.
- **GraphQL** at `/graphql/v1` via Supabase `pg_graphql`.
- **OAuth2 / JWT scopes** — `journals:read`, `journals:post`, `coa:admin`,
  `reports:read`, etc.
- **OpenAPI documentation** auto-generated.
- **Webhooks** — outbound on `journal.posted`, `period.closed`,
  `threshold.breached`. Inbound for bank feeds / payroll / procurement.
- **Rate limiting + IP allow-list** on the public surface.

### 4.18 Crisis & emergency-mode workflows

- **Emergency cash-advance fast-track** — single-approver bypass with full
  audit + post-event reconciliation.
- **Pre-positioned funds release** triggered by an "emergency activation"
  event (admin-only, time-boxed).
- **Crisis-mode approval bypass** — temporarily lowers approval-tier count;
  every bypass logged + auto-reviewed within N days.
- **Quick-fund codes** for new emergencies — pre-approved COA template +
  default dimensions seeded in one click.
- **Conflict-zone payment mode** — cash-only, witnessed disbursement with
  photo + GPS + biometric on the recipient.

### 4.19 Internal audit, risk & whistleblower

- **Internal Audit module** — separate from external audit; audit plan,
  sample selection, finding tracker, management response.
- **Risk register** tied to financial controls — likelihood × impact,
  mitigation, ownership, periodic review.
- **COSO / ICFR self-assessment** — annual control attestation per process
  owner.
- **Whistleblower / fraud-reporting channel** — anonymous submission, triage
  workflow, investigation tracker.
- **Audit committee dashboard** — open findings, prior-year remediation
  status, control breaches.
- **Management letter tracking** — every external-audit recommendation
  tracked to closure.

### 4.20 ESG / SDG / impact tagging

- **SDG 1–17 tagging** on every expense journal line (mandatory or opt-in
  per Q-E7).
- **Beneficiary cost-effectiveness** — beneficiary count per dollar spent.
- **Carbon footprint** of operations — flights, vehicle fuel, generator
  diesel auto-tracked from purchases.
- **Gender-responsive budgeting** flags on expense lines.
- **Grand Bargain localisation index** — % of spend through local partners.

### 4.21 Localisation

- **EN + AR** with proper RTL on day one.
- **French** (Francophone Africa, EU donor reports) + **Swahili**
  (KE / TZ / UG) — added per Q-E9 timing.
- **Arabic-Indic vs Western numeral toggle** per user.
- **Hijri fiscal-year option** per branch.
- **Locale currency formatting** per user (`1,234.56` vs `1.234,56` vs
  `1’234.56`).
- **PDF font registration** — Cairo / Amiri / IBM Plex Sans Arabic for
  Arabic; equivalents for French diacritics + Swahili — closes the current
  jsPDF Arabic gap.
- **Per-block RTL** — embedded Arabic narrative inside an LTR page renders
  RTL correctly.

---

## 5. Non-functional requirements

### 5.1 Segregation of Duties (SoD)

- **DB-level enforcement** via RLS + `check_sod` trigger on approval RPCs —
  not UI hiding.
- **Forbidden combinations**:
  - Same user posts AND approves a journal.
  - Same user creates a vendor AND approves payment to that vendor.
  - Same user approves a payroll run AND appears in it.
  - Same user initiates a bank transfer AND releases it.
- **Maker-checker on configuration** — COA changes, tax-bracket changes,
  FX-rate manual overrides, template edits all require a second approver.
- **2FA mandatory** for `finance`, `accountant`, `auditor`, `admin` (TOTP
  already exists in PACT).
- **Encrypted bank account / IBAN** — column-level encryption + role-scoped
  decryption.
- **Rate limiting + IP allow-list** on the new APIs.

### 5.2 Data governance, retention & GDPR

- **7-year donor retention policy** + legal-hold flags that prevent purge.
- **GDPR right-to-erasure vs immutable ledger** — pseudonymise PII, retain
  ledger numbers (per Q-D10).
- **PII inventory** per finance table — drives masking rules in reports /
  exports.
- **Backup RPO / RTO** signed off by Finance; Supabase PITR underpins it.
- **Disaster-recovery runbook** — one page: how to restore the books to a
  point in time, who authorises, how to communicate to donors.
- **Read-only auditor account** scoped to a frozen period range without
  full RLS bypass.

### 5.3 Performance & scale

- **Partition `acct_journal_lines` by fiscal period** — keeps queries fast,
  old periods cheap to archive.
- **Indexing strategy** documented (see §3).
- **Materialised views** for TB / P&L / BS / Statement of Activities —
  refreshed on journal post via NOTIFY/LISTEN. Sub-second report loads.
- **Background job framework** — `pg_cron` + Edge Functions; documented
  pattern.
- **API pagination + cursor-based listings**.
- **N+1 query prevention** in report RPCs — single CTE-based queries.

### 5.4 Security

- All §5.1 controls.
- Sanctions-screening block on payment.
- Webhooks signed (HMAC) and replay-protected.
- Threat-model document for the public APIs (Phase 9).

### 5.5 Implementation hygiene *(usually skipped — fatal if it is)*

- **Parallel-run period** — minimum **2 fiscal periods** where the new GL
  runs alongside the legacy system; daily reconciliation; cut-over only when
  variance is < 0.01% for 30 consecutive days.
- **Opening-balance cut-over playbook** — written sequence of sign-offs +
  frozen cut-off date + rollback plan.
- **Synthetic data generator** for non-production environments — no real
  PII / donor data leaks into staging / dev.
- **Posting-engine unit-test suite** — every account combination, every tax
  bracket, every FX scenario asserted; runs in CI on every migration.
- **Reconciliation regression tests** — daily reconciliation jobs themselves
  tested with synthetic break scenarios.
- **End-to-end period-close test** — once per release: synthetic month from
  journal entry through close, audit pack, donor reports.
- **Change-management plan** — communications, role-mapping, training
  cycle, certification.
- **In-app help / contextual tooltips** strategy with bilingual content.
- **Video walkthrough library** — short clips per page, EN + AR.
- **User certification programme** — accountants pass a basic competency
  check before write access to GL.
- **Public transparency dashboard** (optional per donor) — anonymised
  totals by sector + location + SDG.
- **Performance monitoring** — p50 / p95 latency on report endpoints,
  alerting at thresholds.
- **Feature flags** for every new finance feature so they can be enabled
  per branch + rolled back instantly.
- **Daily sub-ledger reconciliation jobs** — `sum(wallet_transactions)
  == GL Wallet Liabilities`; `sum(payroll_run_items.net) == GL Net Payroll
  Payable`; mismatches alert finance.

---

## 6. Phased rollout

Premise: ship value every phase; each phase is independently deployable;
later phases never block earlier ones.

### Phase 0 — Finish HR audit sprint *(in flight)*
- Close H1–H10. H10 statutory deductions becomes the bridge to Phase 1
  because it produces structured deductions ready to map to GL accounts.
- **Exit criteria:** all 10 HR gaps green; payroll calc emits a structured
  deductions snapshot.

### Phase 1 — GL foundations *(2–3 sprints)*
- Migrations: `acct_*` tables **including `acct_funds` with restriction
  type** (must land now — retrofitting later is cripplingly expensive).
- Seed Sudan COA + default tax-code set.
- Posting engine RPC `acct_post_journal` with balance-validation trigger.
- **Sanctions screening module** (must ship before first payment journal).
- **SoD matrix + 2FA enforcement** for finance roles.
- **PII inventory** documented.
- Partitioning + index strategy applied.
- Audit-trail view on existing `hierarchy_audit_log`.
- **Posting-engine unit-test suite + synthetic data generator + feature-flag
  framework** (Implementation hygiene starts here, not at the end).
- **Arabic font registered for jsPDF**.
- **Exit criteria:** any service can post a balanced journal via one RPC;
  Trial Balance RPC returns correct numbers; sanctions block prevents posting
  to a sanctioned partner.

### Phase 2 — Wire existing operational pages to GL *(2 sprints)*
1. **Payroll run approval** → posts payroll journals.
2. **Wallet credits + withdrawals** → cash-side journals; wallets reconcile
   daily to `Wallet Liabilities`.
3. **Operational cost submissions** → expense journals on final approval.
4. **Down-payment requests, salary advances, retainers, transport,
   classification fees, financial-gap reclaim**.
5. **Transaction scanner** → AI-suggested draft journal lines.
- **P2P cycle** (PR / PO / GRN / 3-way match) introduced.
- **Expense-advance settlement** workflow.
- **Invoices + credit / debit notes**.
- **Pension + loan management** in payroll.
- **Cheque register + multi-signatory bank accounts** for disbursements.
- **Daily sub-ledger reconciliation jobs**.
- **Crisis-mode bypass scaffolding**.
- **Exit criteria:** Trial Balance reconciles to the sum of operational
  tables; no orphan transactions.

### Phase 2.5 — Donor & grant compliance *(2 sprints — blocks Phase 3 reporting)*
- `acct_donor_regimes` + `acct_grants` + `acct_pledges` +
  `acct_sub_recipients`.
- **Cost-share + matching contribution tracking**.
- **NICRA indirect-cost cap enforcement on posting**.
- **Time & effort certification** workflow.
- **Donor-specific budget vs actual + re-budgeting workflow**.
- **Statement of Activities + Functional Expenses + Pledges receivable**
  reports.
- **GIK & in-kind donation valuation**.
- **SDG tagging** on expense lines.
- **Carry-forward funds across fiscal years**.
- **Multi-year grant amortisation** (advance-grant deferred-revenue model).
- **Exit criteria:** every active grant has a regime, a budget, and a
  cost-share target; NICRA cap blocks posting when breached; Statement of
  Activities renders correctly for one full grant.

### Phase 3 — Reporting layer v1 *(2 sprints)*
- Routes `/reports/financial`, `/reports/project`, `/reports/cost-center`
  (using `departments` as cost-center proxy).
- Recharts wrapper components + bilingual axis-label helper.
- Bilingual EN / AR exports (PDF / Excel / CSV).
- **Read-only auditor view** scoped to a frozen period range.
- **Saved filters / favourites / drill-everywhere / Hijri** options.
- **Capture channels** — email-to-expense, WhatsApp-to-expense (reuses
  Wasender + OCR), camera-to-expense from Flutter.
- **FR / SW localisation** if Q-E9 says yes.
- Deep-link existing PACT report pages.
- **Exit criteria:** Finance can produce TB, Statement of Activities,
  Statement of Financial Position, Cash Flow on demand; every figure traces
  back to a posted journal.

### Phase 4 — Multi-entity + FX revaluation *(2 sprints)*
- Introduce `branches` (legal entities), distinct from hubs.
- Add `branch_id` to `acct_*` and source tables.
- **FX revaluation RPC** at period close + auto-reversal at next period
  start.
- **Intercompany clearing accounts + reciprocal-entry RPC**.
- **Group consolidation RPC**.
- **Lease accounting (IFRS 16) + capital projects (CIP / WIP)**.
- **Cash-pooling across branches**.
- **Inter-warehouse inventory transfers**.
- **Year-end retained-earnings rollover RPC**.
- **Reversal pattern enforcement** (contra-journal only).
- **Soft-close vs hard-close** + adjusting-entries period.
- **Trial Balance lockdown after audit sign-off**.
- **Optional**: replace `departments` proxy with a real `cost_centers`
  table (per Q-C2 outcome).
- **Exit criteria:** consolidated TB across at least two branches with FX
  revaluation visible; lease commencement auto-creates ROU + liability.

### Phase 5 — Public APIs + webhooks *(1–2 sprints)*
- Enable `pg_graphql` extension via migration
  (`CREATE EXTENSION IF NOT EXISTS pg_graphql;`); expose `/graphql/v1`;
  verify introspection responds with API-key scope.
- Versioned REST `/api/v1/...`.
- OAuth2 / JWT scopes; published OpenAPI.
- Outbound webhooks: `journal.posted`, `period.closed`,
  `threshold.breached`.
- **Internal audit module APIs**.
- **Public transparency dashboard endpoint**.
- **Rate limiting + IP allow-list**.
- **Retention legal-hold flags**.
- **Exit criteria:** a third-party can read TB and post a journal via the
  documented API; webhooks deliver reliably.

### Phase 6 — Banking, treasury & mobile money *(2–3 sprints)*
- Bank-feed reconciliation engine (start with one bank format).
- AI matching suggestions.
- Mobile-money disbursement APIs per Q-A3 priority.
- Cash position dashboard (multi-bank, multi-currency, real-time).
- Payment batching / authorisation workflow.
- **Bulk-disbursement file generators** — M-Pesa B2C bulk + others per
  Q-E4.
- **Government e-filing connectors** — country-by-country per §4.4.
- **E-vouchers / CTP integration**.
- **Petty cash module**.
- **Bank-account encryption** for IBAN columns.
- **Exit criteria:** one bank's statement auto-reconciles ≥ 80% of lines;
  one mobile-money disbursement runs end-to-end.

### Phase 7 — Scenario, forecast & AI analytics *(2 sprints)*
- Routes `/reports/scenario`, `/reports/forecast`.
- `scenarios` + `scenario_variables` tables; `compute_sensitivity_scenario`
  RPC.
- Predictive cash-flow forecasting model.
- Anomaly detection job for unusual transactions.
- **Single AI chat shared across ledger + reports**.
- **Risk register + COSO self-assessment** module.
- **Exit criteria:** variance + sensitivity charts render; chat answers a
  benchmark set of finance questions.

### Phase 8 — Reporting alerts + scheduled email *(1 sprint)*
- `report_alert_rules` table + scheduled evaluator.
- Alerts via existing notification service (in-app + email + WhatsApp +
  push).
- Scheduled email reports — chart-rendering decision per Q-B4.
- **Audit-pack ZIP generator** with legal-hold flagged items.
- **Conditional-contribution recognition triggers**.
- **Audit committee dashboard**.
- **Donor reporting template delivery** via scheduled email.
- **Exit criteria:** finance gets a Monday-morning email with charts;
  budget breach triggers an alert within 1 hour.

### Phase 9 — Hardening, BI connector, mobile parity *(open-ended)*
- Power BI / Supabase BI connector.
- Flutter mobile app: read-only finance views + offline-safe journal
  posting for cash advances.
- Threat-model + pen-test of public APIs.
- Performance tuning of posting engine + report RPCs.
- **DR runbook + RPO / RTO sign-off**.
- **Materialised view refresh strategy**.
- **Keyboard shortcuts** for accountants.
- **Carbon footprint + Grand Bargain localisation index** reporting.

### Recommended start

After signing off all open questions in §7, the first concrete deliverable is a
single project task:

> **"Phase 1 GL foundations — schema (with fund-restriction model) +
> posting RPC + sanctions module + SoD matrix + posting-engine test suite +
> feature-flag framework"**

scoped to one sprint with explicit acceptance criteria pulled from Phase 1
above.

---

## 7. Open questions still pending sign-off

### Platform (A)

- **A1.** Branches scope on day one — which legal entities are live first?
- **A2.** Functional currency per entity — confirm SDG / USD / local.
- **A3.** Mobile-money providers priority — M-Pesa first?
- **A4.** AI provider — reuse Gemini + Groq or evaluate finance-tuned model?
- **A5.** First external API consumer — drives initial OAuth scopes.

### Reporting (B)

- **B3.** Waterfall charts — custom Recharts composition (recommended) vs
  add a dependency vs drop from v1?
- **B4.** Server-side chart rendering for scheduled email — headless
  Chromium / image API / link-only?
- **B5.** Threshold-alert rule shape — confirm `report_alert_rules` schema
  covers required alert types.
- **B6.** Sensitivity engine — RPC-based (recommended) vs client-side
  recompute?
- **B7.** Drill-down depth — how many levels (P&L line → GL account →
  journal → source doc)?
- **B8.** Refresh cadence — near-real-time vs nightly snapshot?

### Reality / reuse (C)

- **C1.** Wallets vs GL — subordinate sub-ledger (recommended) vs absorbed?
- **C2.** Department-as-cost-center sufficiency for Phase 1?
- **C3.** Offline journal posting — confirm idempotency-key + last-writer-
  wins on header / immutable lines.
- **C4.** Keep `acct_*` table-name prefix?
- **C5.** Existing report pages — deep-link (recommended) vs iframe vs
  migrate.
- **C6.** EAC statutory bracket sourcing — who owns it?
- **C7.** Period-close authority — confirm Finance Manager opens, Accountant
  verifies, Country Director approves.
- **C8.** Mobile-money sandbox access — already have it or procure?

### Donor / compliance (D)

- **D1.** Donor regimes on day one — USAID? EU? UN OCHA? FCDO? Global Fund?
- **D2.** Sanctions list sources — OFAC + EU + UN baseline; add HMT + DFAT?
- **D3.** Current NICRA letter rate?
- **D4.** Active grants with cost-share targets?
- **D5.** Reversal policy — contra-journal (recommended).
- **D6.** Soft-close window — days post-period-end for adjustments?
- **D7.** Auditor access — read-only DB role / API token / both?
- **D8.** Hijri calendar — alongside Gregorian everywhere or per-user opt-in?
- **D9.** Per-diem registry source — UN DSA / donor-specific / PACT-internal?
- **D10.** PII pseudonymisation rule on GDPR erasure — which fields stay?

### Nonprofit / hygiene (E)

- **E1.** Fund-accounting model — US GAAP nonprofit / IFRS / **dual-render**
  (recommended)?
- **E2.** Inventory / commodities scope on day one — full module or defer?
- **E3.** IFRS 16 (recommended) vs ASC 842 — and discount-rate source?
- **E4.** Mobile-money bulk-disbursement formats on day one?
- **E5.** Pension fund managers + remittance file formats?
- **E6.** Crisis-mode bypass policy — who activates, for how long, audit
  window?
- **E7.** SDG tagging — mandatory on every line or opt-in per project?
- **E8.** Parallel-run length — confirm 2 fiscal periods.
- **E9.** Localisation languages on day one — EN + AR only or add FR / SW?
- **E10.** Public transparency dashboard — opt-in per donor or off until
  enabled?

---

## 8. Out of scope

- **HR audit gaps (H1–H10)** — tracked in the current sprint, not in this
  plan.
- **Statutory tax-authority filing portals** — this plan produces the data
  via §4.4; the e-filing transport per portal is a separate per-country
  delivery.
- **Replacing existing operational pages** — the plan adds a GL +
  reporting layer *underneath* them, never in front of them.
- **Mobile-app authoring of journals** — Flutter app is read-only in
  Phases 1–8; Phase 9 adds offline-safe cash-advance posting only.
- **Live multi-cursor co-editing** in any UI — not relevant.
- **Investment management** (term deposits, FX hedging) — defer until idle
  cash is material.
- **Transfer-pricing documentation, country-by-country reporting (BEPS),
  IAS 12 deferred-tax** — not applicable to PACT at current scale.
- **EVM (Earned Value Management)** — defer until a donor requires it.
- **SEFA / Form 990 / Charity Commission auto-return generation** — defer
  until PACT is registered in the relevant jurisdiction.
- **Donor-portal data feeds (USAID DEC, EU INFOREURO, UN partner portal)**
  — defer; not Phase 1–8.
- **SSO (SAML / Azure AD) for external auditors** — read-only auditor
  account in §4.13 / §5.2 covers the current need.
- **SFTP batch-file exchange** — only if a specific bank or donor requires it.

---

## 9. Companion documents

This master plan is the contract. Three companion documents extend it and
**must be read together** before kicking off Phase 1:

| Document | Purpose |
|---|---|
| `docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md` | One-pager sign-off sheet. Confirms every open question (§7) **and every feature in §4 / §5 / §6** as in-scope. Signed by Country Director, Finance Manager, HR Director, Engineering Lead, Internal Audit Lead, Donor Compliance Officer. |
| `docs/ACCOUNTING_REALITY_CHECK_DELTA.md` | Audit of §2 against the live codebase. 11 items confirmed accurate; 8 patches applied to this master plan in this revision; 6 absent items confirmed. Net impact: **Phase 1 starts on firmer ground than first stated.** |
| `docs/ACCOUNTING_PHASE1_DESIGN.md` | The build-ready sprint design for Phase 1. Includes full DDL drafts, RPC signatures, RLS matrix, 28-test acceptance suite, synthetic data generator spec, feature-flag bootstrap, audit-trail visualiser spec, notification triggers, risks + mitigations, Definition of Done. |

**Reading order for sign-off:**
1. This master plan (you are here).
2. `ACCOUNTING_REALITY_CHECK_DELTA.md` — confirm §2 corrections accepted.
3. `ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md` — circulate for tick / override.
4. `ACCOUNTING_PHASE1_DESIGN.md` — engineering picks this up day one of
   the kick-off sprint.

---

*End of consolidated master plan. Sign-off needed on §7 open questions before
kicking off Phase 1.*


<a id="doc-2"></a>
---

# 2. §2 Reality-Check Delta Report

> **File:** `docs/ACCOUNTING_REALITY_CHECK_DELTA.md`  
> **Status:** ACTIVE — produced the H1–H10 HR gap list. Phase 0 closure shipped 2026-04-25.

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


<a id="doc-3"></a>
---

# 3. Phase 1 Sprint Design Doc

> **File:** `docs/ACCOUNTING_PHASE1_DESIGN.md`  
> **Status:** ACTIVE — concrete design for the next sprint (GL foundations).

# PACT Accounting Module — Phase 1 Sprint Design

**Companion to:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` §6 Phase 1
**Status:** Design ready; awaits §7 sign-off (`ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`)
**Sprint length:** 2–3 sprints (recommended split below)
**Sprint owner:** Engineering Lead + Finance Manager

---

## Goal

Stand up the **General Ledger foundation** so any service in PACT can post a
balanced, idempotent, audit-grade journal — with **fund accounting**,
**sanctions screening**, **Segregation-of-Duties enforcement**, and a
**posting-engine test suite** in place from day one.

Once Phase 1 ships, every later phase (HR → GL, AP → GL, AR → GL, etc.) is
just plumbing into a working ledger.

---

## Acceptance criteria *(copied from master plan §6 Phase 1)*

1. Any service can post a balanced journal via one RPC `acct_post_journal`.
2. Trial Balance RPC returns correct numbers (debits = credits, per period,
   per fund, per branch).
3. Sanctions block prevents posting to a sanctioned partner.
4. SoD matrix prevents the same user posting and approving the same journal.
5. Fund-restriction model is in place (every line tags an `acct_funds` row).
6. Posting-engine unit-test suite passes (≥ 95 % branch coverage).
7. Synthetic data generator produces a reproducible test ledger.
8. Feature-flag framework gates every new finance feature.
9. Arabic font registered for jsPDF; Arabic numerals render correctly.
10. Audit-trail visualiser renders changes from `hierarchy_audit_log` +
    new finance audit triggers.

---

## Sprint split (recommended)

### Sprint 1.1 — Schema + posting engine *(2 weeks)*
- DDL migrations.
- `acct_post_journal` RPC + balance-validation trigger.
- Trial Balance RPC.
- Posting-engine test suite.
- Synthetic data generator.
- Feature-flag framework.

### Sprint 1.2 — Sanctions + SoD + audit trail *(1.5 weeks)*
- `acct_sanctioned_parties` + nightly screening cron.
- `acct_screen_party` RPC + posting-time guard.
- SoD matrix tables + `acct_check_sod` RPC.
- 2FA enforcement on finance roles.
- Audit-trail visualiser page.
- Arabic jsPDF font registration.

---

## Schema *(DDL drafts)*

### `acct_funds` — fund-restriction model

```sql
create type acct_restriction_type as enum (
  'without_restriction',
  'with_restriction',
  'board_designated',
  'quasi_endowment'
);

create table public.acct_funds (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- e.g. 'GENERAL', 'USAID-EDU-2026'
  name_en         text not null,
  name_ar         text not null,
  restriction_type acct_restriction_type not null,
  donor_partner_id uuid references public.partners(id),
  start_date      date,
  end_date        date,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

create index idx_acct_funds_active on public.acct_funds(is_active)
  where is_active;

alter table public.acct_funds enable row level security;
-- RLS: read = all authenticated; write = finance / accountant / super_admin
```

### `acct_accounts` — Chart of Accounts

```sql
create type acct_account_type as enum (
  'asset', 'liability', 'equity', 'revenue', 'expense'
);

create type acct_account_subtype as enum (
  'current_asset','non_current_asset',
  'current_liability','non_current_liability',
  'contributed_equity','retained_equity',
  'operating_revenue','non_operating_revenue',
  'program_expense','mng_expense','fundraising_expense',
  'cogs','other_expense'
);

create table public.acct_accounts (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- '1100', '4200-USAID', etc.
  name_en         text not null,
  name_ar         text not null,
  account_type    acct_account_type not null,
  subtype         acct_account_subtype not null,
  parent_id       uuid references public.acct_accounts(id),
  is_active       boolean not null default true,
  is_postable     boolean not null default true,   -- false for header / roll-up rows
  branch_id       uuid,                            -- nullable until Phase 4
  version         int not null default 1,          -- COA versioning for historical reporting
  created_at      timestamptz not null default now(),
  created_by      uuid references public.profiles(id)
);

create index idx_acct_accounts_type on public.acct_accounts(account_type);
create index idx_acct_accounts_parent on public.acct_accounts(parent_id);
```

### `acct_fiscal_years` + `acct_fiscal_periods`

```sql
create type acct_period_status as enum ('open','soft_closed','hard_closed','locked');

create table public.acct_fiscal_years (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,            -- 'FY2026'
  start_date      date not null,
  end_date        date not null,
  is_closed       boolean not null default false,
  created_at      timestamptz not null default now()
);

create table public.acct_fiscal_periods (
  id              uuid primary key default gen_random_uuid(),
  fiscal_year_id  uuid not null references public.acct_fiscal_years(id),
  period_no       int not null,                    -- 1..12 monthly
  start_date      date not null,
  end_date        date not null,
  status          acct_period_status not null default 'open',
  closed_at       timestamptz,
  closed_by       uuid references public.profiles(id),
  unique (fiscal_year_id, period_no)
);

create index idx_acct_fp_status on public.acct_fiscal_periods(status);
create index idx_acct_fp_dates on public.acct_fiscal_periods(start_date, end_date);
```

### `acct_journal_entries` + `acct_journal_lines` *(partitioned)*

```sql
create type acct_journal_status as enum (
  'draft','pending_approval','posted','reversed','rejected'
);

create table public.acct_journal_entries (
  id                uuid primary key default gen_random_uuid(),
  entry_no          bigserial not null unique,
  period_id         uuid not null references public.acct_fiscal_periods(id),
  posting_date      date not null,
  description_en    text not null,
  description_ar    text,
  source_type       text not null,                 -- 'payroll','wallet','manual','expense', etc.
  source_id         uuid,                          -- FK to source row (loose-typed)
  status            acct_journal_status not null default 'draft',
  branch_id         uuid,                          -- nullable until Phase 4
  idempotency_key   text not null unique,
  posted_at         timestamptz,
  posted_by         uuid references public.profiles(id),
  reversed_by_entry_id uuid references public.acct_journal_entries(id),
  created_at        timestamptz not null default now(),
  created_by        uuid not null references public.profiles(id)
);

create index idx_acct_je_period on public.acct_journal_entries(period_id);
create index idx_acct_je_source on public.acct_journal_entries(source_type, source_id);
create index idx_acct_je_status on public.acct_journal_entries(status);

create table public.acct_journal_lines (
  id                uuid primary key default gen_random_uuid(),
  entry_id          uuid not null references public.acct_journal_entries(id) on delete cascade,
  line_no           int not null,
  account_id        uuid not null references public.acct_accounts(id),
  fund_id           uuid not null references public.acct_funds(id),
  function          text not null check (function in ('program','mng','fundraising','none')),
  project_id        uuid,                          -- references projects(id) if exists
  grant_id          uuid,                          -- references acct_grants(id) — Phase 2.5
  cost_center_id    uuid,                          -- references departments(id) in Phase 1
  partner_id        uuid references public.partners(id),
  -- Money columns are pairs:
  original_amount   numeric(20,4) not null,
  original_currency text not null,
  functional_amount numeric(20,4) not null,
  functional_currency text not null default 'SDG',
  fx_rate           numeric(20,8),
  debit_credit      char(2) not null check (debit_credit in ('DR','CR')),
  description       text,
  unique (entry_id, line_no)
) partition by range (entry_id);   -- partitioned by period via parent FK; bucket strategy below

-- Partition strategy: monthly partitions named acct_journal_lines_yYYYY_mMM,
-- created by a pg_cron job at the start of each fiscal period.

create index idx_acct_jl_account_period on public.acct_journal_lines(account_id);
create index idx_acct_jl_fund on public.acct_journal_lines(fund_id);
create index idx_acct_jl_project on public.acct_journal_lines(project_id);
create index idx_acct_jl_grant on public.acct_journal_lines(grant_id);
create index idx_acct_jl_cost_center on public.acct_journal_lines(cost_center_id);
```

### `acct_sanctioned_parties` + `acct_aml_alerts`

```sql
create type acct_sanctions_list as enum ('OFAC_SDN','EU_CONS','UN_CONS','HMT_UK','DFAT_AU');

create table public.acct_sanctioned_parties (
  id              uuid primary key default gen_random_uuid(),
  list            acct_sanctions_list not null,
  external_id     text not null,                   -- list provider's ID
  full_name       text not null,
  aliases         text[] default '{}',
  country         text,
  match_hash      text not null,                   -- normalised for fuzzy match
  raw             jsonb not null,
  loaded_at       timestamptz not null default now(),
  unique (list, external_id)
);

create index idx_acct_sp_match_hash on public.acct_sanctioned_parties(match_hash);

create type acct_aml_status as enum ('open','false_positive','blocked','escalated');

create table public.acct_aml_alerts (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid not null references public.partners(id),
  matched_party_id uuid not null references public.acct_sanctioned_parties(id),
  match_score     numeric(5,2) not null,
  status          acct_aml_status not null default 'open',
  resolved_at     timestamptz,
  resolved_by     uuid references public.profiles(id),
  resolution_notes text,
  created_at      timestamptz not null default now()
);
```

### `acct_sod_rules` + `acct_sod_violations`

```sql
create table public.acct_sod_rules (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  description     text not null,
  forbidden_pair  text[] not null,                 -- e.g. ['journal.post','journal.approve']
  scope           text not null,                   -- 'same_entry','same_vendor','same_period'
  is_active       boolean not null default true
);

-- Seed rules:
-- ('SOD-1','Same user cannot post and approve a journal',ARRAY['journal.post','journal.approve'],'same_entry')
-- ('SOD-2','Same user cannot create a vendor and approve payment to it',ARRAY['vendor.create','payment.approve'],'same_vendor')
-- ('SOD-3','Same user cannot approve a payroll run that includes them',ARRAY['payroll.approve','payroll.payee'],'same_run')
-- ('SOD-4','Same user cannot initiate and release a bank transfer',ARRAY['transfer.initiate','transfer.release'],'same_transfer')

create table public.acct_sod_violations (
  id              uuid primary key default gen_random_uuid(),
  rule_id         uuid not null references public.acct_sod_rules(id),
  user_id         uuid not null references public.profiles(id),
  attempted_action text not null,
  context         jsonb not null,
  blocked_at      timestamptz not null default now()
);
```

### `feature_flags`

```sql
create table public.feature_flags (
  key             text primary key,
  description     text not null,
  is_enabled      boolean not null default false,
  branch_scope    uuid[] default '{}',             -- empty = global; populated = per-branch
  rolled_out_pct  int default 100 check (rolled_out_pct between 0 and 100),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles(id)
);

-- Helper SQL function:
create or replace function public.feature_enabled(p_key text, p_branch_id uuid default null)
returns boolean language sql stable as $$
  select coalesce((
    select is_enabled
      and (branch_scope = '{}' or p_branch_id = any(branch_scope))
      and (rolled_out_pct = 100 or (hashtext(p_key||coalesce(p_branch_id::text,''))%100) < rolled_out_pct)
    from public.feature_flags where key = p_key
  ), false);
$$;
```

---

## RPC signatures

### `acct_post_journal`

```sql
create or replace function public.acct_post_journal(
  p_payload          jsonb,            -- { period_id, posting_date, description_en, description_ar,
                                       --   source_type, source_id, branch_id, lines: [{...}, ...] }
  p_idempotency_key  text
) returns uuid                         -- returns acct_journal_entries.id
language plpgsql security definer as $$
declare
  v_entry_id uuid;
  v_user_id  uuid := auth.uid();
begin
  -- 1. Idempotency: if key exists, return existing entry id
  select id into v_entry_id
    from public.acct_journal_entries
   where idempotency_key = p_idempotency_key;
  if found then return v_entry_id; end if;

  -- 2. Validate period is open
  perform 1 from public.acct_fiscal_periods
    where id = (p_payload->>'period_id')::uuid and status in ('open','soft_closed');
  if not found then
    raise exception 'PERIOD_CLOSED';
  end if;

  -- 3. Validate balance: sum(DR) == sum(CR) per fund
  --    (raise BALANCE_MISMATCH on failure)
  -- 4. Validate every account is_active and is_postable
  -- 5. Sanctions check on every line.partner_id (raise SANCTIONS_BLOCK)
  -- 6. SoD check: caller must not be the original creator of source row when source_type implies separation
  -- 7. INSERT entry + lines (status='posted', posted_at=now, posted_by=v_user_id)
  -- 8. NOTIFY 'journal_posted' for materialised view refresh
  -- 9. Return v_entry_id
end; $$;
```

**Error codes** (Postgres exceptions): `PERIOD_CLOSED`, `BALANCE_MISMATCH`,
`ACCOUNT_INACTIVE`, `ACCOUNT_NOT_POSTABLE`, `SANCTIONS_BLOCK`, `SOD_VIOLATION`,
`MISSING_FUND`, `MISSING_FUNCTION`.

### `acct_screen_party`

```sql
create or replace function public.acct_screen_party(p_partner_id uuid)
returns table (matched boolean, alert_id uuid)
language plpgsql as $$ ... $$;
```

### `acct_check_sod`

```sql
create or replace function public.acct_check_sod(
  p_user_id uuid,
  p_action  text,                -- 'journal.post','journal.approve', etc.
  p_context jsonb                -- carries the entity ids needed to evaluate scope
) returns boolean                -- true = allowed; false = blocked + violation logged
language plpgsql security definer as $$ ... $$;
```

### `acct_trial_balance`

```sql
create or replace function public.acct_trial_balance(
  p_period_id  uuid,
  p_branch_id  uuid default null,
  p_fund_id    uuid default null
) returns table (
  account_id   uuid,
  account_code text,
  account_name_en text,
  account_name_ar text,
  debit_total  numeric(20,4),
  credit_total numeric(20,4),
  net_balance  numeric(20,4)
) language sql stable as $$ ... $$;
```

### `acct_create_period_partition` *(cron-invoked)*

Creates the next month's `acct_journal_lines_yYYYY_mMM` partition.

---

## RLS policies *(per role)*

| Table | super_admin | finance | accountant | auditor | other |
|---|---|---|---|---|---|
| `acct_funds` | RW | RW | R | R | R |
| `acct_accounts` | RW | RW (with maker-checker) | R | R | R |
| `acct_fiscal_years` | RW | RW | R | R | R |
| `acct_fiscal_periods` | RW | RW | R | R | R |
| `acct_journal_entries` | RW | RW (post + approve segregated by SoD) | RW (post only) | R | none |
| `acct_journal_lines` | R (immutable; no UPDATE) | R | R | R | none |
| `acct_sanctioned_parties` | RW | R | R | R | none |
| `acct_aml_alerts` | RW | RW (resolve) | R | R | none |
| `acct_sod_rules` | RW | R | R | R | none |
| `acct_sod_violations` | RW | R | R | R | none |
| `feature_flags` | RW | RW | R | R | R |

**Universal rule:** `acct_journal_lines` has **no UPDATE / DELETE policy at
all** — immutability enforced at the table level. Reversal goes through
`acct_post_journal` with a contra-entry pointing at `reversed_by_entry_id`.

---

## Test matrix *(posting-engine unit tests)*

Each row is one test. Target ≥ 95 % branch coverage.

| Category | Test |
|---|---|
| **Balance** | DR == CR single-currency single-fund — passes |
| **Balance** | DR != CR — raises BALANCE_MISMATCH |
| **Balance** | DR == CR overall but not per-fund — raises BALANCE_MISMATCH |
| **Period** | Posting to open period — passes |
| **Period** | Posting to soft_closed period — passes (with warning) |
| **Period** | Posting to hard_closed period — raises PERIOD_CLOSED |
| **Period** | Posting to locked period — raises PERIOD_CLOSED |
| **Account** | Posting to inactive account — raises ACCOUNT_INACTIVE |
| **Account** | Posting to header (non-postable) account — raises ACCOUNT_NOT_POSTABLE |
| **FX** | Multi-currency line with explicit fx_rate — functional_amount calculated correctly |
| **FX** | Missing fx_rate when original_currency != functional_currency — raises FX_RATE_MISSING |
| **Sanctions** | Posting line with partner_id matching OFAC entry — raises SANCTIONS_BLOCK |
| **Sanctions** | Posting line with partner_id matching false-positive resolved alert — passes |
| **SoD** | Same user posting and approving same entry — raises SOD_VIOLATION |
| **SoD** | Different users posting and approving — passes |
| **Idempotency** | Same idempotency_key called twice — second returns same entry_id, no duplicate rows |
| **Fund** | Line missing fund_id — raises MISSING_FUND |
| **Function** | Expense line missing function — raises MISSING_FUNCTION |
| **Audit** | Posted entry creates row in audit log — verified |
| **Reversal** | Posting a contra-entry — reversed_by_entry_id linked correctly |
| **Reversal** | Attempting UPDATE on acct_journal_lines — fails (no policy) |
| **Reversal** | Attempting DELETE on acct_journal_lines — fails (no policy) |
| **Trial Balance** | TB after one balanced entry — debit_total = credit_total per fund |
| **Trial Balance** | TB filtered by branch — only matching lines included |
| **Synthetic** | Generator produces a 1,000-entry month, TB balances |
| **Performance** | TB on 100k-line period returns under 500 ms |
| **i18n** | Description rendered with mixed EN/AR — RTL preserved on PDF export |
| **jsPDF** | Arabic numerals render correctly in exported PDF |
| **Idempotency** | Concurrent calls with same idempotency_key — only one row created |

---

## Synthetic data generator

Edge function `acct-seed-synthetic` (or a SQL function) producing:
- 1 fiscal year, 12 monthly periods (FY2026)
- Sudan COA seed (≈ 80 accounts)
- 4 funds: General (unrestricted), USAID-EDU-2026 (with restriction),
  Board Reserve (board_designated), Endowment (quasi)
- 1,000 random balanced entries spread across the year
- 5 partners — 1 of which matches an OFAC test entry to verify the block
- 3 dummy users with distinct roles to exercise SoD

Run from Edge Function with `?reset=true` to wipe + reseed in non-production
environments only (guarded by `is_production` env check).

---

## Feature-flag bootstrap

Initial flags loaded by Phase 1 migration:

| Key | Default | Description |
|---|---|---|
| `acct.posting_engine.enabled` | true | Master switch |
| `acct.sanctions.block_on_match` | true | If false, sanctions hits log only |
| `acct.sod.enforce` | true | If false, violations log only |
| `acct.fund_required` | true | Require fund_id on every line |
| `acct.function_required` | true | Require function on every expense line |
| `acct.parallel_run.enabled` | false | Phase 1 cut-over flag — flips during parallel run |

---

## Audit-trail visualiser

- New page `/finance/audit-trail` (super_admin + auditor + finance only).
- Reads from existing `hierarchy_audit_log` + new `acct_aml_alerts` +
  `acct_sod_violations` + per-table audit triggers on `acct_funds`,
  `acct_accounts`, `acct_fiscal_periods`, `feature_flags`.
- Filter by date range, table, user, change type.
- CSV export.

---

## Notification triggers introduced in Phase 1

Reuse `NotificationTriggerService` — no new framework. New event types:

- `acct.journal.posted` — to creator (in-app) + finance role (in-app + email).
- `acct.sanctions.hit` — to compliance role (in-app + email + WhatsApp).
- `acct.sod.violation` — to internal-audit role (in-app + email).
- `acct.period.closed` — to finance + auditor roles (in-app + email).
- `acct.feature_flag.changed` — to super_admin (in-app).

All bilingual EN/AR, all routed through the existing dispatcher.

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Sanctions list ingestion lag | Nightly cron + manual force-refresh button; alert if last load > 36 h ago |
| Idempotency races under high concurrency | Unique constraint on `idempotency_key` is the source of truth; tested with concurrent harness |
| Partition creation falling behind | `acct_create_period_partition` cron alerts if next-month partition missing 7 days before period start |
| RLS bypass via security-definer RPC | Every security-definer RPC explicitly checks `auth.uid()` role before mutating |
| Arabic font missing in jsPDF | Font registered + smoke-tested in CI on every PR |
| Posting RPC slow on large entries | EXPLAIN ANALYZE benchmarks gate every PR touching the RPC |

---

## Out-of-scope for Phase 1 *(explicit)*

- Donor regimes / grants / pledges → Phase 2.5
- Real `branches` table → Phase 4
- Cost-center separate table → Phase 4 (use `departments` proxy now)
- AP / AR cycles → Phase 2
- Bank-feed integration → Phase 6
- GraphQL endpoint → Phase 5
- Reporting layer routes → Phase 3
- Lease accounting, capital projects → Phase 4
- Inventory / GIK → Phase 6 (per Q-E2 default)

---

## Definition of Done

1. All migrations applied to staging without data loss.
2. All test matrix items green in CI.
3. Synthetic ledger seeds without errors and produces a balanced TB.
4. Sanctions block prevents a payment journal in a manual smoke test.
5. SoD block prevents same-user post + approve in a manual smoke test.
6. Audit-trail page renders for the seeded run.
7. Feature-flag toggle disables the posting engine gracefully (returns
   `FEATURE_DISABLED` instead of mutating).
8. PDF export of TB renders Arabic + Western numerals correctly.
9. Code-review architect signs off.
10. Sign-off sheet (`ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`) attached to the
    sprint ticket.

---

*Phase 1 design ends here. Subsequent phases get their own design docs (one
per phase) — issued at the start of each sprint, never batched ahead.*


<a id="doc-4"></a>
---

# 4. Open Questions Sign-off Sheet

> **File:** `docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md`  
> **Status:** OPEN — items here block design freeze for Phase 1+.

# PACT Accounting Module — Sign-off Sheet *(Open Questions + Feature Confirmation)*

**Companion to:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md`
**Purpose:** the **single sheet** stakeholders sign before Phase 1 kicks off.
Confirms (a) every open question is decided, **and** (b) every feature in the
plan is in-scope as written.
**Sign-off rule:** Phase 1 cannot start until **Part I + Part II + Part IV**
are agreed. Part III (deferred-phase questions) can sign off at the start
of their owning phase.

---

## How to use

1. Read each row's **Recommended default** (open questions) or the feature
   description (feature checklist).
2. If you agree, tick `[x]` in the **Confirm** column.
3. If you disagree, tick `[x]` in **Override** and write the change in the
   adjacent notes column or in the margin.
4. Sign at the bottom (Part V).

Most defaults are obvious; the genuine debates are flagged at the top of
each section.

---

# PART I — Open questions

## Group A — Platform *(blocks Phase 1)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **A1** | Branches scope on day one — which legal entities are live first? | **PACT-Sudan only**; add other countries from Phase 4 | | |
| **A2** | Functional currency per entity | **SDG** for PACT-Sudan; **USD** for any donor-facing reporting branch | | |
| **A3** | Mobile-money providers priority | **Sudan EBS first (local need), then M-Pesa (KE/UG/TZ), then Airtel** | | |
| **A4** | AI provider for journal coding + chat | **Reuse existing Gemini 2.0 Flash → Groq fallback** stack from `scan-transaction` | | |
| **A5** | First external API consumer | **None at launch** — keep APIs internal until a real consumer surfaces, then re-scope OAuth scopes | | |

## Group B — Reporting *(can defer to Phase 3 / 7 / 8)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **B3** | Waterfall charts | **Custom Recharts composition** (no new dependency) | | |
| **B4** | Server-side chart rendering for scheduled email | **Static PNG via headless Chromium in an Edge Function** — render once, attach to email | | |
| **B5** | Threshold-alert rule shape | **Confirm `report_alert_rules` schema as proposed in §4.16** | | |
| **B6** | Sensitivity engine | **RPC-based** (`compute_sensitivity_scenario`) — same numbers everywhere | | |
| **B7** | Drill-down depth | **4 levels**: report figure → GL account → journal → source document | | |
| **B8** | Report refresh cadence | **Near-real-time** via materialised views refreshed on `journal.posted` (NOTIFY/LISTEN) | | |

## Group C — Reality / reuse *(blocks Phase 1 if controversial)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **C1** | Wallets vs GL | **Subordinate sub-ledger** — wallets stay, reconcile daily to a `Wallet Liabilities` GL account | | |
| **C2** | Department-as-cost-center sufficiency for Phase 1 | **Yes** — use `departments` as proxy in Phases 1–3; introduce real `cost_centers` only if reporting needs require | | |
| **C3** | Offline journal posting | **Idempotency-key + last-writer-wins on header / immutable lines** | | |
| **C4** | Keep `acct_*` table-name prefix | **Yes** — keeps the bounded context obvious | | |
| **C5** | Existing report pages | **Deep-link** from new `/reports/*` index pages — no rewrites | | |
| **C6** | EAC statutory bracket sourcing | **Finance team owns the seed data per country**; engineering owns the schema | | |
| **C7** | Period-close authority chain | **Finance Manager opens / verifies → Country Director approves**; Accountant operates within open period | | |
| **C8** | Mobile-money sandbox access | **Procure** — none exists today | | |

## Group D — Donor / compliance *(blocks Phase 2.5)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **D1** | Donor regimes on day one | **USAID, EU PRAG, UN OCHA** (top three); add FCDO + Global Fund in Phase 2.5 +1 | | |
| **D2** | Sanctions list sources | **OFAC SDN + EU consolidated + UN consolidated** baseline; **HMT UK + DFAT Australia opt-in per branch** | | |
| **D3** | Current NICRA letter rate | **Confirm with finance** — no default; needed before NICRA cap can enforce | | |
| **D4** | Active grants with cost-share targets | **Confirm with finance** — list of grant IDs + target % | | |
| **D5** | Reversal policy | **Contra-journal only** — never delete-and-replace | | |
| **D6** | Soft-close window | **5 working days** post-period-end for adjustments before hard-close | | |
| **D7** | Auditor access | **Read-only DB role + scoped API token** (both) | | |
| **D8** | Hijri calendar | **Per-user opt-in** — Gregorian remains primary; Hijri renders alongside on user-flagged pages | | |
| **D9** | Per-diem registry source | **PACT-internal** schedule with **UN DSA fallback** for missing locations | | |
| **D10** | PII pseudonymisation rule on GDPR erasure | **Replace `full_name`, `email`, `phone`, `national_id` with hashed token; retain ledger numbers + amounts unchanged** | | |

## Group E — Nonprofit / hygiene *(blocks Phase 1 + Phase 2.5)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **E1** | Fund-accounting model | **Dual-render** — one set of books, two report layouts (corporate P&L + nonprofit Statement of Activities) | | |
| **E2** | Inventory / commodities scope on day one | **Defer to Phase 6** — too big for Phase 1; track GIK valuation in Phase 2.5 only | | |
| **E3** | IFRS 16 vs ASC 842 + discount rate | **IFRS 16**; discount rate = **PACT incremental borrowing rate per branch, reviewed annually** | | |
| **E4** | Mobile-money bulk-disbursement formats day one | **M-Pesa B2C bulk only**; add others as needed | | |
| **E5** | Pension fund managers + remittance file formats | **Confirm with HR** — no default | | |
| **E6** | Crisis-mode bypass policy | **Country Director can activate for max 7 days; auto-review within 14 days; every bypassed approval logged** | | |
| **E7** | SDG tagging | **Mandatory on every expense line**; default tag = "untagged" so it never blocks posting | | |
| **E8** | Parallel-run length | **2 fiscal periods** — confirmed | | |
| **E9** | Localisation languages on day one | **EN + AR only**; add FR / SW from Phase 3 if a partner explicitly requires | | |
| **E10** | Public transparency dashboard | **Off until a donor explicitly requires it**, then enable per branch | | |

---

# PART II — Feature confirmation *(every feature in the master plan)*

Tick **Confirm** to accept the feature as in-scope as described in the master
plan. Tick **Override** if you want to drop, defer, or change scope.

## §4.1 Core ledger

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.1-a | Hierarchical Chart of Accounts with sub-types + branch overlays + COA versioning | | |
| 4.1-b | `acct_*` table family — accounts, journal entries, journal lines, fiscal years/periods, tax codes, assets, budgets, funds, donor regimes, grants, pledges, sub-recipients, PR / PO / GRN, invoices, leases, capital projects | | |
| 4.1-c | Currency model — transactional + functional, FX at txn date, period-end revaluation, FX gain/loss auto-posted | | |
| 4.1-d | Multi-entity — `branches` introduced in Phase 4, intercompany clearing + reciprocal RPC + group consolidation | | |
| 4.1-e | Posting controls — DR=CR, period open, account active, idempotency_key unique, sanctions block, SoD check | | |
| 4.1-f | Reversal — contra-journal only, never delete | | |
| 4.1-g | Audit-trail visualiser layered on `hierarchy_audit_log` + per-table triggers | | |

## §4.2 Fund accounting *(nonprofit overlay)*

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.2-a | Net-asset classification (without/with restriction, board-designated, quasi-endowment) | | |
| 4.2-b | Statement of Activities (replaces P&L for nonprofit views) | | |
| 4.2-c | Statement of Financial Position (3-column net-asset BS) | | |
| 4.2-d | Statement of Functional Expenses (Programs / M&G / Fundraising) | | |
| 4.2-e | Statement of Cash Flows — direct method | | |
| 4.2-f | Net assets released from restrictions auto-journal | | |
| 4.2-g | Pledges receivable with present-value amortisation | | |
| 4.2-h | Conditional vs unconditional contributions (ASU 2018-08) | | |
| 4.2-i | Quasi-endowments / board-designated funds | | |

## §4.3 Sources of postings *(operational integrations)*

| # | Source page | Confirm | Override |
|---|---|---|---|
| 4.3-a | Payroll runs (gross / statutory / net / wallet credit / employer / pension / loans) | | |
| 4.3-b | Wallets + withdrawals → cash-side journals | | |
| 4.3-c | Operational cost submissions → expense journals | | |
| 4.3-d | Down-payments, salary advances, retainers, transport, classification fees, financial-gap reclaim | | |
| 4.3-e | MMP per-diems + project field tasks | | |
| 4.3-f | Transaction scanner → AI-suggested draft journals | | |
| 4.3-g | Procurement (PR → PO encumbrance → GRN accrual → Invoice) | | |
| 4.3-h | Inventory distribution (commodity expense + beneficiary count) | | |
| 4.3-i | Lease commencement → ROU + lease liability + monthly amortisation | | |
| 4.3-j | E-vouchers / cash-transfer programming | | |

## §4.4 Statutory tax & e-filing

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.4-a | Sudan PIT, Social Insurance, Zakat (already seeded) + HAC reports + customs duty exemption | | |
| 4.4-b | Kenya iTax + eTIMS | | |
| 4.4-c | Uganda EFRIS + PAYE/NSSF | | |
| 4.4-d | Tanzania VFD | | |
| 4.4-e | Rwanda EBM | | |
| 4.4-f | Ethiopia eTax + WHT certificates | | |
| 4.4-g | WHT certificates + reverse-charge VAT | | |
| 4.4-h | Per-country statutory bracket registry | | |

## §4.5 Donor & grant compliance

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.5-a | `acct_donor_regimes` for USAID, EU PRAG, UN OCHA, FCDO, GIZ, Global Fund | | |
| 4.5-b | Per-line `grant_id` + `donor_regime_id` tagging | | |
| 4.5-c | Cost-share / matching contribution tracking | | |
| 4.5-d | NICRA indirect-cost cap enforcement on posting | | |
| 4.5-e | Burn-rate per grant + projected end-date | | |
| 4.5-f | Time & effort certification | | |
| 4.5-g | Donor reporting templates (FFR/SF-425, EU PRAG, UN OCHA, FCDO) | | |
| 4.5-h | Donor-specific budget vs actual + re-budgeting workflow | | |
| 4.5-i | Sub-recipient pass-through sub-ledger | | |
| 4.5-j | Procurement compliance log | | |
| 4.5-k | Carry-forward funds across fiscal years | | |
| 4.5-l | Multi-year grant amortisation | | |

## §4.6 Sanctions & AML

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.6-a | OFAC SDN + EU + UN baseline screening at onboarding | | |
| 4.6-b | Nightly re-screening of all active partners | | |
| 4.6-c | Hit-handling workflow blocks payment | | |
| 4.6-d | PEP flagging | | |
| 4.6-e | Disbursement-threshold escalation | | |
| 4.6-f | Full audit log of screening decisions | | |

## §4.7 P2P cycle

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.7-a | Purchase Requisitions with budget check | | |
| 4.7-b | Purchase Orders (encumbrance) | | |
| 4.7-c | GRN / Service Acceptance | | |
| 4.7-d | 3-way match (PO ↔ GRN ↔ Invoice) | | |
| 4.7-e | Vendor master on `partners` (extended) | | |
| 4.7-f | Petty cash floats + replenishment + custodian rotation | | |
| 4.7-g | Expense-advance settlement | | |
| 4.7-h | Per-diem rates registry per location + grade | | |

## §4.8 AR / billing

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.8-a | Donor / customer invoices | | |
| 4.8-b | Credit & debit notes | | |
| 4.8-c | Customer / donor statements | | |
| 4.8-d | Recurring billing for retainers | | |
| 4.8-e | Receipts allocated against invoices | | |
| 4.8-f | Bank deposit slips reconciled to bank credits | | |

## §4.9 Inventory, commodities & gifts-in-kind

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.9-a | Inventory module with warehouses, stock cards, reorder levels | | |
| 4.9-b | Commodity tracking (Sphere Standards) | | |
| 4.9-c | Costing — FIFO / weighted-average + write-down policy | | |
| 4.9-d | GIK valuation at fair value at receipt date | | |
| 4.9-e | Donated services recognition | | |
| 4.9-f | Distribution → expense recognition with beneficiary count + GPS | | |
| 4.9-g | Stock counts + shrinkage write-off workflow | | |
| 4.9-h | Pre-positioned emergency stock | | |
| 4.9-i | Beneficiary registry linkage | | |
| 4.9-j | E-vouchers / CTP | | |

## §4.10 Lease accounting (IFRS 16) & capital projects

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.10-a | Lease register | | |
| 4.10-b | ROU asset + lease liability auto-generation | | |
| 4.10-c | Monthly amortisation + interest journal | | |
| 4.10-d | Modification handling (extend / terminate / reassess) | | |
| 4.10-e | Short-term + low-value lease elections | | |
| 4.10-f | Capital projects / CIP / WIP | | |
| 4.10-g | Capitalisation policy threshold per branch | | |
| 4.10-h | Asset impairment + disposal / write-off workflow | | |
| 4.10-i | Insurance register linked to assets | | |

## §4.11 Multi-signatory cash & treasury

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.11-a | Multi-signatory bank accounts with combination rules | | |
| 4.11-b | Cheque register with sequence integrity | | |
| 4.11-c | Cheque void / stop-payment | | |
| 4.11-d | Bank guarantees + LCs (off-balance-sheet) | | |
| 4.11-e | Bulk-disbursement files (M-Pesa B2C, NACHA, SEPA, local) | | |
| 4.11-f | Failed-payment retry workflow | | |
| 4.11-g | Refund processing | | |
| 4.11-h | Daily cash-position projection | | |
| 4.11-i | Cash-pooling across branches | | |
| 4.11-j | Bank-feed reconciliation with AI matching | | |
| 4.11-k | Mobile-money APIs (M-Pesa / Airtel / Sudan EBS) | | |

## §4.12 HR financial extensions

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.12-a | Pension / provident fund management | | |
| 4.12-b | Loans beyond advances (housing / vehicle / salary) with interest amortisation | | |
| 4.12-c | Garnishments / court orders with priority ordering | | |
| 4.12-d | Severance & gratuity accruals | | |
| 4.12-e | Multi-currency payroll for expat / cross-border staff | | |
| 4.12-f | Tax equalisation for expat staff | | |
| 4.12-g | Per-diem reconciliation (actual vs schedule) | | |
| 4.12-h | Volunteer / consultant honoraria | | |

## §4.13 Reporting layer

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.13-a | `/reports/financial` (TB, GL, SoA, SoFP, Func Expenses, CF, Equity, AR/AP Aging, Bank Recon, Fixed Assets) | | |
| 4.13-b | `/reports/project` | | |
| 4.13-c | `/reports/cost-center` | | |
| 4.13-d | `/reports/scenario` | | |
| 4.13-e | `/reports/forecast` | | |
| 4.13-f | Donor-specific reports (FFR/SF-425, EU PRAG, UN OCHA, FCDO) | | |
| 4.13-g | Recharts wrappers + bilingual axis-label helper | | |
| 4.13-h | Bilingual EN/AR exports (PDF/Excel/CSV) | | |
| 4.13-i | Audit-pack ZIP generator with legal-hold | | |
| 4.13-j | Read-only auditor account scoped to frozen period | | |
| 4.13-k | Drill-everywhere — figure → GL → journal → source doc | | |
| 4.13-l | Deep-links to existing PACT report pages | | |

## §4.14 AI & analytics

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.14-a | AI journal coding suggestions (admin-scoped scanner) | | |
| 4.14-b | Anomaly detection (unusual amount/frequency/vendor) | | |
| 4.14-c | Single chat interface across ledger + reports | | |
| 4.14-d | Predictive cash-flow forecasting | | |
| 4.14-e | Automated ratio analysis | | |
| 4.14-f | Sensitivity-analysis RPC | | |
| 4.14-g | Forecast-accuracy tracking | | |

## §4.15 Banking & mobile money

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.15-a | Bank-feed reconciliation engine (start with one bank format) | | |
| 4.15-b | Mobile-money disbursement APIs per A3 priority | | |
| 4.15-c | Charge-back / dispute handling | | |

## §4.16 Notifications & alerts

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.16-a | Reuse `NotificationTriggerService` | | |
| 4.16-b | Channels: in-app + email + WhatsApp + push (no SMS) | | |
| 4.16-c | Audit log via existing notifications table | | |
| 4.16-d | Threshold alerts via `report_alert_rules` | | |
| 4.16-e | Scheduled email reports with embedded charts | | |

## §4.17 APIs

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.17-a | REST `/api/v1/...` versioned | | |
| 4.17-b | GraphQL `/graphql/v1` via `pg_graphql` | | |
| 4.17-c | OAuth2 / JWT scopes | | |
| 4.17-d | Auto-generated OpenAPI | | |
| 4.17-e | Outbound webhooks (`journal.posted`, `period.closed`, `threshold.breached`) | | |
| 4.17-f | Rate limiting + IP allow-list | | |

## §4.18 Crisis & emergency-mode workflows

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.18-a | Emergency cash-advance fast-track | | |
| 4.18-b | Pre-positioned funds release on activation | | |
| 4.18-c | Crisis-mode approval bypass with auto-review | | |
| 4.18-d | Quick-fund codes for new emergencies | | |
| 4.18-e | Conflict-zone payment mode (cash + photo + GPS + biometric) | | |

## §4.19 Internal audit, risk & whistleblower

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.19-a | Internal Audit module (plan / sample / findings / response) | | |
| 4.19-b | Risk register tied to financial controls | | |
| 4.19-c | COSO / ICFR self-assessment | | |
| 4.19-d | Whistleblower / fraud-reporting channel | | |
| 4.19-e | Audit committee dashboard | | |
| 4.19-f | Management letter tracking | | |

## §4.20 ESG / SDG / impact tagging

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.20-a | SDG 1–17 tagging on every expense line | | |
| 4.20-b | Beneficiary cost-effectiveness | | |
| 4.20-c | Carbon footprint of operations | | |
| 4.20-d | Gender-responsive budgeting flags | | |
| 4.20-e | Grand Bargain localisation index | | |

## §4.21 Localisation

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.21-a | EN + AR with proper RTL on day one | | |
| 4.21-b | French + Swahili (timing per E9) | | |
| 4.21-c | Arabic-Indic vs Western numerals toggle per user | | |
| 4.21-d | Hijri fiscal-year option per branch | | |
| 4.21-e | Locale currency formatting per user | | |
| 4.21-f | PDF font registration (Cairo / Amiri / IBM Plex Sans Arabic + FR / SW) | | |
| 4.21-g | Per-block RTL within LTR pages | | |

## §5 Non-functional requirements

| # | Feature | Confirm | Override |
|---|---|---|---|
| 5.1-a | DB-level Segregation of Duties (RLS + `check_sod` trigger) | | |
| 5.1-b | Forbidden combos enforced (post≠approve, vendor-create≠pay, payroll-approve≠payee, transfer-init≠release) | | |
| 5.1-c | Maker-checker on COA / tax / FX / template config | | |
| 5.1-d | Mandatory 2FA for finance / accountant / auditor / admin | | |
| 5.1-e | Encrypted bank account / IBAN columns | | |
| 5.1-f | Rate limiting + IP allow-list on APIs | | |
| 5.2-a | 7-year donor retention + legal-hold flags | | |
| 5.2-b | GDPR pseudonymisation rule per D10 | | |
| 5.2-c | PII inventory per finance table | | |
| 5.2-d | Backup RPO/RTO sign-off + DR runbook | | |
| 5.2-e | Read-only auditor account scoped to frozen period | | |
| 5.3-a | Partition `acct_journal_lines` by fiscal period | | |
| 5.3-b | Documented indexing strategy | | |
| 5.3-c | Materialised views refreshed on `journal.posted` (NOTIFY/LISTEN) | | |
| 5.3-d | `pg_cron` + Edge Function background job framework | | |
| 5.3-e | API pagination + cursor listings | | |
| 5.3-f | N+1 prevention via CTE-based RPCs | | |
| 5.4-a | Sanctions block on payment | | |
| 5.4-b | HMAC-signed webhooks with replay protection | | |
| 5.4-c | Threat-model document for public APIs | | |
| 5.5-a | Parallel-run period (2 fiscal periods) | | |
| 5.5-b | Opening-balance cut-over playbook | | |
| 5.5-c | Synthetic data generator | | |
| 5.5-d | Posting-engine unit-test suite (≥95% branch coverage) | | |
| 5.5-e | Reconciliation regression tests | | |
| 5.5-f | End-to-end period-close test per release | | |
| 5.5-g | Change-management plan + training cycle | | |
| 5.5-h | In-app help / tooltips bilingual | | |
| 5.5-i | Video walkthrough library EN + AR | | |
| 5.5-j | User certification programme | | |
| 5.5-k | Public transparency dashboard (off until donor requires) | | |
| 5.5-l | Performance monitoring with p50/p95 alerts | | |
| 5.5-m | Feature flags per branch with instant rollback | | |
| 5.5-n | Daily sub-ledger reconciliation jobs | | |

---

# PART III — Phase confirmation *(scope per phase)*

Tick to confirm each phase's scope is in-plan as written in §6. Phase 1 is
the immediate one — must sign off now. Later phases can sign off at the
start of their own kick-off.

| Phase | Scope summary | Confirm | Override |
|---|---|---|---|
| **Phase 0** *(in flight)* | Finish HR audit H1–H10 | | |
| **Phase 1** *(2–3 sprints)* | GL foundations — `acct_*` schema + fund model + `acct_post_journal` RPC + sanctions module + SoD matrix + 2FA + PII inventory + partitioning + audit-trail view + posting-engine tests + synthetic data generator + feature flags + Arabic jsPDF font | | |
| **Phase 2** *(2 sprints)* | Wire payroll / wallets / cost subs / advances / scanner to GL + P2P cycle + advance settlement + invoices + pension/loans + cheque + multi-sig + sub-ledger recon jobs + crisis-mode scaffolding | | |
| **Phase 2.5** *(2 sprints)* | Donor regimes + grants + pledges + sub-recipients + cost-share + NICRA cap + T&E + donor budget vs actual + Statement of Activities + Functional Expenses + Pledges + GIK + SDG + carry-forward + multi-year amortisation | | |
| **Phase 3** *(2 sprints)* | `/reports/*` routes + Recharts wrappers + bilingual exports + auditor view + saved filters / drill-everywhere / Hijri + capture channels + FR/SW (per E9) + deep-link existing pages | | |
| **Phase 4** *(2 sprints)* | `branches` + `branch_id` rollout + FX revaluation + intercompany + consolidation + IFRS 16 + capital projects + cash-pooling + inter-warehouse transfers + year-end rollover + reversal enforcement + soft/hard close + TB lockdown + optional `cost_centers` | | |
| **Phase 5** *(1–2 sprints)* | `pg_graphql` + REST `/api/v1` + OAuth2 + OpenAPI + outbound webhooks + internal-audit APIs + transparency dashboard endpoint + rate limit + IP allow-list + retention legal-hold | | |
| **Phase 6** *(2–3 sprints)* | Bank-feed engine + AI matching + mobile-money APIs + cash dashboard + payment batching + bulk disbursements + e-filing connectors + e-vouchers/CTP + petty cash + bank-account encryption | | |
| **Phase 7** *(2 sprints)* | `/reports/scenario` + `/reports/forecast` + sensitivity engine + cash-flow forecasting + anomaly detection + AI chat + risk register + COSO | | |
| **Phase 8** *(1 sprint)* | `report_alert_rules` + scheduled evaluator + scheduled email reports + audit-pack ZIP + conditional-contribution triggers + audit committee dashboard + donor template delivery | | |
| **Phase 9** *(open-ended)* | BI connector + Flutter read-only + offline cash-advance posting + threat model + pen test + perf tuning + DR runbook + materialised view refresh strategy + keyboard shortcuts + carbon footprint + Grand Bargain index | | |

---

# PART IV — Out-of-scope confirmation

Tick to **confirm out of scope** (per master plan §8). Untick any you
disagree with.

- [ ] HR audit gaps (H1–H10) — handled in current sprint, not this plan
- [ ] Statutory tax-authority filing portals — handled per-country in Phase 6 connectors
- [ ] Replacing existing operational pages — plan adds GL underneath, never in front
- [ ] Mobile-app authoring of journals before Phase 9
- [ ] Live multi-cursor co-editing
- [ ] Investment management (term deposits, FX hedging)
- [ ] Transfer-pricing documentation
- [ ] Country-by-country reporting (BEPS)
- [ ] IAS 12 deferred-tax assets / liabilities
- [ ] EVM (Earned Value Management)
- [ ] SEFA / Form 990 / Charity Commission auto-return generation
- [ ] Donor-portal data feeds (USAID DEC, EU INFOREURO, UN partner portal)
- [ ] SSO (SAML / Azure AD) for external auditors
- [ ] SFTP batch-file exchange

---

# PART V — Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Country Director | | | |
| Finance Manager | | | |
| HR Director | | | |
| Engineering Lead | | | |
| Internal Audit Lead | | | |
| Donor Compliance Officer | | | |

---

*Once all six signatures are in place, attach a copy to the kick-off ticket
for **Phase 1 GL foundations** and proceed to
`docs/ACCOUNTING_PHASE1_DESIGN.md` for the sprint design.*


<a id="doc-5"></a>
---

# 5. PACT Notion-Style Block Editor — Saved Plan

> **File:** `docs/BLOCK_EDITOR_PLAN.md`  
> **Status:** ACTIVE — supporting feature used by accounting notes / JE memos / report narratives.

# PACT Notion-Style Block Editor — Saved Plan

**Status:** Saved for later review · **Owner:** TBD · **Last updated:** 2026-04-25
**Decision so far:** Build a Notion-style block editor **inside PACT** (no
external Notion subscription, no per-user fees, no vendor lock-in). Self-hosted
on the existing Supabase + React stack.

---

## 1. Why this, not "connect to Notion"

| | Connect to real Notion | **Build block editor inside PACT (chosen)** |
|---|---|---|
| Subscription cost | Per-user Notion seats | **None — fully free** |
| Offline use (field staff) | No — Notion is online-only | **Yes — IndexedDB / Hive, syncs on reconnect** |
| Bilingual EN + AR with proper RTL | Weak | **Native** |
| Permissions | Separate Notion ACLs | **Reuses PACT RLS, hubs, departments, roles** |
| Vendor dependency | Notion + their rate limits | **None** |
| Engineering effort | Low | Medium (a few sprints, phased) |

Decision driver: PACT is **mobile-first, offline-first, bilingual, RLS-secured**.
Notion satisfies none of those three.

---

## 2. Free open-source stack (no paid tier needed)

| Layer | Library / service | License | Cost |
|---|---|---|---|
| **Editor** | **BlockNote** (recommended) | MIT | Free |
| Runner-up editors | TipTap (core), Novel, Lexical, Plate, Editor.js | MIT/Apache | Free |
| Document storage | Supabase Postgres (already yours) | — | Already paid |
| File / image uploads | Supabase Storage (already yours) | — | Already paid |
| Search | Postgres full-text search | — | Free, built-in |
| Bilingual EN/AR + RTL | HTML `dir="rtl"` + existing i18n | — | Free |
| PDF / Excel export | jsPDF + xlsx (already in PACT) | — | Free |
| Optional live co-editing | Yjs + self-hosted Hocuspocus, **or** Supabase Realtime | MIT | Free |
| Offline drafts | IndexedDB + Service Worker (already in PACT) | — | Free |

**No new vendor, no new bill, no per-user fee.**

Why **BlockNote** specifically:
- MIT licensed, no paid tier.
- Slash menu, drag handles, headings, checklists, tables, images, quotes,
  callouts — Notion-style out of the box.
- Built on TipTap / ProseMirror — mature.
- Supports custom blocks → we add `/project`, `/site`, `/partner`, `/task`,
  `/user` mention blocks linking to live PACT records.
- Stores documents as JSON → drops straight into a Supabase JSONB column.
- RTL works.

---

## 3. Pages affected

### Phase A — Launch pair (1–2 sprints)

| Page | Change |
|---|---|
| **Project Details** (`/projects/:id`) — all 10 project types | Description textarea → block editor with mentions of sites / partners / tasks. |
| **Knowledge Base** (`/knowledge-base`) — **NEW page** | Wiki-style surface for SOPs, policies, onboarding guides, donor templates. Folder tree + role-filtered visibility. |

### Phase B — Field + HQ pickup (1 sprint)

| Page | Change |
|---|---|
| **Site Visits & MMP narratives** (`/site-visits`, `/mmp/*`) | Notes field → block editor with inline photos, GPS pins, voice memos, checklists. Works offline. |
| **CRM Engagements / Meeting Notes** (`/crm/engagements/:id`) | New "Notes" tab: agendas, action items, attendees, `/partner` `/contact` mentions. |

### Phase C — Internal communications (when stable)

| Page | Change |
|---|---|
| **Performance Reviews** (`/performance-reviews`) | Reviewer comments → blocks; goals as checklists; links to delivered projects/tasks. |
| **Broadcast Center** (admin announcements) | Headings, callouts, inline images instead of plain text. |
| **Changelog** (`/changelog`) | Entries authored in the editor instead of hand-written Markdown. |
| **Hierarchical Tasks** (`/my-tasks`, `/team-tasks`, admin overview) | Task descriptions → blocks; sub-tasks + photo proofs render inline. |
| **Project Field Tasks** (per-project tracker) | Same as hierarchical tasks. |

**Total:** 8 existing pages enriched + 1 new page. **No page removed, no data lost.**

---

## 4. Features the system will gain

### Authoring (everywhere the editor appears)
- Slash menu (`/`) for: heading, bullet list, numbered list, **checklist**,
  quote, callout, divider, code, table, image, file.
- Inline formatting: bold, italic, underline, strikethrough, inline code, links.
- Drag-handle on every block to reorder content.
- Nested lists & toggles (collapse / expand sections).
- Tables with add / remove rows and columns.
- Inline images & files uploaded directly to Supabase Storage.
- **Bilingual EN + AR with proper RTL** for every block.
- Markdown shortcuts (`#` heading, `- [ ]` checklist, etc.) for fast typing.

### PACT-specific extensions (the differentiator)
- **`/project` mention** — pick a project; renders as clickable chip.
- **`/site` mention** — link to master sites registry.
- **`/partner`** / **`/contact` mention** — link to CRM records.
- **`/task` mention** — link to a hierarchical or field task.
- **`/user` mention** — assigns a person + triggers a notification on existing
  channels (in-app + WhatsApp + email + push).
- **`/file` block** — pulls from Supabase storage with the correct RLS.

### Data, sync & safety
- **Offline-safe drafts** — saved to IndexedDB (web) / Hive (mobile),
  synced on reconnect, idempotent so nothing duplicates.
- **Autosave** every few seconds with a "saved · just now" indicator.
- **Per-page version history** — restore any earlier revision.
- **Row-Level Security carries through** — same role / hub / department rules
  govern every document.
- **Audit trail** of edits using the existing audit infrastructure.

### Collaboration (free tier)
- **Comments on blocks** — text-based right-rail comments; notifies the
  assignee on existing channels.
- **@mentions of users** with notification dispatch.
- *(Optional later)* Live multi-cursor co-editing via Yjs — free,
  self-hosted, no extra service.

### Search
- **Full-text search across all editor content** using Postgres FTS, surfaced
  in the global search bar — find any phrase typed in any project description,
  MMP note, knowledge-base page, or meeting note.

### Export & sharing
- **PDF export** per page with bilingual layout (existing jsPDF stack).
- **Excel export** for any table block (existing xlsx stack).
- **Public read-only share link** (optional, off by default, expires) — share a
  single SOP page with a partner without giving them a PACT account.
- **Copy as Markdown / HTML** for one-click pasting into emails or WhatsApp.

### Admin & governance (Knowledge Base specifically)
- Folders + drag-to-reorder pages in a left tree.
- Page templates — "Donor SOP", "Project kickoff", "Meeting notes",
  "Onboarding checklist" — admin-managed.
- Role-based visibility per page (everyone / specific roles / specific
  departments).
- Pinned pages at the top of the tree.
- Read receipts on important SOPs (who has acknowledged the latest version).

---

## 5. What stays exactly the same — no limitations on what we do today

- Every existing page keeps its layout, buttons, and workflows. Only the
  description / notes area inside the listed pages changes.
- Old plain-text content auto-imports as a single paragraph block on first
  edit — nothing deleted.
- All existing features keep working unchanged: approvals, RLS, role-based
  permissions, hub / department scoping, audit log, notifications (in-app +
  email + WhatsApp + push), offline sync, exports, bilingual EN + AR + RTL,
  search.
- Existing APIs and edge functions stay backward-compatible — anything reading
  those text fields still gets text back (rendered from the blocks).
- Per-page fallback to plain text if a team prefers it — no rebuild needed.

---

## 6. Honest trade-offs to acknowledge

1. **Storage shape changes** for the affected fields — those columns become
   JSONB instead of plain text. Migration is automatic and reversible (a
   plain-text rendering is kept alongside).
2. **Search index needs a one-time rebuild** after rollout so old text content
   is indexed in the new format. Takes minutes, runs once.

Neither limits what the system can do — they're just facts about the rollout.

---

## 7. Out of scope for this plan

- **Mobile Flutter app authoring UI.** Mobile reads the rendered output in
  Phase A–C; full mobile authoring is a separate piece of work if/when wanted.
- **Live multi-cursor co-editing.** Optional, off by default, can be enabled
  later for free without breaking anything.
- **Connecting to the real Notion.com.** Explicitly rejected (subscription,
  online-only, weak RTL, separate ACLs).

---

## 8. Open items to confirm before starting Phase A

1. Confirm **BlockNote** as the chosen library (vs TipTap core / Novel /
   Lexical).
2. Confirm Knowledge Base page lives at **`/knowledge-base`** (or another
   route).
3. Confirm which existing roles can **author** vs **read** Knowledge Base
   pages by default.
4. Confirm whether the **public read-only share link** feature ships in
   Phase A or is deferred.
5. Confirm whether **comments on blocks** ship in Phase A or Phase B.

---

*Saved for later review. No implementation kicked off.*


<a id="doc-6"></a>
---

# 6. PACT Accounting & Finance Module — Master Plan (V1, superseded)

> **File:** `docs/ACCOUNTING_MODULE_MASTER_PLAN.md`  
> **Status:** SUPERSEDED by V2 (#1). Kept here for historical reference.

# PACT Accounting & Finance Module — Master Plan

**Status:** Proposed · **Owner:** Finance + Engineering · **Last updated:** 2026-04-24
**Target compliance:** Sudan (Income Tax, VAT, Zakat, Social Insurance) + East African
Community (Kenya, Uganda, Tanzania, Rwanda, Ethiopia, South Sudan)
**Scope:** Full double-entry accounting system, integrated with every existing PACT
page that touches money, fully automated journal posting, bilingual EN/AR, multi-
currency, multi-entity ready.

---

## 0. Why we need this

Today PACT has many places that move money — payroll, wallets, down-payment requests,
operational cost submissions, transportation costs, classification fees, advances,
retainers, withdrawal requests, transaction screenshot scans — but **none of them post
into a general ledger**. Reports are stitched together page-by-page from raw tables,
which means:

- No single source of financial truth (P&L, Balance Sheet, Trial Balance do not exist).
- Tax filings (VAT returns, withholding-tax returns, payroll tax) are manual.
- Reconciliation between bank statements and on-platform spend is manual.
- East African / Sudan tax authorities increasingly require **real-time fiscalised
  invoicing** (Kenya TIMS/eTIMS, Uganda EFRIS, Rwanda EBM, Tanzania VFD) — not
  achievable without a structured ledger.
- Auditors cannot trace any payment back to its journal entry.

This plan turns PACT into a **real accounting system** while keeping all the existing
operational pages exactly where they are — the accounting layer sits *underneath*
them, not in front of them.

---

## 1. Guiding principles

1. **Existing pages stay the operator UI.** No one re-enters data in "Accounting".
   Every page that creates a financial event auto-posts a journal behind the scenes.
2. **Double-entry from day one.** Every transaction debits and credits — no shortcuts.
3. **Idempotent and auditable.** Every journal carries the `source_table`, `source_id`,
   and a content hash so re-runs don't double-post and auditors can trace any line.
4. **Multi-currency by default.** Sudan operates in SDG, USD, sometimes AED/KES/EUR.
   FX rates are captured at the transaction date and revalued at period close.
5. **Compliant out of the box.** Tax codes, withholding rules, and statutory reports
   are configurable per country — no code changes to add a new jurisdiction.
6. **Bilingual + RTL throughout** (EN + AR), like the rest of PACT.
7. **Approval-gated postings.** No journal hits the GL until the originating page
   reaches its "approved" / "posted" state.
8. **Phased delivery.** Six phases, each independently shippable and useful.

---

## 2. HR Re-Audit — Remaining Gaps

These are real gaps still open in the HR module after the April-24 fixes.
They are **prerequisites** for the accounting module because every one of them
is a journal source.

| # | Gap | Impact | Suggested fix |
|---|-----|--------|---------------|
| H1 | **Salary increment doesn't update `employee_salary_config.base_salary` when approved.** Next payroll still uses the old base. | High — silent under-pay / over-pay | On increment.status = approved, run `UPDATE employee_salary_config SET base_salary = NEW.new_salary, currency = NEW.currency, updated_at = now() WHERE user_id = NEW.user_id;` via trigger. |
| H2 | **No salary-advance request page.** `AdvanceRequestsReport` only reports; employees can't request advances. | Medium — workaround in WhatsApp | Add `/advance-requests` form page that writes to `salary_advances` table, routes through manager → finance approval, deducts from next payroll, and posts a journal. |
| H3 | **No expense reimbursement claim page.** `operational_cost_submissions` is for project ops, not personal expenses. | Medium | Add `/my-expenses` page (per-user), with multi-line claims, receipt upload, manager + finance approval, auto-credit to wallet on approval. |
| H4 | **No daily attendance / timesheet beyond per-task `actual_hours`.** | Medium for compliance with Sudan labour law (hours worked vs OT). | Add lightweight daily check-in page with GPS + selfie (re-use existing camera infra) writing to `attendance_logs`. |
| H5 | **No exit / offboarding workflow.** Departures are handled by editing the profile. | Medium for final-settlement compliance. | Add `/offboarding` workflow: generate final payslip (pro-rated salary + leave encashment + EOSB / gratuity − loans/advances), revoke wallet, lock accounts. |
| H6 | **HRHub leave-entitlement edits silently change quotas.** No notification to the affected user, no audit trail. | Medium — trust/transparency | Notify user on entitlement change; insert row into `hierarchy_audit_log` (or new `leave_entitlement_audit`). |
| H7 | **`down_payment_requests` approvals don't trigger NotificationTriggerService.** Still uses raw notifications inserts (or none) in `AdvanceRequestsReport`. | Medium | Mirror what we did for LeaveRequests / PerformanceReviews. |
| H8 | **No EOSB / gratuity accrual.** Sudan + most EAC require end-of-service benefit accrual monthly. | High for accuracy of liability on Balance Sheet. | Add monthly cron that posts an EOSB accrual journal per active employee based on tenure + last salary. Becomes part of payroll close. |
| H9 | **Performance review outcome doesn't feed salary increment.** A 5-star annual review still requires manual increment entry. | Low — process gap | Add "Convert to increment" button on approved reviews that pre-fills the SalaryIncrements form. |
| H10 | **No "Statutory contributions" line in payroll.** Sudan Social Insurance (NPF), employee income tax (PIT), Zakat are not computed automatically. | **Severe for compliance** | Add `payroll_statutory_lines` table + per-country calculator. See §6.3. |

> Suggested execution: H1, H7, H10 first (quick wins + compliance). H2, H3, H8 land
> with Accounting Phase 2. H4, H5, H6, H9 can wait or run in parallel as small tasks.

---

## 3. Compliance scope

### 3.1 Sudan
- **Income Tax (PIT)** — progressive brackets, monthly withholding by employer.
- **VAT** — 17 % standard, 0 % exports, exempt on essentials. Monthly VAT return.
- **Withholding Tax (WHT)** — 5 % on local services, 7 % on rent, 15 % on
  non-resident services. Monthly remittance.
- **Zakat** — 2.5 % on zakatable assets (annual), reportable to the Zakat Chamber.
- **Social Insurance (NPF)** — employer 17 %, employee 8 % of gross.
- **Stamp Duty** — fixed-rate on contracts, payslips above thresholds.

### 3.2 East African Community (per-country toggles)
| Country | VAT | Corporate | PAYE | Social | Real-time fiscal device |
|---------|-----|-----------|------|--------|-------------------------|
| Kenya | 16 % | 30 % | progressive 10–35 % | NSSF + NHIF + AHL + SHIF | TIMS / eTIMS (KRA) |
| Uganda | 18 % | 30 % | progressive | NSSF | EFRIS (URA) |
| Tanzania | 18 % | 30 % | progressive | NSSF / PSSSF | VFD / TRA |
| Rwanda | 18 % | 30 % | progressive | RSSB | EBM (RRA) |
| Ethiopia | 15 % | 30 % | progressive | Pension | Sales Register Machine |
| South Sudan | 18 % | 30 % | progressive | — | — |

### 3.3 IFRS for SMEs
PACT Accounting will follow **IFRS for SMEs** (the standard most EAC tax authorities
recognise). Multi-entity consolidation (intercompany elimination) is Phase 5.

---

## 4. Architecture overview

```
┌────────────────────────────────────────────────────────────────────────┐
│                       Operational pages (existing)                      │
│  Payroll, Wallet, DownPayments, OpsCost, Transport, Fees, Advances,    │
│  Retainers, Withdrawals, BankScans, ProjectExpenses, ClassificationFees│
└────────────────────────┬───────────────────────────────────────────────┘
                         │ DB triggers + service-layer hooks
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Accounting Posting Engine (NEW)                      │
│  ─ resolves source_event → journal template                             │
│  ─ computes tax / WHT lines                                             │
│  ─ converts FX to functional currency at posting date                   │
│  ─ writes to journal_entries + journal_lines (idempotent)               │
└────────────────────────┬───────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    General Ledger (NEW)                                 │
│  chart_of_accounts · journal_entries · journal_lines ·                  │
│  fiscal_periods · gl_balances (mat. view)                               │
└────────────────────────┬───────────────────────────────────────────────┘
                         ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Reports & Settings UI (NEW)                          │
│  /accounting (hub) · /accounting/coa · /accounting/journals ·           │
│  /accounting/reports · /accounting/settings · /accounting/tax           │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Why DB triggers, not application code?
- Idempotency — only one place can ever insert into journal_entries.
- Survives bulk imports, RPC calls, edge-function writes, mobile sync.
- Easier RLS — accounting tables are write-only via `SECURITY DEFINER`
  functions; even admins can't INSERT directly.

### 4.2 Functional vs transactional currency
- **Functional currency:** SDG (Sudan entity), per-entity in Phase 5.
- **Transactional currency:** whatever the source page uses.
- Daily FX rates table (`fx_rates`) populated from a manual upload + optional
  oanda/exchangerate.host fetch.
- All journal lines store `amount_tx`, `currency_tx`, `fx_rate`, `amount_fc`.

---

## 5. Data model (additions)

All new tables live in `public` schema with the prefix `acct_` to keep the
namespace clean and to make RLS policies obvious.

```sql
-- 5.1 Chart of Accounts
acct_accounts (
  id              uuid pk,
  code            text unique,     -- "1100", "4000-NGO", etc.
  name_en         text,
  name_ar         text,
  type            account_type,    -- asset|liability|equity|income|expense
  subtype         text,            -- "current_asset", "cogs", "operating_expense"
  parent_id       uuid fk → acct_accounts,
  currency        text default 'SDG',
  is_postable     bool default true,
  is_system       bool default false,  -- protected built-ins
  tax_code_id     uuid null,
  cost_center_required bool default false,
  archived_at     timestamptz null
)

-- 5.2 Fiscal calendar
acct_fiscal_years   (id, code, start_date, end_date, status open|closed)
acct_fiscal_periods (id, year_id, code, start_date, end_date, status open|soft-closed|closed)

-- 5.3 Journals
acct_journal_entries (
  id           uuid pk,
  number       text unique,         -- "JE-2026-04-00012"
  date         date,
  period_id    uuid fk,
  source_table text,                -- 'payroll_runs','down_payment_requests',...
  source_id    uuid,
  source_hash  text,                -- sha256(payload) for idempotency
  description  text,
  description_ar text,
  status       enum draft|posted|reversed,
  posted_at    timestamptz,
  posted_by    uuid,
  reverses_id  uuid null,           -- self-reference for reversals
  metadata     jsonb,
  UNIQUE (source_table, source_id, source_hash)   -- the idempotency guard
)

acct_journal_lines (
  id             uuid pk,
  entry_id       uuid fk,
  account_id     uuid fk,
  cost_center_id uuid null,
  project_id     uuid null,
  department_id  uuid null,
  partner_id     uuid null,         -- vendor / customer / employee
  debit_tx       numeric(18,2),
  credit_tx      numeric(18,2),
  currency_tx    text,
  fx_rate        numeric(18,8),
  debit_fc       numeric(18,2) generated,
  credit_fc      numeric(18,2) generated,
  tax_code_id    uuid null,
  description    text
)

-- 5.4 Tax
acct_tax_codes (id, code, name_en, name_ar, rate, type vat|wht|payroll|stamp,
                country, recoverable bool, payable_account_id, receivable_account_id)
acct_tax_returns (id, code, period_id, country, type, status draft|filed,
                  filed_at, payload jsonb, attachment_url)

-- 5.5 AR / AP
acct_partners (id, type customer|vendor|employee|government, name_en, name_ar,
               tax_id, country, default_currency, default_account_id,
               payment_terms_days, credit_limit, archived_at)
acct_invoices (id, number, partner_id, type sales|purchase, date, due_date,
               currency, subtotal, tax_total, total, status draft|sent|paid|void,
               source_table, source_id)
acct_invoice_lines (id, invoice_id, account_id, description, qty, unit_price,
                    tax_code_id, amount)
acct_payments (id, partner_id, date, amount, currency, method, bank_account_id,
               reference, status, source_table, source_id)
acct_payment_allocations (id, payment_id, invoice_id, amount)

-- 5.6 Bank & cash
acct_bank_accounts (id, name, currency, gl_account_id, opening_balance, opening_date)
acct_bank_statements (id, bank_account_id, period, file_url, imported_at)
acct_bank_lines (id, statement_id, date, amount, description, matched_payment_id)

-- 5.7 Fixed assets
acct_assets (id, code, name, category, acquisition_date, cost, currency,
             salvage_value, useful_life_months, depreciation_method straight|reducing,
             gl_asset_account_id, gl_dep_expense_id, gl_acc_dep_id, status active|disposed)
acct_asset_movements (id, asset_id, type acquire|depreciate|impair|dispose,
                      date, amount, journal_entry_id)

-- 5.8 Budgets
acct_budgets (id, name, fiscal_year_id, status draft|active|locked, currency)
acct_budget_lines (id, budget_id, account_id, cost_center_id,
                   period_id, amount)

-- 5.9 Cost centers / dimensions
acct_cost_centers (id, code, name, manager_user_id, parent_id, archived_at)
acct_dimensions   (id, name, values jsonb)   -- generic for Donor, Funder, Grant, etc.

-- 5.10 Settings
acct_settings (id singleton row, functional_currency, default_country,
               retain_journal_drafts_days, lock_period_after_days,
               require_dual_approval_above numeric, ...)
```

### 5.1 Idempotency contract for posting
Every source event computes:
```
source_hash = sha256( source_table || source_id || posting_template_version || canonical(payload) )
```
The `UNIQUE (source_table, source_id, source_hash)` index makes the posting
function safe to call N times — same hash returns the existing entry.
Re-posting after an *amendment* changes the payload, the hash changes,
the old entry is **reversed** automatically and a new one posted, with both
linked via `reverses_id`.

---

## 6. Integration map — every page → its journal

This is the core of "fully automated and integrated."

### 6.1 Inventory of every existing source of money

| Source page | Source table | Trigger event | Journal template |
|-------------|--------------|---------------|------------------|
| **PayrollAdmin** approve | `payroll_runs.status='approved'` | `payroll_run_approved` | Dr Salary expense / Dr Statutory expense / Cr Salaries payable / Cr WHT payable / Cr NPF payable |
| **PayrollAdmin** wallet credit (already idempotent) | `wallet_transactions where source='payroll_auto_credit'` | `wallet_credit_payroll` | Dr Salaries payable / Cr Wallet liability (per employee) |
| **Wallet** withdrawal request approved | `withdrawal_requests.status='paid'` | `wallet_withdrawal_paid` | Dr Wallet liability / Cr Bank |
| **Wallet** earning from completed task | `wallet_transactions type='earning'` non-payroll | `task_reward_credit` | Dr Task-reward expense / Cr Wallet liability |
| **DownPaymentRequests** approved | `down_payment_requests.status='approved'` | `down_payment_paid` | Dr Advances to staff / Cr Bank |
| **OperationalCostSubmission** posted | `operational_cost_submissions.status='posted'` | `ops_cost_posted` | Dr Operational expense (by category) / Cr Cash on hand or Advances clearing |
| **TransportationCosts** approved | `transportation_costs.status='approved'` | `transport_cost_posted` | Dr Transport expense / Cr Bank or Advances |
| **ClassificationFees** invoiced | `classification_fee_invoices.status='issued'` | `classification_fee_invoice` | Dr AR / Cr Classification income / Cr VAT payable |
| **ClassificationFees** payment received | `classification_fee_payments.status='received'` | `classification_fee_payment` | Dr Bank / Cr AR |
| **RetainerManagement** monthly run | `retainer_runs.status='approved'` | `retainer_paid` | Dr Retainer expense / Cr Bank or Wallet |
| **SalaryIncrements** approved | `salary_increments.status='approved'` | n/a (no immediate posting; affects next payroll) | — |
| **AdvanceRequests** approved | `salary_advances.status='approved'` | `advance_paid` | Dr Advances to staff / Cr Bank |
| **AdvanceRequests** repaid (deducted from payroll) | included in payroll lines | `advance_repaid` | Dr Salaries payable / Cr Advances to staff |
| **TransactionScanner** matched | `bank_transaction_scans.status='matched'` | `bank_match` | (no GL impact — only matches existing entries) |
| **MyExpenses** (new H3) approved | `expense_claims.status='approved'` | `expense_claim_posted` | Dr Expense (by category) / Cr Wallet liability or Cash |
| **Project budget consumption** | derived from above | `budget_check` | (not a posting; hard / soft block) |
| **EOSB monthly accrual** (new H8) | cron | `eosb_accrual` | Dr EOSB expense / Cr EOSB liability |
| **Depreciation monthly run** | cron `acct_assets` | `asset_depreciate` | Dr Depreciation expense / Cr Accumulated depreciation |
| **FX revaluation period close** | cron | `fx_reval` | Dr/Cr FX gain or loss / Cr/Dr revalued account |

### 6.2 Posting template registry
Templates live in code (`src/services/accounting/postingTemplates.ts`) so we can
version them. Each template:
```ts
{
  event: 'payroll_run_approved',
  version: '1.0',
  build({sourceRow, settings, fxRate, taxCodes}) {
    return {
      lines: [
        { accountCode: '6100', debit: gross_salary, costCenter: dept, ...},
        { accountCode: '2210', credit: wht_amount, taxCodeId: 'WHT-PIT', ...},
        ...
      ],
    };
  }
}
```
The DB trigger calls `posting_engine.post(event, source_table, source_id)` which
loads the row, calls the template builder, and inserts the entry + lines atomically.

### 6.3 Statutory payroll calculator (closes gap H10)
A pure-SQL function `calculate_payroll_statutory(p_user_id, p_gross, p_country)`
returns `{pit, social_employee, social_employer, zakat, eosb_accrual}` based on
country-specific brackets stored in `acct_payroll_brackets`. Brackets are
seedable via the Settings page → "Payroll Tax Brackets" sub-tab.

---

## 7. Settings module (the "everything is configurable" promise)

Every accounting page has a corresponding settings page. Top-level navigation:

```
/accounting                 → Hub (KPIs + recent journals + open period banner)
/accounting/coa             → Chart of Accounts (tree, reorder, archive, import/export)
/accounting/journals        → Journal entries (list, drill-down, reverse, attach)
/accounting/journals/new    → Manual journal (admin-only)
/accounting/ar              → Customers + sales invoices + receipts
/accounting/ap              → Vendors + bills + payments
/accounting/bank            → Bank accounts + statements + reconciliation
/accounting/assets          → Fixed asset register + depreciation runs
/accounting/budgets         → Budget vs Actual builder
/accounting/tax             → Tax codes + tax returns + filings
/accounting/reports         → Report library (see §8)
/accounting/settings        → ⚙ Settings hub (see below)
```

### 7.1 Settings sub-pages
| Sub-page | What it controls |
|----------|------------------|
| **General** | Functional currency · default country · fiscal year start month · journal numbering format · multi-entity toggle |
| **Chart of Accounts** | Built-in CoA template per country (Sudan, Kenya, Uganda, …) · custom adds · merge / archive |
| **Tax Codes** | Per-country VAT, WHT, payroll brackets · effective dates · linked GL accounts |
| **Currencies & FX** | Active currencies · daily rate source (manual / API) · revaluation cadence |
| **Cost Centers & Dimensions** | Hierarchy of cost centers · custom dimensions (Donor, Grant, Program) |
| **Posting Rules** | Per-event posting template overrides (advanced) · enable/disable an event |
| **Approvals** | Threshold-based dual approval · journal types requiring extra sign-off |
| **Period Close** | Soft-close vs hard-close rules · who can re-open · checklist items |
| **Reports Settings** | Default date ranges · favorite reports · scheduled email of P&L / BS to roles · branding (logo, address, tax ID on PDFs) |
| **Numbering** | Per-document-type sequences (INV-, BILL-, JE-, RCP-, EXP-) with year prefix |
| **Audit & Retention** | Journal retention · who can reverse · auto-archive of old fiscal years |
| **Integrations** | TIMS/EFRIS/EBM/VFD device pairing · bank-feed connectors · mobile-money APIs (M-Pesa, Airtel) |

---

## 8. Reports library

Every report exports to PDF + Excel + CSV, supports drill-down to journal,
and can be scheduled (Phase 4). Bilingual labels.

### 8.1 Statutory & management reports
- **Trial Balance** (any date)
- **General Ledger** (account · period · cost center filter)
- **Profit & Loss** (period vs prior-period vs budget)
- **Balance Sheet** (any date)
- **Cash Flow Statement** (direct + indirect)
- **Statement of Changes in Equity**
- **AR Aging** (current, 1-30, 31-60, 61-90, 90+) — already exists in fragments
- **AP Aging**
- **Bank Reconciliation Summary**
- **Fixed Asset Register** + depreciation schedule
- **Budget vs Actual** (per cost center / project / dimension)

### 8.2 Tax reports
- **VAT Return** (per country, with eTIMS/EFRIS/EBM payload export)
- **WHT Return**
- **PAYE / PIT Summary** + per-employee certificate
- **Social Insurance Contribution Schedule**
- **Zakat Computation**
- **Stamp Duty Register**

### 8.3 Operational dashboards
- **Funder / Donor utilization** (uses `acct_dimensions` "Donor")
- **Project profitability** (revenue – attributed expenses per project)
- **Department spend vs budget** (manager-facing, links to `MyTeam`)
- **Wallet liability ageing** (how long money has been owed to staff)

---

## 9. Phased roadmap

### Phase 0 — HR-Audit close-out (1 week)
Close H1, H7, H10 from §2.
- H1 trigger on `salary_increments` → `employee_salary_config`.
- H7 wire NotificationTriggerService into AdvanceRequests.
- H10 statutory payroll lines (with placeholder rates; refined in Phase 3).

**Deliverable:** payroll calculations are accurate; nothing left silently broken
in HR.

---

### Phase 1 — Foundation (2-3 weeks)
- New tables §5.1–5.3, 5.10 (CoA · fiscal calendar · journals · settings).
- `/accounting`, `/accounting/coa`, `/accounting/journals`, `/accounting/settings/general`.
- Seed Sudan default CoA (≈ 120 accounts).
- Journal viewer with filters + PDF export.
- Manual journal entry form (admin-only).
- Period soft-close.
- RLS: only `super_admin` and `finance` roles can read GL; `accountant` role can
  draft entries; only `super_admin` + `finance` can post.

**Deliverable:** real ledger exists; an accountant can record any transaction
manually and see Trial Balance.

---

### Phase 2 — Core posting automation (3-4 weeks)
- Posting Engine + template registry (§6.2).
- DB triggers on every source table from §6.1 (5–10 templates).
- Idempotency hash + reversal flow.
- Wallet, Payroll, DownPayments, OpsCost, Transport — first wave.
- `/accounting/journals` shows source-link badges back to operational pages.
- Settings → Posting Rules sub-page (toggle / override per event).

**Deliverable:** every wallet credit / payroll approval / down-payment payout
auto-posts a journal. Trial Balance reconciles to wallets + bank.

---

### Phase 3 — AR / AP / Tax (3-4 weeks)
- Tables §5.4–5.6.
- `/accounting/ar`, `/accounting/ap`, `/accounting/tax`.
- Tax-code calculator + first reports: VAT Return, WHT Return, PAYE.
- Customer & vendor masters; partial-payment allocation.
- ClassificationFees + RetainerManagement post to AR / AP.
- Statutory bracket data per country (Sudan first; Kenya + Uganda next).

**Deliverable:** finance can issue an invoice, receive payment, file a VAT
return — all without leaving PACT.

---

### Phase 4 — Reports + Settings polish (2-3 weeks)
- Full report library §8.1 + §8.2.
- Scheduled email reports.
- Per-page branding, multi-language PDF.
- Reports Settings sub-page.
- Funder / project / dimension dashboards.

**Deliverable:** monthly close packet (P&L + BS + CFS + AR/AP aging) generated
in one click.

---

### Phase 5 — Bank, Assets, Budget, Multi-entity (3-4 weeks)
- Bank statement import (CSV + OFX).
- Reconciliation matcher + suggestions (re-uses `TransactionScanner`'s OCR).
- Fixed Assets register + monthly depreciation cron.
- Budget builder + Budget-vs-Actual report + soft block on over-budget journals.
- Multi-entity: per-entity functional currency + intercompany eliminations.

**Deliverable:** complete accounting system; PACT can run multiple legal
entities (Sudan, Kenya, …) under one roof.

---

### Phase 6 — Real-time fiscalisation + advanced (open-ended)
- KRA TIMS / eTIMS device integration (Kenya).
- URA EFRIS integration (Uganda).
- RRA EBM (Rwanda) + TRA VFD (Tanzania).
- Mobile-money auto-import (M-Pesa, Airtel Money, Sudan EBS).
- AI suggestions on journal coding (Gemini).
- Audit-log export in tax-authority format.

**Deliverable:** 100 % compliant real-time invoicing across EAC.

---

## 10. Migration & data-seed plan

### 10.1 No big-bang
- Phase 1 lands the empty ledger; existing pages keep working unchanged.
- Phase 2 starts posting **only new** events from a configurable cut-over date
  (`acct_settings.posting_cutover_date`).
- Historical reconstruction is done by a one-shot back-fill RPC per source table,
  run at the user's pace.

### 10.2 Sudan default CoA seed
Provided as `supabase/seeds/sudan_chart_of_accounts.sql` covering:
- 1xxx Assets (Cash, Banks, AR, Advances, Inventory, Fixed Assets …)
- 2xxx Liabilities (AP, Accruals, Wallet liability, EOSB liability, Tax payable …)
- 3xxx Equity (Capital, Retained earnings, FX reserve …)
- 4xxx Income (Service income, Classification income, Donor income, Other …)
- 5xxx COGS (Direct salaries, Direct project costs …)
- 6xxx Operating expenses (Admin salaries, Rent, Utilities, Travel …)
- 7xxx Statutory (PIT expense, NPF expense, Zakat expense …)
- 8xxx Other / FX gain or loss / Interest

A "Customise" wizard adds Kenya / Uganda / etc. variants on top of the same skeleton.

### 10.3 RLS strategy
| Role | Read GL | Draft journal | Post journal | Reverse | Close period | Settings |
|------|---------|---------------|--------------|---------|--------------|----------|
| `super_admin` | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| `finance` | ✔ | ✔ | ✔ | with reason | ✔ | ✔ |
| `accountant` (new) | ✔ | ✔ | with co-approval | ✘ | ✘ | ✘ |
| `manager` | own cost-center summary | ✘ | ✘ | ✘ | ✘ | ✘ |
| `employee` | own wallet only | ✘ | ✘ | ✘ | ✘ | ✘ |

All write functions are `SECURITY DEFINER` and carry their own role check; raw
INSERTs into `acct_*` tables are denied to all roles via RLS.

---

## 11. Open questions for finance lead

These shape how aggressive the automation can be:

1. **Functional currency** — SDG only, or one entity per country with its own?
2. **Cost-center taxonomy** — by Department, by Project, by Donor, or all three?
3. **Period close cadence** — monthly soft-close + quarterly hard-close?
4. **Journal-numbering format** — `JE-YYYY-MM-NNNNN` or per-source prefix
   (`PAY-`, `INV-`, `RCP-`)?
5. **VAT registration status** — is the Sudan entity VAT-registered today? Same
   for any planned EAC entities?
6. **EOSB formula** — Sudan labour law (1 month per year for first 3, ½ month
   thereafter) vs custom contractual terms per employee?
7. **Wallet → bank withdrawal cadence** — daily, weekly, on-request? Drives
   how aggressive the bank-feed reconciliation needs to be.
8. **Existing chart of accounts** — does any historical CoA already live in
   spreadsheets we should match for continuity?

---

## 12. Effort estimate

| Phase | Engineering | Finance review | Calendar |
|-------|-------------|----------------|----------|
| 0 — HR audit close | 1 dev-week | 1 day | 1 week |
| 1 — Foundation | 3 dev-weeks | 3 days | 3 weeks |
| 2 — Core automation | 4 dev-weeks | 1 week | 4 weeks |
| 3 — AR/AP/Tax | 4 dev-weeks | 1 week | 4 weeks |
| 4 — Reports | 3 dev-weeks | 3 days | 3 weeks |
| 5 — Bank/Assets/Budget/Multi | 4 dev-weeks | 1 week | 4 weeks |
| 6 — Fiscalisation | open | open | open |
| **Total to "fully usable accounting"** | **~19 dev-weeks** | **~4 weeks** | **~5 months** |

Phases 0-3 deliver an accounting system that already removes 80 % of the
manual work; phases 4-5 push to full QuickBooks/Odoo parity for our scope.

---

## 13. What we are intentionally **not** doing in this plan

- Inventory / stock accounting (PACT is a service org).
- Manufacturing cost accounting / WIP.
- Public-company-grade IFRS disclosures.
- Cryptocurrency wallets.
- SOC-2 / ISO 27001 audit pack (separate workstream).

These can be added as a post-Phase-5 module if the business pivots there.

---

## 14. Definition of done (per phase)

- ✔ All new tables have RLS policies + indexes covering hot queries.
- ✔ Every posting trigger has an idempotency test (insert, re-insert, expect 1 row).
- ✔ Every report has bilingual EN/AR labels and a PDF + Excel exporter.
- ✔ Every settings page is gated by RLS to `super_admin` + `finance`.
- ✔ Trial Balance always balances to zero — verified by a daily edge-function
  health-check that pages a Slack channel if it doesn't.
- ✔ Documentation in `docs/accounting/` for accountants (non-technical).
- ✔ A 1-page changelog in `/changelog` per phase release.

---

*End of plan.*


<a id="doc-7"></a>
---

# 7. Accounting — Reporting, Charting & Projection Extension

> **File:** `docs/ACCOUNTING_REPORTING_EXTENSION.md (not yet saved)`  
> **Status:** DRAFT — currently only an unsaved tab in your editor. To include here, save it to `docs/ACCOUNTING_REPORTING_EXTENSION.md` and re-run the assembly script.

_(file not found in repo — placeholder)_
