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

---

# Part D — Version 4 addendum: deeper gap pass

**Status:** Proposed · **Last updated:** 2026-04-25
**Purpose:** v4 is a second-pass gap review. v2 designed the core; v3 reconciled
v2 with what already exists in PACT. v4 catches the categories that **neither**
v2 nor v3 addressed — most of which matter specifically because PACT is a
**humanitarian field-ops platform**, not a generic ERP.

These are additive findings — they don't change any v2 or v3 decisions, they
extend them.

---

## 17. The humanitarian / donor compliance gap *(biggest miss)*

v2 and v3 cover **statutory tax** (Sudan, EAC) — but a humanitarian platform
spends 80%+ of its time answering to **donors**, not tax authorities. None of
that surface is in the plan today.

| Missing capability | Why it matters | Owns it |
|---|---|---|
| **Donor compliance regime registry** — USAID (FAR / AIDAR / 2 CFR 200), EU PRAG, UN OCHA, FCDO, GIZ, Global Fund — each with its own cost-eligibility rules, allowable-cost matrix, indirect-cost cap, and reporting templates | Same expense can be eligible for one donor and ineligible for another; the GL must tag eligibility per donor at posting time | New `acct_donor_regimes` table + per-line tagging |
| **Cost-share / matching contribution tracking** | Many grants require the org to match X% from non-grant sources; you have to prove it line-by-line | New `cost_share` flag on journal lines + per-grant target |
| **Indirect Cost Rate (NICRA)** calculation + cap enforcement | USAID and most federal donors cap indirect at a NICRA-approved % of direct; over-cap charges are disallowed | New `indirect_cost_rates` table, allocation engine, cap blocker on posting |
| **Burn rate per grant** with projected end-date | Grants are time-boxed; finance has to flag under- or over-burn early | Report on top of GL filtered by grant |
| **Time & effort reporting** for staff funded by multiple grants | Federal donors require employees to certify hours per grant per pay period | New `time_effort_certifications` + monthly cert workflow |
| **Donor reporting templates** — FFR (SF-425), narrative report, donor-specific Excel formats | Each donor wants the same numbers in a different shape; manual rework today | Template engine that maps GL accounts → donor template cells |
| **Donor-specific budget vs actual** with re-budgeting workflow | Donors approve a budget; the org must request prior approval for line shifts beyond a threshold | Budget tables already exist in v1; needs a re-budgeting request + approval flow |
| **Sub-recipient / partner pass-through** sub-ledger | When PACT re-grants to local partners, expenses ride two ledgers and donors audit both | New `acct_sub_recipients` + cascade reporting |
| **Procurement compliance log** — competitive bid evidence, sole-source justification, vendor vetting | Every donor demands proof that procurement followed rules | Hooks on the procurement cycle (§19) + document storage |

**Recommendation:** add §17 as **Phase 2.5** in the v3 phasing — sits between
"wire payroll & operational pages to GL" and "reporting layer v1", because the
reporting layer can't produce donor reports without donor tagging in place.

---

## 18. Sanctions screening & AML gap *(non-negotiable for humanitarian work)*

Operating in Sudan + EAC, the platform pays vendors, partners, and staff who
**must be screened against international sanctions lists** before any
disbursement. Failure here is an existential risk (donor clawback, US/UK/EU
prosecution).

| Missing capability | Notes |
|---|---|
| **Sanctions screening at vendor / partner / employee onboarding** | Free OFAC SDN list, EU consolidated list, UN Security Council list — all downloadable. Add a screening RPC that runs on `partners` insert/update and on payee creation. |
| **Re-screening on a schedule** (lists update frequently) | Nightly job re-runs all active partners against the latest lists. |
| **Hit-handling workflow** — block payment, escalate, document false-positive resolution | Hits create an `aml_alerts` row + block journal posting until cleared. |
| **PEP (Politically Exposed Person) flagging** | Free PEP lists exist (e.g. CIA World Factbook leaders). Tag for enhanced due diligence. |
| **Disbursement threshold escalation** | Payments above a configurable threshold require a second approver + KYC re-verification. |
| **Audit log of all screening decisions** | Donor auditors will ask. |

**Recommendation:** ship as a small dedicated module in **Phase 1** (before the
first journal posts), so no payment ever goes out unscreened.

---

## 19. Procurement-to-pay (P2P) cycle gap

