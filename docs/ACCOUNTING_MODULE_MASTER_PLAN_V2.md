# PACT Accounting & Finance Module — Master Plan **(Version 2)**

**Status:** Proposed · **Owner:** Finance + Engineering · **Last updated:** 2026-04-24
**Supersedes:** `docs/ACCOUNTING_MODULE_MASTER_PLAN.md` (v1)
**Target compliance:** Sudan (Income Tax, VAT, Zakat, Social Insurance) + East African
Community (Kenya, Uganda, Tanzania, Rwanda, Ethiopia, South Sudan)
**Scope:** Full, audit-compliant double-entry accounting system, integrated with every
existing PACT page that touches money — exposed via REST + GraphQL APIs, with
notification service wiring, bilingual EN/AR (RTL), multi-currency, multi-entity
(branch) capabilities, **and a full reporting / charting / projection layer** baked
in from day one.

---

## Table of contents

- **Part A — Core platform (ledger, APIs, multi-entity, banking, AI)**
  - §0 What's new in v2
  - §1 System overview
  - §2 Functional requirements (2.1 – 2.11)
  - §3 Technical notes
  - §4 Core deliverables
  - §5 Relationship to v1
- **Part B — Reporting, charting & projections**
  - §6 Reporting & analysis requirements (6.1 – 6.6)
  - §7 Reporting deliverables (`/reports/*` routes + charting + alerts)
  - §8 Resolved assumptions
- **Cross-cutting**
  - §9 Open questions for product owner
  - §10 Suggested build sequence
  - §11 Out of scope (explicit non-goals)

---

# Part A — Core platform

## 0. What's new in v2

Version 2 expands v1 with the deliverables explicitly requested by the product owner:

| Area | v1 | v2 additions |
|---|---|---|
| API surface | Internal only | **Public REST + GraphQL**, OAuth2 / JWT scopes, OpenAPI docs, webhooks |
| Multi-entity | Single org | **Branch-aware COA** with consolidation engine + intercompany clearing |
| Currency | SDG focus | **Transactional vs. functional currency**, FX revaluation at period close, FX gain/loss auto-reversal |
| Notifications | Mentioned | **Dedicated notification service plan** (in-app + email + SMS, audit-logged) |
| Banking | Manual recon | **Bank feed reconciliation engine with AI suggestions**, mobile-money APIs (M-Pesa, Airtel, Sudan EBS) |
| AI | Out of scope | **AI journal coding suggestions, anomaly detection, chat-based query interface** |
| Reporting | Statutory only | **Full reporting layer** — financial / project / cost-center / scenario / forecast — with bilingual EN/AR exports (PDF / Excel / CSV) and audit pack generator (see Part B) |
| Architecture | Monolithic | **Modular / domain-driven** with CI/CD migration scripts and a posting-engine test suite |

Everything in v1 stays valid — v2 is a **superset**, not a rewrite.

---

## 1. System overview

- **Full double-entry accounting system**, compliant with **IFRS for SMEs**.
- Integrated with all existing operational pages: **payroll, wallets, expenses,
  advances, transport, retainers, withdrawals**.
- **Automated journal posting** with idempotency keys and immutable audit trails.
- **Multi-currency and multi-entity** support (Sudan + East African Community).
- **Bilingual EN/AR interface** with RTL layout switching (already standard in PACT).
- **Notification service integrated** for approvals, postings, reversals and alerts.
- **Reporting / charting / projection layer** built on top of the GL (see Part B).

---

## 2. Functional requirements

### 2.1 Accounts & Chart of Accounts (COA)

- Multiple account types (**Assets, Liabilities, Equity, Revenue, Expenses**) with
  sub-types (current / non-current, operating / non-operating, etc.).
- **Branch-specific COA** with a consolidation engine that rolls up to a group COA.
- **Hierarchical accounts** (parent → child, unlimited depth) with mapping rules
  for **intercompany eliminations**.
- COA versioning so historical reports remain reproducible after restructures.

### 2.2 Currency management

