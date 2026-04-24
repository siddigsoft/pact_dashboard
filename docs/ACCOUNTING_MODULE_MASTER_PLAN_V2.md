# PACT Accounting & Finance Module — Master Plan **(Version 2)**

**Status:** Proposed · **Owner:** Finance + Engineering · **Last updated:** 2026-04-24
**Supersedes:** `docs/ACCOUNTING_MODULE_MASTER_PLAN.md` (v1)
**Target compliance:** Sudan (Income Tax, VAT, Zakat, Social Insurance) + East African
Community (Kenya, Uganda, Tanzania, Rwanda, Ethiopia, South Sudan)
**Scope:** Full, audit-compliant double-entry accounting system, integrated with every
existing PACT page that touches money — exposed via REST + GraphQL APIs, with
notification service wiring, bilingual EN/AR (RTL), multi-currency, and multi-entity
(branch) capabilities baked in from day one.

---

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
| Reporting | Statutory only | **Bilingual EN/AR exports** (PDF / Excel / CSV), audit pack generator |
| Architecture | Monolithic | **Modular / domain-driven** with CI/CD migration scripts and a posting-engine test suite |

Everything in v1 stays valid — v2 is a **superset**, not a rewrite.

---

## 1. System Overview

- **Full double-entry accounting system**, compliant with **IFRS for SMEs**.
- Integrated with all existing operational pages: **payroll, wallets, expenses,
  advances, transport, retainers, withdrawals**.
- **Automated journal posting** with idempotency keys and immutable audit trails.
- **Multi-currency and multi-entity** support (Sudan + East African Community).
- **Bilingual EN/AR interface** with RTL layout switching (already standard in PACT).
- **Notification service integrated** for approvals, postings, reversals and alerts.

---

## 2. Functional Requirements

### 2.1 Accounts & Chart of Accounts (COA)

- Multiple account types (**Assets, Liabilities, Equity, Revenue, Expenses**) with
  sub-types (current/non-current, operating/non-operating, etc.).
- **Branch-specific COA** with a consolidation engine that rolls up to a group COA.
- **Hierarchical accounts** (parent → child, unlimited depth) with mapping rules
  for **intercompany eliminations**.
- COA versioning so historical reports remain reproducible after restructures.

### 2.2 Currency Management

- **Transactional currency** (the currency the deal is denominated in) vs.
  **functional currency** (the entity's reporting currency).
- **FX rates captured at transaction date**, then **revalued at period close** using
  the period-end rate.
- Every monetary column is stored as a pair: `original_amount` + `original_currency`
  alongside `functional_amount` + `functional_currency`.
- **FX gain/loss auto-reversal** at the start of the next period for balance-sheet
  monetary items.

### 2.3 Project-Based Accounting

- Every transaction can be **linked to a project** (already a first-class entity in
  PACT).
- Track **project budgets, costs, committed spend and actuals**.
- Generate **project-level profitability reports** (revenue – direct cost –
  allocated overhead).

### 2.4 User Roles & Permissions

- **Role-based access**: Admin, Finance, Accountant, Auditor, Branch Manager,
  Employee.
- **Location-based permissions** so a branch manager only sees their branch's data.
- **Audit-trail visualizer** that shows, for any record, who did what and when —
  surfaced from the immutable journal log and the existing PACT audit tables.

### 2.5 Intercompany Transactions

- **Branch-to-branch transfers** with **reciprocal entries** auto-posted on both
  sides.
- **Clearing accounts per branch** so intercompany balances net to zero on
  consolidation.
- **Approval workflow** for intercompany requests, reusing the existing PACT
  approval framework.

### 2.6 Compliance & Reporting

- Generate statutory reports: **VAT, WHT, PIT, Social Insurance, Zakat**.
- **Audit pack generator**: Trial Balance, General Ledger, sub-ledgers, supporting
  document URLs — all exportable as a single ZIP.
- **Bank reconciliation** and **fixed asset register** (with depreciation
  schedules).
- **Bilingual EN/AR exports** in PDF, Excel and CSV — all column headers, totals
  and labels translated.

### 2.7 API Integration

- **REST + GraphQL endpoints** for journals, COA, invoices, payments, assets,
  budgets.
- **Webhooks** for external integrations (bank feeds, payroll, procurement).
- **OAuth2 / JWT authentication** with role-based scopes (e.g.
  `journals:read`, `journals:post`, `coa:admin`).
- **API versioning** (`/api/v1/...`, `/api/v2/...`) and **OpenAPI documentation**
  auto-generated from the schema.

### 2.8 Notifications

- **Integrated notification service** for approvals, postings, reversals.
- **Role-based delivery** (finance, managers, employees) — same routing rules as
  existing PACT notifications.
- **Channels**: in-app, email, SMS (configurable per user).
- **Audit log of notifications** for compliance — every send is recorded with
  recipient, channel, payload and delivery status.

### 2.9 Banking & Treasury

- **Bank feed reconciliation engine** with **AI suggestions** for matching
  statement lines to journal entries.
- **Cash position dashboard** (multi-bank, multi-currency, real-time).
- **Payment batching and authorization workflow** (maker / checker / approver).
- **Mobile money API integration**: M-Pesa, Airtel Money, Sudan EBS.

### 2.10 Advanced Analytics

- **Predictive cash flow forecasting** (extends the existing PACT cash-flow
  forecaster).
- **Variance analysis**: budget vs. actual vs. forecast.
- **Automated ratio analysis**: liquidity, profitability, efficiency ratios.
- **BI integration**: Power BI connector + Supabase dashboards.

### 2.11 AI-Assisted Accounting

- **AI journal coding suggestions** — proposes the right COA accounts for a given
  transaction description.
- **Anomaly detection** for unusual transactions (amount, frequency, vendor).
- **Chat-based query interface** for accountants ("what was our travel spend in
  Khartoum branch last quarter?").

---

## 3. Technical Notes

- **Modular architecture** — domain-driven design with clear bounded contexts
  (Ledger, AR, AP, Banking, Tax, Reporting).
- **Database schema supports multi-branch and multi-currency** from day one — no
  retrofitting later.
- **Environment variables** for: API keys, FX rate sources, fiscal-device
  connectors, mobile-money credentials.
- **CI/CD pipeline** with schema migration scripts (Supabase migrations folder,
  same pattern PACT already uses).
- **Testing suite** for the posting engine and reports — every journal must
  balance, every report must reconcile to the GL.

---

## 4. Deliverables

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
| §5 Statutory reports | **Extended in v2** with bilingual EN/AR exports and audit pack generator |
| §6 Roll-out plan | **Re-sequenced in v2** to ship API + notifications **before** UI polish, so external integrations can start early |

---

## 6. Open questions for product owner

1. **Branches scope on day one** — which legal entities / branches should be live
   in the first cut? (Khartoum HQ + which EAC offices?)
2. **Functional currency per entity** — confirm SDG for Sudan, USD for HQ
   consolidation, local currency for each EAC branch.
3. **Mobile-money providers priority** — M-Pesa first, then Airtel, then Sudan
   EBS? Or parallel?
4. **AI provider** — reuse the existing Gemini 2.0 Flash + Groq stack already
   wired into PACT, or evaluate a dedicated finance-tuned model?
5. **External API consumers** — who is the first external system that will call
   our REST/GraphQL endpoints? That drives the auth scopes we need to define
   first.

---

*End of Version 2 plan. Sign-off needed from Finance + Engineering before
breaking work into project tasks.*