v2 lists "procurement webhooks" and v3 mentions a procurement integration, but
the **actual P2P cycle** isn't in the plan. Without it, donor compliance §17
can't be evidenced.

Missing:

- **Purchase Requisitions** (`acct_purchase_requisitions`) — requester →
  budget check → approval chain.
- **Purchase Orders** (`acct_purchase_orders`) — committed spend (encumbrance)
  reduces available budget without yet hitting the GL as actual.
- **Goods Received Notes / Service Acceptance** (`acct_grn`) — physical
  receipt logged, triggers accrual journal.
- **3-way match** — PO ↔ GRN ↔ Invoice; mismatches block payment.
- **Vendor master** — extends `partners` with `is_vendor`, payment terms,
  tax ID, bank details (encrypted), preferred currency.
- **Petty cash** — per-branch petty-cash floats with replenishment workflow,
  daily cash count reconciliation.
- **Expense-advance settlement** — current `salary_advances` and
  `down_payment_requests` produce cash-out but never *settle* against actual
  expenses; need a settlement screen that closes the advance against an
  expense claim and posts the variance.
- **Per-diem rates registry** per location + grade — auto-applies to MMP and
  field-task expenses; donor audits compare actuals to schedule.

---

## 20. Receivables, billing & AR cycle gap

The plan covers AR aging in §6.1 but never the **AR cycle that produces
those receivables**.

Missing:

- **Invoices** to donors / customers (`acct_invoices`) with bilingual templates,
  multi-currency, partial payments.
- **Credit notes & debit notes** with auto-reversal of original GL impact.
- **Customer / donor statements** — monthly statement of account with aged
  balances (PDF + email).