- **Transactional currency** (the currency the deal is denominated in) vs.
  **functional currency** (the entity's reporting currency).
- **FX rates captured at transaction date**, then **revalued at period close** using
  the period-end rate.
- Every monetary column is stored as a pair: `original_amount` + `original_currency`
  alongside `functional_amount` + `functional_currency`.
- **FX gain / loss auto-reversal** at the start of the next period for balance-sheet
  monetary items.

### 2.3 Project-based accounting

- Every transaction can be **linked to a project** (already a first-class entity in
  PACT) **and to a cost center** (new entity — see §9 Q1).
- Track **project budgets, costs, committed spend and actuals**.
- Generate **project-level profitability reports** (revenue – direct cost –
  allocated overhead) — surfaced in `/reports/project` (Part B).

### 2.4 User roles & permissions

- **Role-based access**: Admin, Finance, Accountant, Auditor, Branch Manager,
  Employee.
- **Location-based permissions** so a branch manager only sees their branch's data.
- **Audit-trail visualizer** that shows, for any record, who did what and when —
  surfaced from the immutable journal log and the existing PACT audit tables.

### 2.5 Intercompany transactions

- **Branch-to-branch transfers** with **reciprocal entries** auto-posted on both
  sides.
- **Clearing accounts per branch** so intercompany balances net to zero on
  consolidation.
- **Approval workflow** for intercompany requests, reusing the existing PACT
  approval framework.

### 2.6 Compliance & statutory reporting

- Generate statutory reports: **VAT, WHT, PIT, Social Insurance, Zakat**.
- **Audit pack generator**: Trial Balance, General Ledger, sub-ledgers, supporting
  document URLs — all exportable as a single ZIP.
- **Bank reconciliation** and **fixed asset register** (with depreciation
  schedules).
- **Bilingual EN/AR exports** in PDF, Excel and CSV — all column headers, totals
  and labels translated.

### 2.7 API integration

- **REST + GraphQL endpoints** for journals, COA, invoices, payments, assets,
  budgets, **reports** (Part B endpoints exposed under the same surface).
- **Webhooks** for external integrations (bank feeds, payroll, procurement).
- **OAuth2 / JWT authentication** with role-based scopes (e.g.
  `journals:read`, `journals:post`, `coa:admin`, `reports:read`).
- **API versioning** (`/api/v1/...`, `/api/v2/...`) and **OpenAPI documentation**
  auto-generated from the schema.

### 2.8 Notifications

- **Integrated notification service** for approvals, postings, reversals — and for
  reporting events (see §6.5).
- **Role-based delivery** (finance, managers, employees) — same routing rules as
  existing PACT notifications.
- **Channels**: in-app, email, SMS (configurable per user).
- **Audit log of notifications** for compliance — every send is recorded with
  recipient, channel, payload and delivery status. Reused by Part B's threshold
  alerts.

### 2.9 Banking & treasury

- **Bank feed reconciliation engine** with **AI suggestions** for matching
  statement lines to journal entries.
- **Cash position dashboard** (multi-bank, multi-currency, real-time).
- **Payment batching and authorization workflow** (maker / checker / approver).
- **Mobile money API integration**: M-Pesa, Airtel Money, Sudan EBS.

### 2.10 Advanced analytics (foundational hooks)

- **Predictive cash-flow forecasting** (extends the existing PACT cash-flow
  forecaster) — full UI in `/reports/forecast` (Part B).
- **Variance analysis**: budget vs. actual vs. forecast — full UI in
  `/reports/scenario` (Part B).
- **Automated ratio analysis**: liquidity, profitability, efficiency ratios —
  surfaced in `/reports/financial` (Part B).
- **BI integration**: Power BI connector + Supabase dashboards.

### 2.11 AI-assisted accounting

- **AI journal coding suggestions** — proposes the right COA accounts for a given
  transaction description.
- **Anomaly detection** for unusual transactions (amount, frequency, vendor) —
  reused by Part B for spending anomalies.
- **Chat-based query interface** for accountants ("what was our travel spend in
  Khartoum branch last quarter?"). **Single chat** — also handles report queries
  from Part B (no second chat UI).

---

## 3. Technical notes

- **Modular architecture** — domain-driven design with clear bounded contexts
  (Ledger, AR, AP, Banking, Tax, Reporting).
- **Database schema supports multi-branch and multi-currency** from day one — no
  retrofitting later.
- **Environment variables** for: API keys, FX rate sources, fiscal-device
  connectors, mobile-money credentials.
- **CI / CD pipeline** with schema migration scripts (Supabase migrations folder,
  same pattern PACT already uses).
- **Testing suite** for the posting engine and reports — every journal must
  balance, every report must reconcile to the GL.

---

## 4. Core deliverables

1. **Database schema**: accounts, COA, journals, partners, invoices, payments,
   assets, budgets — all with branch + currency awareness.
2. **API documentation**: endpoints, parameters, authentication, error codes —
   served as OpenAPI + GraphQL schema.
3. **Notification service integration plan** — event matrix, channel routing,
   delivery audit table.
4. **Integration plan for existing pages and modules** — exact touch-points where
   payroll, wallets, expenses, advances, transport, retainers and withdrawals
   will start posting to the GL.
5. **Example code snippets** for: posting transactions, generating reports, and
   sending notifications — to onboard new engineers quickly.

---

## 5. Relationship to v1

| v1 section | v2 disposition |
|---|---|
| §1 Operational pages inventory | **Reused as-is** — same source pages feed the new GL |
| §2 HR audit gaps (H1–H10) | **Done / in progress** — tracked in the current sprint, not in v2 scope |
| §3 Proposed ledger schema | **Extended in v2** with `branch_id`, `original_currency`, `functional_currency`, FX columns |
| §4 Posting engine design | **Extended in v2** with idempotency keys, intercompany reciprocal auto-post, and AI coding hooks |
| §5 Statutory reports | **Extended in v2** with bilingual EN/AR exports, audit pack generator, and the full reporting layer (Part B) |
| §6 Roll-out plan | **Re-sequenced in v2** to ship API + notifications **before** UI polish, so external integrations can start early |

---

# Part B — Reporting, charting & projections

This part assumes the Part A GL is live: journals are posted, branches are defined,
FX rates are captured, and the API surface exists. Part B reads from that ledger
and adds the reporting / charting / projection / alerting layer on top.

---

## 6. Reporting & analysis requirements

### 6.1 Financial reports

- **Trial Balance, General Ledger, Profit & Loss, Balance Sheet, Cash Flow.**
- **Statement of Changes in Equity.**
- **AR / AP Aging, Bank Reconciliation, Fixed Asset Register.**

### 6.2 Project & cost-center reports

- Every project linked to a **cost center**.
- **Project profitability** (revenue – attributed expenses).
- **Department spend vs budget.**
- **Donor utilization** dashboards.
- **Wallet liability ageing.**

### 6.3 Scenario & projection reports

- **Budget vs Actual vs Forecast.**
- **Best-case / worst-case projections.**
- **Cash-flow forecasting** by project, branch, and cost center.
- **Variance analysis** charts (monthly, quarterly, yearly).
- **Sensitivity analysis** — impact of FX changes, tax changes, payroll
  adjustments.

### 6.4 Visualization & dashboards

- **Interactive charts**: bar, line, pie, waterfall, stacked area.
- **Drill-down dashboards** for managers and auditors.
- **Scheduled email reports** with charts embedded.
- **Export to PDF, Excel, CSV** with bilingual EN/AR labels.

### 6.5 Reporting notifications

- **Alerts** when reports are generated or thresholds breached (e.g.
  overspending).
- **Role-based delivery** (finance, managers, employees).
- **Channels**: in-app, email, SMS.
- **Audit log** of notifications for compliance — reuses the §2.8 notification
  log table; no new table needed.

### 6.6 AI-assisted analytics

- **Predictive cash-flow forecasting** using historical journals.
- **Automated ratio analysis** (liquidity, profitability, efficiency).
- **Anomaly detection** for unusual spending patterns — reuses §2.11 detection
  pipeline.
- **Chat-based query interface** ("Show me all projects over budget this
  quarter") — **same chat as §2.11**, not a separate UI.

---

## 7. Reporting deliverables

A **report library** with five top-level routes:

| Route | Purpose | Primary audience |
|---|---|---|
| `/reports/financial` | Trial Balance, GL, P&L, Balance Sheet, Cash Flow, Equity, AR/AP Aging, Bank Recon, Fixed Assets | Finance, Auditors |
| `/reports/project` | Project profitability, project spend vs budget, donor utilization, wallet liability ageing | PMs, Country Director, Finance |
| `/reports/cost-center` | Department / cost-center spend vs budget, allocations, hierarchy roll-ups | Branch Managers, Finance |
| `/reports/scenario` | Budget vs Actual vs Forecast, best/worst case, sensitivity (FX / tax / payroll) | Finance, Country Director |
| `/reports/forecast` | Predictive cash flow by project / branch / cost-center, variance trends | Finance, Treasury |

Plus:
- **Charting engine** integrated with accounting data (Recharts wrappers — see §8).
- **Notification service tied to reporting events** (generation + threshold
  breaches) — reuses §2.8 service.
- **Example code snippets** for generating charts and projections — bundled in
  `docs/guides/` once the engine ships.

---

## 8. Resolved assumptions (Part B)

These were open questions from the initial review of the reporting brief; resolving
them upfront so implementation isn't blocked.

1. **Bilingual labels** reuse the existing PACT EN/AR translation pattern
   (`BILINGUAL_EMAIL_TEMPLATES.md` style), not a new translation system.
2. **AI chat is a single interface** shared with §2.11 — same chat box answers
   ledger queries and report queries.
3. **Charting library is Recharts** (already in PACT, per `replit.md`) for
   bar / line / pie / stacked area. Waterfall is built as a custom composed
   chart on top of Recharts (see §9 Q3).
4. **Audit-log of notifications** writes to the existing notification log table —
   no new audit table needed.
5. **Scheduled email** uses the existing IONOS SMTP integration; chart-image
   rendering decision is in §9 Q4.

---

# Cross-cutting

## 9. Open questions for product owner

These cannot be assumed — they need product / finance input before scoping.

### Part A questions

- **A1. Branches scope on day one** — which legal entities / branches should be
  live in the first cut? (Khartoum HQ + which EAC offices?)
- **A2. Functional currency per entity** — confirm SDG for Sudan, USD for HQ
  consolidation, local currency for each EAC branch.
- **A3. Mobile-money providers priority** — M-Pesa first, then Airtel, then Sudan
  EBS? Or parallel?
- **A4. AI provider** — reuse the existing Gemini 2.0 Flash + Groq stack already
  wired into PACT, or evaluate a dedicated finance-tuned model?
- **A5. External API consumers** — who is the first external system that will call
  our REST / GraphQL endpoints? That drives the auth scopes we need to define
  first.

### Part B questions

- **B1. Cost-center model.** PACT has no `cost_centers` entity yet. Proposal:
  add a `cost_centers` table with `id`, `code`, `name_en`, `name_ar`,
  `branch_id`, `parent_id`, `manager_id`, `active`. Confirm hierarchy depth
  and whether a project can belong to **one** or **many** cost centers.
- **B2. Donor model.** Are donors a new partner type on the existing CRM
  `partners` table, or a dedicated `donors` table? (Recommend extending
  `partners` with `is_donor` flag + donor-specific columns.)
- **B3. Waterfall charts.** Recharts has no native waterfall component. Options:
  (a) custom composed chart using Bar + reference lines (cheap, ~1 day),
  (b) add `recharts-waterfall` or similar (one more dep), (c) drop waterfall
  from the v1 of the reporting layer. Pick one.
- **B4. Server-side chart rendering for email.** Three options: (a) headless
  Chromium via Playwright (heavy, flexible), (b) QuickChart-style image API
  (fast, less flexible), (c) skip embedded charts and link to the live
  dashboard. Pick one before scheduled-email work begins.
- **B5. Threshold-alert rule engine.** Need a `report_alert_rules` table:
  `id`, `report_key`, `metric`, `comparator` (`gt` / `lt` / `pct_over`),
  `threshold`, `period` (`day` / `week` / `month` / `quarter`),
  `notify_roles[]`, `notify_channels[]`, `active`, `created_by`. Confirm this
  shape covers the alert types finance actually wants.
- **B6. Sensitivity analysis engine.** Recommend a dedicated SQL RPC
  `compute_sensitivity_scenario(p_scenario_id, p_variables jsonb)` rather
  than client-side recompute, so the same scenario produces the same numbers
  in API + UI + email. Confirm acceptable.
- **B7. Drill-down depth.** How many levels deep should drill-down go on the
  dashboards? (e.g. P&L line → GL account → journal entry → source document.)
  This drives how much pre-aggregation we cache vs. compute on demand.
- **B8. Refresh cadence.** Are reports near-real-time (recompute on every
  journal post) or batch (nightly snapshot)? Cost-of-compute vs. freshness
  trade-off.

---

## 10. Suggested build sequence

Part A blocks Part B — Part B has nothing to read from until the GL exists.

### Part A — Core platform

1. **Foundations** — `branches`, COA, FX rates, audit tables.
2. **Posting engine** — idempotency keys, journal validation, intercompany auto-post.
3. **Existing pages → GL** — wire payroll, wallets, expenses, advances, transport,
   retainers, withdrawals to post journals.
4. **APIs** — REST + GraphQL + OAuth2/JWT scopes + OpenAPI docs.
5. **Notification service** integration (§2.8) — reused throughout.
6. **Banking & treasury** — bank feeds, mobile-money APIs, payment batching.
7. **AI hooks** — journal coding, anomaly detection, chat (§2.11).

### Part B — Reporting layer

8. **Reporting foundations** — `cost_centers` table + donor flag on partners +
   API read endpoints. *(blocks every report below)*
9. **Financial reports** — Trial Balance → GL → P&L → Balance Sheet → Cash Flow
   → Equity → AR/AP Aging → Bank Recon → Fixed Assets.
10. **Charting engine** — Recharts wrapper components for bar / line / pie /
    stacked area, with a bilingual axis-label helper. Waterfall last.
11. **Project & cost-center reports** — built on top of #8.
12. **Scenario & projection reports** — `scenarios` table + sensitivity RPC +
    forecast RPC. Variance charts on top.
13. **Reporting notifications & alerts** — `report_alert_rules` + scheduled job
    that evaluates rules and dispatches via the §2.8 notification service.
14. **AI assistance for reports** — predictive forecasting model + anomaly
    detection + chat interface (shared with §2.11).
15. **Scheduled email reports** — last, because it depends on the chart engine,
    notification service, and the rendering decision in §9 B4.

---

## 11. Out of scope (explicit non-goals)

- **HR audit gaps (H1–H10)** — tracked separately in the current sprint.
- **Statutory tax-authority filing portals** — covered by §2.6; this plan only
  produces the data, not the e-filing transport.
- **Mobile-app reporting UI** — desktop / web first. The Flutter app can read
  the same APIs in a later phase.
- **Replacing existing operational pages** — the plan adds a GL + reporting layer
  *underneath* them, never in front of them.

---

*End of Version 2 plan (consolidated). Sign-off needed from Finance + Engineering
on §9 open questions before breaking work into project tasks.*

---

# Part C — Version 3 addendum: gap analysis & phased rollout

**Status:** Proposed · **Last updated:** 2026-04-24
**Purpose:** v3 is an addendum, not a rewrite. It captures the gaps between what v2
proposes and what already exists (or is missing) in the live PACT codebase, then
re-sequences delivery into shippable phases.

---

## 12. Reality check — what's already in PACT

A walk through the codebase surfaced a lot of finance plumbing v2 didn't credit:

### 12.1 Already implemented (v2 should reuse, not rebuild)

| Capability | Where it lives today | v2 implication |
|---|---|---|
| **FX rates** table + service + UI | `exchange_rates` table, `src/services/exchangeRate.service.ts`, `ExchangeRates.tsx` | **§2.2 already half-built** — wire it to journals; don't design from scratch. |
| **Statutory deductions** (Sudan PIT, Social Insurance, Zakat) | `payroll_statutory_brackets` table + `computeStatutoryDeductions()` in `PayrollAdmin.tsx` (H10, current sprint) | **§2.3 / §2.6 already partly done** — payroll → GL just needs the journal post. |
| **3-tier approval engine** | `src/services/approval-workflows.service.ts` (+ `approval_workflows`, `task_approvals`, `task_approval_records`) | **§2.5 / §2.7 reuse**, don't introduce a new approval framework. |
| **Notifications service** with channel matrix | `NotificationTriggerService` → in-app + **email** (IONOS SMTP) + **WhatsApp** (Wasender) + **FCM push** (mobile) | **§2.8 understates today's reality** — v2 says "in-app + email + SMS"; the platform actually has **WhatsApp** and **push**, not SMS. v3 corrects this. |
| **AI / OCR pipeline** | `scan-transaction` edge function (Gemini 2.0 Flash → Groq fallback), `TransactionScanner.tsx` | **§2.11 AI journal coding gets a head-start** — feed scanner output into proposed journal lines. |
| **Pseudo-ledger** for field staff | `wallets` + `wallet_transactions` | **Migration question** — does the new GL absorb wallets, or do they stay parallel as a sub-ledger? Open question (Q-C5 below). |
| **Consolidated financial view** | `ConsolidatedFinancialTab.tsx` | **§2.10 already aggregates P&L / BS** from operational tables — the v3 "Phase 1 GL" can replace its data source without redesigning the UI. |
| **Reconciliation dashboard** | `ReconciliationDashboard.tsx` | **§6.1 already exists in skeleton form** — it just needs the GL behind it. |
| **Cash-flow forecaster + duplicate-payment detector + period-close + budget vs actual** | per `replit.md` | **§6.3 already partly delivered** — v3 phases extend rather than reintroduce. |
| **Recharts** | `src/components/ui/chart.tsx` | **§6.4 chart engine** — confirmed; just need the wrappers. |
| **Webhooks infrastructure** | `moda-webhook`, `whatsapp-webhook`, `google-calendar-oauth` edge functions | **§2.7 webhooks pattern is proven** — clone it for bank-feed / payroll / procurement webhooks. |
| **Hubs + Departments** | `hubs`, `departments` tables (with hierarchy + manager) | **Branch / cost-center proxies** — v3 proposes mapping rather than introducing brand-new `branches` + `cost_centers` tables on day one. |
| **CRM Partners** | `partners` table (engagements, contacts, opportunities) | **Vendor / customer / donor host** — extend with flags (`is_vendor`, `is_customer`, `is_donor`) instead of creating parallel tables. |
| **Existing report pages** | `/reports/advance-requests`, `/cost-submission-reports`, `/wallet-reports`, `/project-analytics`, `/reconciliation`, `/salary-retainer-report`, `/notification-analytics` | **v2 §7 silently orphans these** — v3 says: keep them; the new `/reports/financial` etc. **link to** the existing pages where they cover the same ground, not replace them. |

### 12.2 Already partly proposed in code/docs but never finished

| Item | State | v3 action |
|---|---|---|
| `acct_accounts`, `acct_journal_entries`, `acct_journal_lines`, `acct_fiscal_years`, `acct_fiscal_periods`, `acct_tax_codes`, `acct_assets`, `acct_budgets` | **Defined in v1 master plan, partially scaffolded** | Phase 1 finalises them. Use the v1 names (`acct_*` prefix) for consistency. |

### 12.3 Genuinely missing — v2 was right that these don't exist

| Missing capability | Notes |
|---|---|
| **GL posting** from any operational page | Zero pages currently emit journal entries. This is the headline gap. |
| **Real `branches` / legal entities** | Hubs ≠ legal entities; needed before consolidation, intercompany, FX revaluation can ship. |
| **Public REST / GraphQL surface** | Only Supabase's auto-generated PostgREST + Realtime exist; no versioned `/api/v1/...`, no GraphQL schema, no per-scope OAuth tokens. |
| **OpenAPI docs** outside Supabase Studio | Need a published spec for external consumers. |
| **Bank feed integrations** (Plaid / Yodlee / local equivalents) | None. |
| **Mobile-money APIs** (M-Pesa, Airtel, EBS) | Only constants and references in code; no live API. |
| **Intercompany clearing accounts + auto-reciprocal posting** | None. |
| **FX revaluation at period close** | Rates exist; revaluation engine doesn't. |
| **Audit pack generator** (ZIP of TB + GL + supporting docs) | None. |
| **Fixed asset register UI + depreciation schedule** | Table planned, no UI. |
| **AI journal coding suggestions / anomaly detection / chat** | Only OCR uses AI today. |
| **Power BI / dedicated BI connector** | None. |
| **Sensitivity analysis engine** + scenario tables | None. |
| **Threshold-alert rule engine** (`report_alert_rules`) | None — alerts today are hard-coded per event. |
| **Report scheduling + server-side chart rendering for email** | None. |

### 12.4 Things v2 didn't address that the live system needs

| Gap | Why it matters |
|---|---|
| **WhatsApp channel** in §2.8 | PACT's primary out-of-app channel is WhatsApp (Wasender), not SMS. v2 should say "in-app + email + WhatsApp + push (FCM)" with SMS as a *future* option. |
| **Flutter mobile app + offline sync** | The Flutter app uses Hive for offline cache and Supabase Realtime for sync. The GL design must define how journal posting behaves offline (queue + dedupe by idempotency key) — otherwise field staff break the ledger when reconnecting. |
| **Service Worker / IndexedDB sync (web)** | Same problem on the PWA side: offline journal posting needs a queue, not silent failure. |
| **Existing audit log infrastructure** | PACT already has a `hierarchy_audit_log` and per-table audit triggers. v2's "audit-trail visualizer" should layer on this, not on a brand-new table. |
| **CRM, project-flow engine, MMP/site-visit modules** | These touch money indirectly (per-diems, reimbursements, transport). v2's integration list (payroll/wallets/expenses/advances/transport/retainers/withdrawals) **omits**: down-payment requests, transaction scanner, financial-gap reclaim system, project field tasks, MMP site-visit per-diems. v3 makes the list complete. |
| **Roles mapping** | v2 invents "Admin / Finance / Accountant / Auditor / Branch Manager / Employee" without saying how those map to PACT's existing resource-action permission roles. v3 says: extend existing roles with `accountant` and `auditor`; reuse `super_admin` / `admin` / `hr` / `finance` / `branch_manager`-equivalent (= hub manager). |
| **Architecture vocabulary** | v2 says "modular architecture (microservices or DDD)". PACT is a single Vite/React SPA + Supabase + Edge Functions — there are no microservices. v3 reframes as **bounded contexts inside the same Supabase project** (Ledger, AR, AP, Banking, Tax, Reporting), each owning its tables + RPCs + RLS policies. |
| **GraphQL** | Supabase ships `pg_graphql` natively. v3 says: enable `pg_graphql` and expose the same schema via `/graphql/v1`, rather than building a parallel Apollo/Relay server. |

---

## 13. v3 corrections to v2

These edits to v2 are baked into v3 — treat the bullets below as the canonical
text:

1. **§2.8 channels:** `in-app + email + WhatsApp (Wasender) + push (FCM)`. **SMS
   moves to "future / configurable"** until a provider is contracted.
2. **§2.7 GraphQL:** use **Supabase's `pg_graphql`** at `/graphql/v1`; no
   separate Apollo / Relay service.
3. **§2.4 roles:** **add only two new roles** (`accountant`, `auditor`); reuse
   the existing `super_admin`, `admin`, `hr`, `finance`, and the hub-manager
   equivalent of "Branch Manager".
4. **§3 architecture:** "**bounded contexts inside one Supabase project**", not
   microservices.
5. **§9 B1 cost-centers:** v3 recommends **using `departments` as the
   cost-center proxy** in Phase 1 (add `code` + `name_ar` columns), and
   introducing a dedicated `cost_centers` table only in Phase 4 if the
   department hierarchy proves insufficient.
6. **§9 B2 donors:** v3 picks the recommended option — **extend `partners`**
   with `is_donor`, `donor_currency`, `donor_country`, `donor_reporting_cycle`.
7. **§4 / §7 deliverables:** v3 adds **"keep existing report pages — link, do
   not replace"** as a constraint on the new `/reports/*` routes.
8. **§4 deliverables — integration list:** complete the list of money-touching
   pages: payroll, wallets, **down-payment requests**, operational cost
   submissions, **transportation costs**, **classification fees**, salary
   advances, expense claims, retainers, withdrawal requests, **transaction
   scanner**, **financial gap reclaim**, **MMP per-diems**, **project field
   tasks**.

---

## 14. Open questions added in v3

These are new — they emerged from the gap analysis and need answers before
Phase 1 starts.

- **Q-C1.** Wallets vs. GL — does the new GL **absorb** `wallets` /
  `wallet_transactions` (one ledger), or do wallets remain a **subordinate
  sub-ledger** (two-tier, wallets reconcile to a "Wallet Liabilities" GL
  account)? Recommendation: subordinate sub-ledger, daily reconciliation.
- **Q-C2.** Department-as-cost-center sufficiency — can finance live with
  `departments` standing in for cost centers in Phase 1, or is the dimension
  fundamentally different in their reports?
- **Q-C3.** Offline journal posting — when a field user posts a journal-bearing
  action (e.g. cash advance) offline, what's the conflict-resolution rule on
  reconnect? Recommendation: idempotency key + last-writer-wins on header,
  immutable lines.
- **Q-C4.** Rename `acct_*` tables? — keep the v1-prefixed names or rename
  to plain `accounts` / `journals`? Recommendation: keep `acct_*` for
  namespace clarity in a shared Supabase schema.
- **Q-C5.** Existing report pages — do we **deep-link** them from the new
  `/reports/*` index pages, or **iframe-embed** them, or **gradually migrate**
  their data source onto the new GL? Recommendation: deep-link for v1,
  gradual migration in later phases.
- **Q-C6.** Statutory brackets per country — current `payroll_statutory_brackets`
  table is Sudan-only. EAC rollout needs Kenya / Uganda / Tanzania / Rwanda /
  Ethiopia / South Sudan brackets seeded. Who owns sourcing those?
- **Q-C7.** Period-close authority — who can close a period? Recommendation:
  Finance Manager opens close, Accountant verifies, Country Director approves.
  Confirm.
- **Q-C8.** Mobile-money testing sandbox — do we have sandbox access for
  M-Pesa Daraja / Airtel Money / Sudan EBS, or do we need to procure?

---

## 15. Phased rollout (the recommended start sequence)

**Premise:** ship value every phase; each phase is independently deployable;
later phases never block earlier ones.

### Phase 0 — Finish HR audit sprint *(current sprint, ~now)*
- Close H1–H10 (already in flight). H10 statutory deductions is the bridge
  into Phase 1 because it produces the first **payroll → GL** journal lines.
- **Exit criteria:** all 10 HR gaps green; payroll calc emits a structured
  deductions snapshot ready to map to GL accounts.

### Phase 1 — GL foundations *(2–3 sprints)*
- Migrations: finalise `acct_accounts`, `acct_journal_entries`,
  `acct_journal_lines`, `acct_fiscal_years`, `acct_fiscal_periods`,
  `acct_tax_codes`, `acct_assets`, `acct_budgets`.
- Seed Sudan COA + a default tax-code set.
- Posting engine RPC: `acct_post_journal(p_payload jsonb, p_idempotency_key)`
  with balance-validation trigger (debits = credits) and immutable lines.
- Audit-trail view on top of existing `hierarchy_audit_log`.
- **Exit criteria:** any service can post a balanced journal via one RPC;
  Trial Balance RPC returns correct numbers.

### Phase 2 — Wire existing operational pages to the GL *(2 sprints)*
Order chosen to maximise reuse of the H10 plumbing and the existing
approval-workflows engine:
1. **Payroll run approval** → posts payroll journals (gross / net / each
   statutory line / wallet credits).
2. **Wallet credits + withdrawals** → cash-side journals, with wallets as a
   subordinate sub-ledger reconciling daily to a `Wallet Liabilities` GL
   account.
3. **Operational cost submissions** (3-tier approval already exists) →
   expense journals on final approval.
4. **Down-payment requests, salary advances, retainers, transport,
   classification fees, financial-gap reclaim** → receivable / prepayment /
   expense journals as appropriate.
5. **Transaction scanner** → AI-suggested journal lines posted as drafts for
   accountant review.
- **Exit criteria:** Trial Balance reconciles to the sum of operational
  tables; no orphan transactions.

### Phase 3 — Reporting layer v1 *(2 sprints)*
- Routes: `/reports/financial` (TB → GL → P&L → BS → Cash Flow → Equity →
  AR/AP Aging → Bank Recon → Fixed Assets), `/reports/project`,
  `/reports/cost-center` (using `departments` as proxy).
- Recharts wrapper components: bar / line / pie / stacked area + bilingual
  axis-label helper.
- Bilingual EN/AR exports (PDF / Excel / CSV) — reuses the existing
  jspdf / xlsx stack.
- Deep-link the existing `/reports/*` pages from the new index pages.
- **Exit criteria:** Finance can produce TB, P&L, BS, Cash Flow on demand;
  every figure traces back to a posted journal.

### Phase 4 — Multi-entity + FX revaluation *(2 sprints)*
- Introduce `branches` (legal entities) — distinct from hubs.
- Add `branch_id` to `acct_*` tables and to all source tables that don't
  have it via `hub_id`.
- FX revaluation RPC at period close + auto-reversal at next period start.
- Intercompany clearing accounts + reciprocal-entry RPC.
- Consolidation RPC that rolls branch books up to a group view.
- Consider replacing `departments` proxy with a real `cost_centers` table
  (per Q-C2 outcome).
- **Exit criteria:** consolidated TB across at least two branches, with FX
  revaluation visible.

### Phase 5 — Public APIs + webhooks *(1–2 sprints)*
- Enable `pg_graphql`; expose `/graphql/v1`.
- Versioned REST under `/api/v1/...` via Supabase Edge Functions where the
  PostgREST defaults aren't enough.
- OAuth2 / JWT scopes (`journals:read`, `journals:post`, `coa:admin`,
  `reports:read`); document in published OpenAPI.
- Outbound webhooks for: journal-posted, period-closed, threshold-breached.
- **Exit criteria:** a third-party can read TB and post a journal via the
  documented API.

### Phase 6 — Banking, treasury & mobile-money *(2–3 sprints)*
- Bank-feed reconciliation engine (start with one bank format, e.g. CBOS
  CSV; later add others).
- AI matching suggestions (reuse Gemini/Groq pipeline).
- Mobile-money disbursement APIs in priority order from Q-A3.
- Cash position dashboard (multi-bank, multi-currency, real-time).
- Payment batching / authorisation workflow (maker → checker → approver).
- **Exit criteria:** one bank's statement auto-reconciles ≥80% of lines;
  one mobile-money disbursement runs end-to-end.

### Phase 7 — Scenario, forecast & AI analytics *(2 sprints)*
- Routes: `/reports/scenario`, `/reports/forecast`.
- `scenarios` + `scenario_variables` tables; `compute_sensitivity_scenario`
  RPC.
- Predictive cash-flow forecasting model (extends existing forecaster).
- Anomaly detection job for unusual transactions.
- Single AI chat shared with §2.11 — answers ledger AND report queries.
- **Exit criteria:** variance + sensitivity charts render; chat answers a
  benchmark set of finance questions.

### Phase 8 — Reporting alerts + scheduled email *(1 sprint)*
- `report_alert_rules` table + scheduled evaluator.
- Alerts dispatched via existing notification service (in-app + email +
  WhatsApp + push).
- Scheduled email reports — chart-rendering decision per Q-B4.
- Audit pack generator (ZIP of TB + GL + supporting docs).
- **Exit criteria:** finance gets a Monday-morning email with charts;
  budget breach triggers an alert within 1 hour.

### Phase 9 — Hardening, BI connector, mobile parity *(open-ended)*
- Power BI / Supabase BI connector.
- Flutter mobile app: read-only finance views + offline-safe journal
  posting for cash advances.
- Threat-model + pen-test of the new APIs.
- Performance tuning of the posting engine + report RPCs.

---

## 16. Recommended starting point

**Start with Phase 0 → Phase 1 → Phase 2 in that order**, sequentially:

1. Finish the HR audit sprint (Phase 0) — already in flight, no new scope.
2. Schema + posting RPC (Phase 1) — unlocks every subsequent phase.
3. Wire payroll first (Phase 2.1) — payroll already produces structured
   numbers (gross / statutory / net / wallet credit) thanks to H10, so it's
   the cheapest, highest-value first integration.

After Payroll → GL works end-to-end, **Phases 3 (reporting v1) and 4
(multi-entity) can run in parallel** — they share no code paths.

Phases 5+ should wait until at least the first audit cycle on the new GL
proves the numbers are right.

---

*End of v3 addendum. Sign-off needed on the §13 corrections and the §14
Q-C1…Q-C8 questions before kicking off Phase 1.*
