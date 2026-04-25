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
| **Pseudo-ledger** | `wallets` + `wallet_transactions` | **Stays** as a subordinate sub-ledger reconciling daily to a `Wallet Liabilities` GL account. Not absorbed. |
| **Consolidated financial view** | `ConsolidatedFinancialTab.tsx` | Same UI; data source switches to GL once Phase 1 ships. |
| **Reconciliation dashboard** | `ReconciliationDashboard.tsx` | Same UI; gets a real GL behind it. |
| **Existing partial finance features** | Cash-flow forecaster, duplicate-payment detector, period-close, budget-vs-actual (per `replit.md`) | Extended, not reintroduced. |
| **Recharts** | `src/components/ui/chart.tsx` | Chart engine for the new reporting layer. |
| **Webhooks pattern** | `moda-webhook`, `whatsapp-webhook`, `google-calendar-oauth` edge functions | Cloned for bank-feed / payroll / procurement webhooks. |
| **Hubs + Departments** | `hubs`, `departments` tables | Used as **branch / cost-center proxies** in Phases 1–3; real `branches` and (optionally) `cost_centers` arrive in Phase 4. |
| **CRM Partners** | `partners` table | Extended with `is_vendor`, `is_customer`, `is_donor` flags. No parallel tables. |
| **Existing report pages** | `/reports/advance-requests`, `/cost-submission-reports`, `/wallet-reports`, `/project-analytics`, `/reconciliation`, `/salary-retainer-report`, `/notification-analytics` | **Deep-linked** from the new `/reports/*` index pages. Not replaced. |
| **Audit infrastructure** | `hierarchy_audit_log` + per-table audit triggers | Layer the audit-trail visualiser on top, no new audit table. |
| **Permissions** | Resource-action permission model | Add only `accountant` + `auditor`; map everything else to existing roles (`super_admin`, `admin`, `hr`, `finance`, hub-manager). |
| **`acct_*` tables** | Defined in v1 master plan, partially scaffolded | Phase 1 finalises them. |

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
  level consolidation RPC.
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
  transaction; reuses existing Gemini / Groq stack.
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
- Enable `pg_graphql`; expose `/graphql/v1`.
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

*End of consolidated master plan. Sign-off needed on §7 open questions before
kicking off Phase 1.*