- **Recurring billing** for retainer agreements (currently `retainer_runs` runs
  payouts but doesn't bill back to donors).
- **Receipts** — money in, allocated against invoices (full / partial /
  unidentified).
- **Bank deposit slips** — reconcile receipts to bank credits.

---

## 21. Year-end, period-close & journal mechanics gap

The plan mentions period close but doesn't cover the mechanics. Without these,
the first year-end will be a manual nightmare.

| Missing mechanic | Detail |
|---|---|
| **Soft-close vs hard-close** | Soft-close = period locked but reopenable by Finance Manager with audit; hard-close = sealed, no reopen even by admin. |
| **Year-end retained-earnings rollover** | RPC that closes P&L accounts to retained earnings on fiscal-year-end. |
| **Opening-balance import** for go-live | First-time tenants have books elsewhere; need a one-time signed opening-balance journal that doesn't trip reversal rules. |
| **Reversal / storno pattern** | Decision: do reversals create a contra-journal (auditable, recommended) or a delete-and-replace? Plan must pick one and enforce it at the RPC. |
| **Recurring journal templates** | Monthly rent, depreciation, prepayment amortisation — should be definable once and run on a schedule. |
| **Accruals & deferrals automation** | Month-end accrual journals that auto-reverse on day 1 of next period. |
| **Adjusting entries period** | Days N..N+5 after period-end where only Finance Manager + Auditor can post adjusting entries. |
| **Trial Balance lockdown after audit sign-off** | Once external audit signs off a year, no journal can touch any closed period — even reversal must go to current open period. |
| **Sub-ledger reconciliation jobs** | Daily job that asserts: sum(`wallet_transactions`) == GL `Wallet Liabilities`; sum(`payroll_run_items.net`) == GL `Net Payroll Payable`; mismatches alert finance. |

---

## 22. Segregation of Duties (SoD) gap

v2 mentions roles but never enforces SoD. For a finance system this is the
single biggest control weakness.

Missing:

- **SoD matrix** — same user cannot:
  - Post a journal AND approve it.
  - Create a vendor AND approve a payment to that vendor.
  - Approve a payroll run AND approve themselves in it.
  - Initiate a bank transfer AND release it.
- **DB-level enforcement** via RLS + a `check_sod` trigger on approval RPCs
  (not just UI hiding).
- **Maker-checker on configuration** — COA changes, tax-bracket changes,
  FX-rate manual overrides, and template edits all require a second approver.
- **2FA enforcement for finance roles** — PACT already has TOTP; just make it
  *mandatory* for `finance`, `accountant`, `auditor`, `admin`.
- **Encrypted bank account numbers / IBANs** — column-level encryption + role-
  scoped decryption.
- **Rate limiting + IP allow-list** for the new APIs in §2.7 / Phase 5.

---

## 23. Data governance, retention & backup gap

| Missing | Detail |
|---|---|
| **Donor retention policy** | Most donors require **7 years** of records post-grant-close. Schema should support legal-hold flags that prevent purge. |
| **GDPR / data-subject rights vs immutable ledger** | Right-to-erasure conflicts with immutable journals. Resolution pattern: **pseudonymise** PII fields on erasure request, retain ledger numbers. |
| **PII inventory** for finance tables | Document which columns are PII (names, addresses, bank accounts, salary amounts) — drives masking rules in reports / exports. |
| **Backup RPO / RTO targets** | Supabase has PITR; document the recovery objective Finance signs off on. |
| **Disaster-recovery runbook** | One page: how to restore the books to a point in time, who authorises, how to communicate to donors. |
| **Read-only auditor account** | External auditors get a sandboxed read-only role across a frozen period range — without giving them full RLS bypass. |

---

## 24. UX & accountant productivity gap

A real accountant uses an accounting system 6 hours a day. None of the
quality-of-life features that decide whether they'll actually adopt the system
are in the plan today.

- **Bulk CSV / Excel import** for journals, COA, opening balances, vendors —
  with a dry-run validate-only mode.
- **Document attachment per journal line** (not per header) — invoice scans,
  delivery notes, approval emails — stored in Supabase Storage with the same
  RLS as the journal.
- **Saved filters & report favourites** per user.
- **Pinned dashboards** + drag-to-reorder widgets.
- **Keyboard shortcuts** for accountants (`J` new journal, `R` post & reverse,
  `T` switch to TB, etc.).
- **Quick-search by amount range, vendor, reference, date range** across all
  journals.
- **Drill-everywhere** — every figure on every report click-throughs to the
  source journal then to the source document.
- **Inline edit** on suggested AI-coded journal lines before posting.
- **Bilingual number formatting** — Arabic-Indic numerals option, locale
  thousand separators.
- **Hijri calendar option** alongside Gregorian for date pickers (most
  Sudan/EAC Muslim staff request this; PACT mobile already shows Hijri).
- **PDF Arabic font rendering** — jsPDF needs a TTF Arabic font registered
  centrally (Cairo, Amiri, IBM Plex Sans Arabic) — currently a known PDF gap.

---

## 25. Capture-channel gap *(easy wins for field ops)*

PACT already has WhatsApp + email + OCR + camera. None are wired as
expense-capture channels in the plan.

- **Email-to-expense** — forward a receipt PDF to a per-user inbox address;
  OCR runs; draft expense claim appears in the user's queue.
- **WhatsApp-to-expense** — send a receipt photo to the PACT WhatsApp number;
  same flow. Reuses Wasender webhook + existing OCR pipeline.
- **Camera-to-expense from mobile** — Flutter already has camera; add a
  one-tap "Submit expense" that uploads + OCRs + creates draft.
- **Per-diem auto-calc on field tasks** — use the per-diem registry from §19;
  no manual amount entry.

---

## 26. Performance & scale gap

| Missing | Detail |
|---|---|
| **Partition `acct_journal_lines` by fiscal period** | Lines table will dominate row count; partitioning keeps queries fast and old periods cheap to archive. |
| **Indexing strategy doc** | Composite indexes for `(account_id, period_id)`, `(branch_id, period_id)`, `(project_id, period_id)`, `(grant_id, period_id)`, `(idempotency_key)`. |
| **Materialised views** for TB, P&L, BS — refreshed on journal post via NOTIFY/LISTEN. Enables sub-second report loads. |
| **Background job framework** | Period close, FX revaluation, year-end rollover, scheduled email reports, sanctions re-screening, recurring journal generation — all need a queue runner. Supabase has `pg_cron` + Edge Functions; document the chosen pattern. |
| **API pagination + cursor-based listings** for the §2.7 endpoints. |
| **N+1 query prevention** in report RPCs — single CTE-based queries, not loop-and-fetch. |

---

## 27. New / amended open questions

Adding to v3 §14:

- **Q-D1.** Donor regimes on day one — which donors do we encode in
  `acct_donor_regimes` first? (USAID? EU? UN OCHA? FCDO? Global Fund?)
- **Q-D2.** Sanctions list sources — OFAC SDN + EU consolidated + UN
  consolidated as the baseline. Do we add HMT (UK) and Australia DFAT?
- **Q-D3.** NICRA approval — is there a current NICRA letter on file, and at
  what rate? Drives the indirect-cost cap enforcement.
- **Q-D4.** Cost-share targets — which active grants have matching
  requirements and at what %?
- **Q-D5.** Reversal policy — contra-journal (recommended) or
  delete-and-replace?
- **Q-D6.** Soft-close window — how many days post-period-end can Finance
  reopen for adjustments without exec approval?
- **Q-D7.** Auditor access — read-only DB role, or read-only API token, or
  both?
- **Q-D8.** Hijri calendar — show alongside Gregorian everywhere, or only on
  user-by-user opt-in?
- **Q-D9.** Per-diem registry source of truth — UN DSA rates, donor-specific
  rates, or PACT-internal rates?
- **Q-D10.** PII pseudonymisation rule — which fields are pseudonymised on a
  GDPR erasure request, and which remain (e.g. amounts, journal numbers)?

---

## 28. v4 impact on the v3 phase plan

Insert these checkpoints into the v3 phasing — no phase is renumbered, only
expanded:

| Phase | v4 additions |
|---|---|
| **Phase 1 — GL foundations** | Add **§18 sanctions screening module**, **§22 SoD matrix + 2FA enforcement**, **§23 PII inventory**, **§26 partitioning + index doc**, **§24 PDF Arabic font registration**. |
| **Phase 2 — Wire ops to GL** | Add **§19 P2P cycle (PR/PO/GRN/3-way)**, **§19 expense-advance settlement**, **§20 invoices + credit notes**, **§21 sub-ledger reconciliation jobs**. |
| **Phase 2.5 *(NEW)* — Donor & grant compliance** | **§17 entire section** — donor regime registry, cost-share, NICRA, time & effort, donor reporting templates. Blocks Phase 3 reporting because reports must be donor-aware. |
| **Phase 3 — Reporting v1** | Add **§22 read-only auditor view**, **§24 saved filters / favourites / drill-everywhere / Hijri**, **§25 capture channels** (email/WhatsApp/camera-to-expense). |
| **Phase 4 — Multi-entity + FX** | Add **§21 year-end retained-earnings rollover**, **§21 reversal pattern enforcement**, **§21 soft-close vs hard-close**. |
| **Phase 5 — APIs + webhooks** | Add **§22 rate limit + IP allow-list**, **§23 retention legal-hold flags**. |
| **Phase 6 — Banking & treasury** | Add **§22 bank account encryption**, **§19 petty cash**. |
| **Phase 7 — Scenario / forecast / AI** | (no v4 additions) |
| **Phase 8 — Reporting alerts + scheduled email** | Add **§17 donor reporting templates** delivery via scheduled email; **§22 audit-pack legal-hold export**. |
| **Phase 9 — Hardening / BI / mobile parity** | Add **§23 DR runbook + RPO/RTO sign-off**, **§26 materialised view refresh strategy**, **§24 keyboard shortcuts**. |

**Net schedule impact:** roughly **+1 phase (Phase 2.5)** and **~3–4 sprints
distributed** across existing phases. Sanctions screening and SoD enforcement
are the only items that **must** ship before the first GL journal posts —
everything else is incremental.

---

## 29. Recommended next decision (after v4 sign-off)

- Sign off **§13 v3 corrections** + **§14 Q-C1…C8** + **§27 Q-D1…D10**.
- Then the very next concrete deliverable is a single project task:
  **"Phase 1 GL foundations — schema, posting RPC, sanctions module, SoD
  matrix"**, scoped to one sprint, with explicit acceptance criteria pulled
  from §15 Phase 1 + §28 Phase 1 v4 additions.

---

*End of v4 addendum. v2 + v3 + v4 together form the working master plan. No
further version is planned until the v4 open questions are answered.*

---

# Part E — Version 5 addendum: nonprofit, humanitarian-ops & implementation gaps

**Status:** Proposed · **Last updated:** 2026-04-25
**Purpose:** v5 is a third-pass gap review covering categories that v2 / v3 / v4
**still** miss. The biggest are nonprofit-specific (PACT is a humanitarian org,
not a for-profit company — the previous plan used a corporate accounting model
throughout) plus humanitarian-ops specifics (commodities, in-kind donations,
emergency response) and implementation hygiene (parallel-run, training,
testing).

These are additive — no v2 / v3 / v4 decisions change.

---

## 30. Fund accounting *(THE biggest model miss)*

v2 / v3 / v4 designed a **corporate accounting** system: P&L, Balance Sheet,
Cash Flow. Real nonprofits run on **fund accounting** instead. Without this,
the module cannot produce the audit-grade financials donors actually expect.

| Missing concept | What it is | What changes |
|---|---|---|
| **Net Asset classification** | Funds split into **with donor restrictions** vs **without donor restrictions** (US GAAP / FASB ASU 2016-14 model, equivalent under IFRS for nonprofits) | New `acct_funds` table with `restriction_type` enum; every journal line tags a fund |
| **Statement of Activities** | The nonprofit equivalent of a P&L — revenue + expenses split by fund class, plus "net assets released from restrictions" line | New report; replaces P&L for nonprofit views (P&L stays for any commercial sub-entity) |
| **Statement of Financial Position** | Same as Balance Sheet but with three-column net asset breakdown | Replaces standard BS view |
| **Statement of Functional Expenses** | Expenses split by **function** (Program services / Management & General / Fundraising) AND by **natural category** | New report + "function" tag on every expense journal line |
| **Statement of Cash Flows — direct method** | Donors prefer direct over indirect | Add direct-method generator |
| **Net assets released from restrictions** | When a restricted grant's deliverable completes, $X "releases" from restricted to unrestricted — auto-journal | New release RPC + scheduling rule per grant |
| **Pledges receivable** | Donor commits to pay but hasn't paid yet — recognised as revenue at present value, with allowance for uncollectible pledges | New `acct_pledges` table + amortisation schedule |
| **Conditional vs unconditional contributions** | ASU 2018-08 — conditional contributions aren't recognised until conditions are met | Per-grant condition tracker |
| **Quasi-endowments / board-designated funds** | Sub-classification within unrestricted | Sub-types in `acct_funds` |

**Why it matters:** every USAID, EU, UN, FCDO and Charity Commission audit
expects these specific reports. Producing them by hand from a corporate P&L
is the #1 cause of audit findings.

---

## 31. Inventory, commodities & gifts-in-kind *(humanitarian-ops core)*

PACT distributes **food, NFIs (non-food items), medical supplies, cash
vouchers** in the field. None of that touches the plan today — it's all
treated as a black box outside accounting. For humanitarian audits this is
a critical gap.

| Missing capability | Notes |
|---|---|
| **Inventory module** with warehouses, stock cards, reorder levels | Across hub warehouses + sub-warehouses |
| **Commodity tracking** to **Sphere Standards** | Per-commodity unit (kg, blanket, dose), per-beneficiary distribution log |
| **Costing methods** | FIFO / weighted-average per warehouse; per-commodity write-down policy |
| **Gifts-in-Kind (GIK) valuation** | Donated goods recorded at fair value at receipt date — produces both a non-cash revenue and an inventory asset |
| **Donated services** (volunteer time) | Recognised when they create or enhance non-financial assets, OR require specialised skills — donor-specific policy |
| **Distribution → expense recognition** | When a beneficiary receives a kit, inventory expense posts automatically with beneficiary count + GPS location |
| **Stock counts & shrinkage write-offs** | Cycle counts + investigation workflow before write-off journal posts |
| **Pre-positioned stock for emergency response** | Pre-allocated to emergency funds; released on activation |
| **Beneficiary registry linkage** | Per-distribution journal carries beneficiary-list reference for donor audit |
| **Vouchers / cash-transfer-programming (CTP)** | E-vouchers, mobile-money cash transfers tracked separately from operational disbursements |

---

## 32. Lease accounting (IFRS 16) & capital projects

Every humanitarian org **leases offices, warehouses, vehicles**. Under IFRS
16 / ASC 842 these are no longer simple rent expenses — they are **right-of-use
assets** + **lease liabilities** with monthly amortisation and interest.
v2 / v3 / v4 don't mention lease accounting at all.

- **Lease register** (`acct_leases`) — start, end, payment schedule, discount
  rate, escalation clause.
- **ROU asset + lease liability** auto-generated on lease commencement.
- **Monthly amortisation + interest journal** auto-posted.
- **Modification handling** (lease extension, partial termination,
  reassessment).
- **Short-term lease & low-value lease elections** (under-12-months exemption).
- **Capital projects / Construction-in-Progress (CIP / WIP)** —
  `acct_capital_projects` accumulates costs; on completion, transfers to
  fixed asset.
- **Capitalisation policy threshold** (e.g. anything ≥ $1,000 capitalised) —
  configurable per branch.
- **Asset impairment testing** + **disposal / write-off workflow**.
- **Insurance register** linked to assets.

---

## 33. Multi-signatory cash & treasury controls

Every NGO bank account has **multiple signatories with combination rules**
("any two of A, B, C" or "A plus any of B/C/D"). v2/v3/v4 don't model this.

- **Multi-signatory bank-account configuration** with combination rules.
- **Cheque register & numbering** with sequence integrity check.
- **Cheque void / stop-payment workflow** with audit reason.
- **Bank guarantee & letter-of-credit register** (off-balance-sheet).
- **Bulk-disbursement file generation**: M-Pesa B2C bulk format, NACHA (US),
  SEPA / EBA (EU), local bank batch formats.
- **Failed-payment retry workflow** with reason code mapping.
- **Refund processing** with original-transaction linkage.
- **Petty-cash custodian rotation** + handover sign-off + count log.
- **Daily cash position projection** (multi-bank, multi-currency, 30-day
  forecast).
- **Cash-pooling across branches** — sweep idle balances to HQ overnight.

---

## 34. HR financial extensions

v2 / v3 / v4 cover statutory deductions but miss the **non-statutory** payroll
components that hit the GL just as often.

- **Pension / provident fund management** — employer + employee contributions,
  fund manager remittance file.
- **Loan management beyond advances** — housing loan, vehicle loan, salary loan
  with interest, amortisation schedule, payroll deduction schedule, early
  settlement.
- **Garnishments / court-orders** — third-party deductions with priority
  ordering.
- **Severance & gratuity accruals** — separate from EOSB if local law requires.
- **Multi-currency payroll** for expat / cross-border staff — pays in one
  currency, costs in another.
- **Tax equalisation** for expat staff — hypothetical home-country tax vs
  actual host-country tax.
- **Per-diem reconciliation** — actual spend vs per-diem schedule, with
  refund-of-excess workflow.
- **Volunteer / consultant honoraria** — separate workflow from payroll, often
  WHT-exempt or different rate.

---

## 35. Internal audit, risk & whistleblower

v4 §22 covered SoD enforcement. v5 adds the broader internal-control framework
that donors expect.

- **Internal Audit module** — separate from external audit; audit plan, sample
  selection, finding tracker, management response.
- **Risk register** tied to financial controls — likelihood × impact, mitigation,
  ownership, periodic review.
- **COSO / ICFR self-assessment** — annual control attestation per process
  owner.
- **Whistleblower / fraud-reporting channel** — anonymous submission, triage
  workflow, investigation tracker.
- **Audit committee dashboard** — open findings, prior-year remediation
  status, control breaches.
- **Management letter tracking** — every external-audit recommendation tracked
  to closure.

---

## 36. Government e-filing & mobile-money depth

v3 / v4 mention statutory tax. v5 adds the **transmission layer** — actually
filing those returns electronically and reconciling the ack files.

- **Sudan**: ZRA e-filing (when live), HAC/NGO commission reports, customs
  duty-exemption tracking for humanitarian goods.
- **Kenya**: iTax integration (PAYE, VAT, WHT, NHIF, NSSF), eTIMS e-invoicing.
- **Uganda**: URA EFRIS e-invoicing; PAYE/NSSF returns.
- **Tanzania**: TRA VFD e-invoicing.
- **Rwanda**: RRA EBM e-invoicing.
- **Ethiopia**: eTax + WHT certificates.
- **Mobile money bulk disbursement files** with reconciliation of provider
  responses (success / pending / failed) back into payment table.
- **Charge-back / dispute handling** for mobile-money + card payments.
- **Visa / work-permit financial sponsorship** tracking for expat staff.

---

## 37. ESG / SDG / impact tagging

Donors increasingly require impact-aligned reporting alongside financials.

- **SDG tagging** (1–17) on every expense journal line.
- **Beneficiary count per dollar** spent — cost-effectiveness metric.
- **Carbon footprint of operations** — flights, vehicle fuel, generator
  diesel auto-tracked from purchases.
- **Gender-responsive budgeting** flags on expense lines.
- **Localisation index** — % of spend through local partners (Grand Bargain
  commitment).

---

## 38. Crisis & emergency-mode workflows

PACT operates in active conflict zones. Standard approval chains break in
sudden-onset emergencies.

- **Emergency cash-advance fast-track** — single-approver bypass with full
  audit + post-event reconciliation.
- **Pre-positioned funds release** triggered by an "emergency activation" event
  (admin-only, time-boxed).
- **Crisis-mode approval bypass** — temporarily lowers approval-tier count;
  every bypass logged + auto-reviewed within N days.
- **Quick-fund codes** for new emergencies — pre-approved COA template +
  default dimensions seeded in one click.
- **Conflict-zone payment mode** — cash-only, witnessed disbursement with
  photo + GPS + biometric on the recipient.

---

## 39. Localisation beyond EN / AR

| Locale gap | Why it matters |
|---|---|
| **French** | Francophone Africa partners, EU donor reports |
| **Swahili** | Kenya / Tanzania / Uganda field staff |
| **Arabic numerals** (Western) **vs Arabic-Indic** (٠١٢٣) toggle | Sudan staff often prefer Indic; donor reports require Western |
| **Hijri fiscal-year option** for Sudan-only entities | Already raised in v4 §24; v5 firms it as a per-branch setting |
| **Locale-specific currency formatting** — `1,234.56` vs `1.234,56` vs `1’234.56` | Per-user preference, not just per-locale |
| **PDF rendering for French diacritics + Swahili** | Same jsPDF font registration issue as Arabic |
| **Right-to-left layout per page** — even when global locale is EN, an embedded Arabic narrative block needs RTL inside an LTR page |

---

## 40. Implementation hygiene *(usually skipped — fatal if it is)*

These aren't features — they're delivery-quality work that most plans omit and
then regret.

- **Parallel-run period** — minimum 2 fiscal periods where the new GL runs
  alongside the legacy system; daily reconciliation; cut-over only when
  variance is < 0.01% for 30 consecutive days.
- **Opening-balance cut-over playbook** — a written sequence of sign-offs
  + frozen cut-off date + rollback plan if reconciliation fails.
- **Synthetic data generator** for non-production environments (no real PII /
  donor data leaks into staging / dev).
- **Posting-engine unit-test suite** — every account combination, every tax
  bracket, every FX scenario asserted; runs in CI on every migration.
- **Reconciliation regression tests** — daily reconciliation jobs are
  themselves tested with synthetic break scenarios.
- **End-to-end period-close test** — once per release: run a synthetic month
  from journal entry through close, audit pack, donor reports.
- **Change-management plan** — communications, role-mapping, training cycle,
  certification.
- **In-app help / contextual tooltips** strategy with bilingual content.
- **Video walkthrough library** — short clips per page, hosted on Supabase
  Storage, EN + AR.
- **User certification programme** — accountants must pass a basic
  competency check before write access to GL.
- **Public transparency dashboard** (optional per donor) — anonymised totals
  by sector + location + SDG.
- **Performance monitoring** — p50 / p95 latency on report endpoints,
  alerting at thresholds.
- **Feature flags** for every new finance feature so they can be enabled
  per branch + rolled back instantly.

---

## 41. New open questions added in v5

Adding to v3 §14 + v4 §27:

- **Q-E1.** Fund accounting model — adopt **US GAAP nonprofit** (with /
  without donor restrictions), or **IFRS for nonprofits** (similar but
  different terminology), or **dual-render** (one set of books, two report
  layouts)? Recommendation: dual-render.
- **Q-E2.** Inventory / commodities scope on day one — full module, or
  defer to a later phase? If included, which warehouses are live first?
- **Q-E3.** IFRS 16 lease accounting — confirm IFRS 16 (recommended) vs
  US ASC 842; confirm discount-rate source.
- **Q-E4.** Mobile-money bulk-disbursement files — which providers' formats
  ship in v1 (M-Pesa B2C bulk + which others)?
- **Q-E5.** Pension / provident fund — which fund managers + remittance file
  formats?
- **Q-E6.** Crisis-mode bypass policy — who can activate, for how long,
  with what audit window?
- **Q-E7.** SDG tagging — mandatory on every line, or opt-in per project?
- **Q-E8.** Parallel-run length — confirm 2 fiscal periods recommendation.
- **Q-E9.** Localisation languages on day one — EN + AR only, or add FR /
  SW immediately?
- **Q-E10.** Public transparency dashboard — opt-in per donor / branch, or
  off until explicitly enabled?

---

## 42. v5 impact on the v3 + v4 phase plan

No phase renumbered. v5 inserts items into existing phases:

| Phase | v5 additions |
|---|---|
| **Phase 0** | (no change) |
| **Phase 1 — GL foundations** | **§30 fund + restriction model in COA from day one** (cheap to add now, expensive to retrofit), **§40 posting-engine test suite + synthetic data generator + feature-flag framework**. |
| **Phase 2 — Wire ops to GL** | **§34 pension + loan management** in payroll; **§33 cheque register + multi-signatory** for bank disbursements; **§38 crisis-mode bypass** scaffolding. |
| **Phase 2.5 — Donor & grant compliance** | **§30 Statement of Activities + Functional Expenses + Pledges**, **§37 SDG tagging**, **§31 GIK & in-kind donation valuation**. |
| **Phase 3 — Reporting v1** | **§30 nonprofit financial statements** (replaces standard P&L / BS for nonprofit views), **§39 FR / SW localisation if Q-E9 says yes**. |
| **Phase 4 — Multi-entity + FX** | **§32 lease accounting + capital projects**, **§33 cash-pooling**, **§31 inter-warehouse transfers**. |
| **Phase 5 — APIs + webhooks** | **§35 internal audit module APIs**, **§40 public transparency dashboard endpoint**. |
| **Phase 6 — Banking & treasury** | **§33 bulk-disbursement file generators**, **§36 government e-filing connectors**, **§31 e-vouchers / CTP integration**. |
| **Phase 7 — Scenario / forecast / AI** | **§35 risk register + COSO self-assessment**. |
| **Phase 8 — Reporting alerts + scheduled email** | **§30 conditional-contribution recognition triggers**, **§35 audit committee dashboard**. |
| **Phase 9 — Hardening / BI / mobile parity** | **§40 parallel-run playbook + cut-over runbook + user certification programme + performance monitoring**, **§37 carbon footprint + Grand Bargain localisation index**. |

**Net schedule impact:** ~+2 sprints distributed. **Phase 2.5 grows the most**
(donor compliance + nonprofit financial statements + GIK + SDG). The
**fund-restriction model in §30 is the most urgent** — it must land in
**Phase 1** because every journal posted afterwards inherits a fund tag, and
retrofitting that across years of postings is cripplingly expensive.

---

## 43. Updated recommended start

After signing off all open questions (v3 Q-C1…C8, v4 Q-D1…D10, v5
Q-E1…E10), the very first project task becomes:

**"Phase 1 GL foundations — schema (with fund-restriction model) +
posting RPC + sanctions module + SoD matrix + posting-engine test suite +
feature-flag framework"**

scoped to one sprint, with explicit acceptance criteria from §15 Phase 1 +
§28 Phase 1 v4 additions + §42 Phase 1 v5 additions.

---

## 44. What to look at next *(optional later passes)*

If a v6 review is ever wanted, these are the areas still uncovered:

- **Investment management** (term deposits, money-market, FX hedging).
- **Transfer pricing documentation** for intercompany flows.
- **Country-by-country reporting** (BEPS) for multi-entity.
- **Deferred-tax assets / liabilities** + **tax provision** under IAS 12.
- **Earned Value Management (EVM)** for grant-funded projects.
- **Carry-forward funds** between fiscal years.
- **Multi-year grant amortisation** (advance-grant deferred-revenue
  accounting).
- **Single Audit / Schedule of Expenditures of Federal Awards (SEFA)**
  generation.
- **Form 990 / Charity Commission annual return** auto-generation.
- **Donor portal data feeds** (USAID DEC, EU INFOREURO, UN partner portal).
- **SSO for external auditors** (SAML, Azure AD).
- **SFTP for batch-file exchange** with banks / donors / govt.

---

*End of v5 addendum. v2 + v3 + v4 + v5 together form the working master plan.
v6 is **not** planned unless §44 items are explicitly requested.*
