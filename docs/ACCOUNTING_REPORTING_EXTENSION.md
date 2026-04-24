# PACT Accounting — Reporting, Charting & Projection Extension

**Status:** Proposed · **Owner:** Finance + Engineering · **Last updated:** 2026-04-24
**Companion to:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` (v2)
**Depends on:** v2 ledger / journals / COA / branch / multi-currency layer must
ship first. This document layers on top of that.
**Scope:** Advanced reporting, interactive charting, scenario / projection engines,
threshold alerts, AI-assisted analytics — bilingual EN/AR (RTL), notification-aware,
project + cost-center aware.

---

## 0. Position in the roadmap

| Layer | Document | Status |
|---|---|---|
| HR audit gaps (H1–H10) | v1 §2 | In progress this sprint |
| Core ledger + APIs + multi-entity | v2 | Proposed |
| **Reporting / charts / projections** | **this doc** | **Proposed (depends on v2)** |

This extension assumes the v2 GL is live: journals are posted, branches are
defined, FX rates are captured, and the API surface exists. Without v2 this
extension has nothing to read from.

---

## 1. Reporting & Analysis Requirements

### 1.1 Financial Reports

- **Trial Balance, General Ledger, Profit & Loss, Balance Sheet, Cash Flow.**
- **Statement of Changes in Equity.**
- **AR / AP Aging, Bank Reconciliation, Fixed Asset Register.**

### 1.2 Project & Cost-Center Reports

- Every project linked to a **cost center**.
- **Project profitability** (revenue – attributed expenses).
- **Department spend vs budget.**
- **Donor utilization** dashboards.
- **Wallet liability ageing.**

### 1.3 Scenario & Projection Reports

- **Budget vs Actual vs Forecast.**
- **Best-case / worst-case projections.**
- **Cash-flow forecasting** by project, branch, and cost center.
- **Variance analysis** charts (monthly, quarterly, yearly).
- **Sensitivity analysis** — impact of FX changes, tax changes, payroll
  adjustments.

### 1.4 Visualization & Dashboards

- **Interactive charts**: bar, line, pie, waterfall, stacked area.
- **Drill-down dashboards** for managers and auditors.
- **Scheduled email reports** with charts embedded.
- **Export to PDF, Excel, CSV** with bilingual EN/AR labels.

### 1.5 Notifications

- **Alerts** when reports are generated or thresholds breached (e.g.
  overspending).
- **Role-based delivery** (finance, managers, employees).
- **Channels**: in-app, email, SMS.
- **Audit log** of notifications for compliance — reuses the existing PACT
  notification log table.

### 1.6 AI-Assisted Analytics

- **Predictive cash-flow forecasting** using historical journals.
- **Automated ratio analysis** (liquidity, profitability, efficiency).
- **Anomaly detection** for unusual spending patterns.
- **Chat-based query interface** ("Show me all projects over budget this
  quarter") — **shared with the v2 §2.11 AI chat, not a separate UI**.

---

## 2. Deliverables

A **report library** with five top-level routes:

| Route | Purpose | Primary audience |
|---|---|---|
| `/reports/financial` | Trial Balance, GL, P&L, Balance Sheet, Cash Flow, Equity, AR/AP Aging, Bank Recon, Fixed Assets | Finance, Auditors |
| `/reports/project` | Project profitability, project spend vs budget, donor utilization, wallet liability ageing | PMs, Country Director, Finance |
| `/reports/cost-center` | Department / cost-center spend vs budget, allocations, hierarchy roll-ups | Branch Managers, Finance |
| `/reports/scenario` | Budget vs Actual vs Forecast, best/worst case, sensitivity (FX / tax / payroll) | Finance, Country Director |
| `/reports/forecast` | Predictive cash flow by project / branch / cost-center, variance trends | Finance, Treasury |

Plus:
- **Charting engine** integrated with accounting data (see §4 below).
- **Notification service tied to reporting events** (generation + threshold
  breaches).
- **Example code snippets** for generating charts and projections — bundled in
  `docs/guides/` once the engine ships.

---

## 3. Resolved assumptions (decisions baked into this plan)

These were open questions from the initial review; resolving them upfront so
implementation isn't blocked.

1. **Bilingual labels** reuse the existing PACT EN/AR translation pattern
   (`BILINGUAL_EMAIL_TEMPLATES.md` style), not a new translation system.
2. **AI chat is a single interface** shared with v2 §2.11 — same chat box
   answers ledger queries and report queries.
3. **Charting library is Recharts** (already in PACT, per `replit.md`) for
   bar / line / pie / stacked area. Waterfall is built as a custom composed
   chart on top of Recharts (see §4 risks).
4. **Audit-log of notifications** writes to the existing notification log
   table — no new audit table needed.
5. **Scheduled email** uses the existing IONOS SMTP integration; chart images
   are pre-rendered server-side (see §4 risks).

---

## 4. Open questions for product owner

These cannot be assumed — they need product/finance input before scoping.

1. **Cost-center model.** PACT has no `cost_centers` entity yet. Proposal: add
   a `cost_centers` table with `id`, `code`, `name_en`, `name_ar`,
   `branch_id`, `parent_id`, `manager_id`, `active`. Confirm hierarchy depth
   and whether a project can belong to **one** or **many** cost centers.
2. **Donor model.** Are donors a new partner type on the existing CRM
   `partners` table, or a dedicated `donors` table? (Recommend extending
   `partners` with `is_donor` flag + donor-specific columns.)
3. **Waterfall charts.** Recharts has no native waterfall component. Options:
   (a) custom composed chart using Bar + reference lines (cheap, ~1 day),
   (b) add `recharts-waterfall` or similar (one more dep), (c) drop waterfall
   from the v1 of this extension. Pick one.
4. **Server-side chart rendering for email.** Three options: (a) headless
   Chromium via Playwright (heavy, flexible), (b) QuickChart-style image API
   (fast, less flexible), (c) skip embedded charts and link to the live
   dashboard. Pick one before scheduled-email work begins.
5. **Threshold-alert rule engine.** Need a `report_alert_rules` table:
   `id`, `report_key`, `metric`, `comparator` (`gt`/`lt`/`pct_over`),
   `threshold`, `period` (`day`/`week`/`month`/`quarter`), `notify_roles[]`,
   `notify_channels[]`, `active`, `created_by`. Confirm this shape covers the
   alert types finance actually wants.
6. **Sensitivity analysis engine.** Recommend a dedicated SQL RPC
   `compute_sensitivity_scenario(p_scenario_id, p_variables jsonb)` rather
   than client-side recompute, so the same scenario produces the same numbers
   in API + UI + email. Confirm acceptable.
7. **Drill-down depth.** How many levels deep should drill-down go on the
   dashboards? (e.g. P&L line → GL account → journal entry → source document.)
   This drives how much pre-aggregation we cache vs. compute on demand.
8. **Refresh cadence.** Are reports near-real-time (recompute on every
   journal post) or batch (nightly snapshot)? Cost-of-compute vs. freshness
   trade-off.

---

## 5. Suggested build sequence

1. **Foundations** — `cost_centers` table + donor flag on partners + API
   read endpoints. *(blocks every report below)*
2. **Financial reports** — Trial Balance → GL → P&L → Balance Sheet → Cash
   Flow → Equity → AR/AP Aging → Bank Recon → Fixed Assets. *(reuses v2
   journals + COA directly)*
3. **Charting engine** — Recharts wrapper components for bar / line / pie /
   stacked area, with a bilingual axis-label helper. Waterfall last.
4. **Project & cost-center reports** — built on top of the foundations.
5. **Scenario & projection reports** — `scenarios` table + sensitivity RPC +
   forecast RPC. Variance charts on top.
6. **Notifications & alerts** — `report_alert_rules` + scheduled job that
   evaluates rules and dispatches via the existing notification service.
7. **AI assistance** — predictive forecasting model + anomaly-detection job
   + chat interface (shared with v2 §2.11).
8. **Scheduled email reports** — last, because it depends on the chart
   engine, notification service, and the rendering decision in §4.4.

---

## 6. Out of scope (explicit non-goals for this extension)

- **Building the v2 ledger itself** — that is v2's job; this extension
  consumes it.
- **Statutory tax-authority filing portals** — covered by v2 §2.6 compliance
  reports; this extension only displays them.
- **Mobile-app reporting** — desktop / web first. The Flutter app can read
  the same APIs in a later phase.

---

*End of Reporting Extension plan. Sign-off needed from Finance + Engineering
on the open questions in §4 before breaking work into project tasks.*
