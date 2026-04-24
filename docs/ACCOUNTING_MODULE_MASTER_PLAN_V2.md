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
