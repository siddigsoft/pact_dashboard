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
