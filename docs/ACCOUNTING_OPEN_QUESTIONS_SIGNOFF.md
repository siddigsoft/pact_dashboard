# PACT Accounting Module — Sign-off Sheet *(Open Questions + Feature Confirmation)*

> **STATUS: PROVISIONALLY SIGNED OFF — engineering only · 2026-04-25**
>
> Engineering owner has accepted every **recommended default** in this sheet so
> that Phase 1 (GL Foundations) can start. **Phase 1 is unblocked.**
>
> The following items are NOT yet stakeholder-confirmed and remain open:
>
> 1. The **6 contested questions** flagged in `ACCOUNTING_SIGNOFF_EXEC_SUMMARY.md`
>    (A1, A3, C1, C2, C7, NICRA mode). Of these, only **C2** affects Phase 1
>    — the others touch Phase 2 onward and can be revisited at each phase
>    kick-off without rework if engineering's default holds.
> 2. The **3 info-needed rows**: **D3** (current NICRA letter rate),
>    **D4** (active grants with cost-share targets), **E5** (pension fund
>    managers + remittance file format). These block **Phase 2.5**, not
>    Phase 1. Finance + HR need to fill them before Phase 2.5 kick-off.
>
> **For full stakeholder sign-off**, walk the executive one-pager
> (`docs/ACCOUNTING_SIGNOFF_EXEC_SUMMARY.md`) when the Country Director,
> Finance Manager, and HR Lead are next available. Update this banner to
> `STATUS: FULLY SIGNED OFF — YYYY-MM-DD` after that meeting.


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
| **A1** | Branches scope on day one — which legal entities are live first? | **PACT-Sudan only**; add other countries from Phase 4 | [x] | |
| **A2** | Functional currency per entity | **SDG** for PACT-Sudan; **USD** for any donor-facing reporting branch | [x] | |
| **A3** | Mobile-money providers priority | **Sudan EBS first (local need), then M-Pesa (KE/UG/TZ), then Airtel** | [x] | |
| **A4** | AI provider for journal coding + chat | **Reuse existing Gemini 2.0 Flash → Groq fallback** stack from `scan-transaction` | [x] | |
| **A5** | First external API consumer | **None at launch** — keep APIs internal until a real consumer surfaces, then re-scope OAuth scopes | [x] | |

## Group B — Reporting *(can defer to Phase 3 / 7 / 8)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **B3** | Waterfall charts | **Custom Recharts composition** (no new dependency) | [x] | |
| **B4** | Server-side chart rendering for scheduled email | **Static PNG via headless Chromium in an Edge Function** — render once, attach to email | [x] | |
| **B5** | Threshold-alert rule shape | **Confirm `report_alert_rules` schema as proposed in §4.16** | [x] | |
| **B6** | Sensitivity engine | **RPC-based** (`compute_sensitivity_scenario`) — same numbers everywhere | [x] | |
| **B7** | Drill-down depth | **4 levels**: report figure → GL account → journal → source document | [x] | |
| **B8** | Report refresh cadence | **Near-real-time** via materialised views refreshed on `journal.posted` (NOTIFY/LISTEN) | [x] | |

## Group C — Reality / reuse *(blocks Phase 1 if controversial)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **C1** | Wallets vs GL | **Subordinate sub-ledger** — wallets stay, reconcile daily to a `Wallet Liabilities` GL account | [x] | |
| **C2** | Department-as-cost-center sufficiency for Phase 1 | **Yes** — use `departments` as proxy in Phases 1–3; introduce real `cost_centers` only if reporting needs require | [x] | |
| **C3** | Offline journal posting | **Idempotency-key + last-writer-wins on header / immutable lines** | [x] | |
| **C4** | Keep `acct_*` table-name prefix | **Yes** — keeps the bounded context obvious | [x] | |
| **C5** | Existing report pages | **Deep-link** from new `/reports/*` index pages — no rewrites | [x] | |
| **C6** | EAC statutory bracket sourcing | **Finance team owns the seed data per country**; engineering owns the schema | [x] | |
| **C7** | Period-close authority chain | **Finance Manager opens / verifies → Country Director approves**; Accountant operates within open period | [x] | |
| **C8** | Mobile-money sandbox access | **Procure** — none exists today | [x] | |

## Group D — Donor / compliance *(blocks Phase 2.5)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **D1** | Donor regimes on day one | **USAID, EU PRAG, UN OCHA** (top three); add FCDO + Global Fund in Phase 2.5 +1 | [x] | |
| **D2** | Sanctions list sources | **OFAC SDN + EU consolidated + UN consolidated** baseline; **HMT UK + DFAT Australia opt-in per branch** | [x] | |
| **D3** | Current NICRA letter rate | **Confirm with finance** — no default; needed before NICRA cap can enforce | | |
| **D4** | Active grants with cost-share targets | **Confirm with finance** — list of grant IDs + target % | | |
| **D5** | Reversal policy | **Contra-journal only** — never delete-and-replace | [x] | |
| **D6** | Soft-close window | **5 working days** post-period-end for adjustments before hard-close | [x] | |
| **D7** | Auditor access | **Read-only DB role + scoped API token** (both) | [x] | |
| **D8** | Hijri calendar | **Per-user opt-in** — Gregorian remains primary; Hijri renders alongside on user-flagged pages | [x] | |
| **D9** | Per-diem registry source | **PACT-internal** schedule with **UN DSA fallback** for missing locations | [x] | |
| **D10** | PII pseudonymisation rule on GDPR erasure | **Replace `full_name`, `email`, `phone`, `national_id` with hashed token; retain ledger numbers + amounts unchanged** | [x] | |

## Group E — Nonprofit / hygiene *(blocks Phase 1 + Phase 2.5)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **E1** | Fund-accounting model | **Dual-render** — one set of books, two report layouts (corporate P&L + nonprofit Statement of Activities) | [x] | |
| **E2** | Inventory / commodities scope on day one | **Defer to Phase 6** — too big for Phase 1; track GIK valuation in Phase 2.5 only | [x] | |
| **E3** | IFRS 16 vs ASC 842 + discount rate | **IFRS 16**; discount rate = **PACT incremental borrowing rate per branch, reviewed annually** | [x] | |
| **E4** | Mobile-money bulk-disbursement formats day one | **M-Pesa B2C bulk only**; add others as needed | [x] | |
| **E5** | Pension fund managers + remittance file formats | **Confirm with HR** — no default | | |
| **E6** | Crisis-mode bypass policy | **Country Director can activate for max 7 days; auto-review within 14 days; every bypassed approval logged** | [x] | |
| **E7** | SDG tagging | **Mandatory on every expense line**; default tag = "untagged" so it never blocks posting | [x] | |
| **E8** | Parallel-run length | **2 fiscal periods** — confirmed | [x] | |
| **E9** | Localisation languages on day one | **EN + AR only**; add FR / SW from Phase 3 if a partner explicitly requires | [x] | |
| **E10** | Public transparency dashboard | **Off until a donor explicitly requires it**, then enable per branch | [x] | |

---

# PART II — Feature confirmation *(every feature in the master plan)*

Tick **Confirm** to accept the feature as in-scope as described in the master
plan. Tick **Override** if you want to drop, defer, or change scope.

## §4.1 Core ledger

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.1-a | Hierarchical Chart of Accounts with sub-types + branch overlays + COA versioning | [x] | |
| 4.1-b | `acct_*` table family — accounts, journal entries, journal lines, fiscal years/periods, tax codes, assets, budgets, funds, donor regimes, grants, pledges, sub-recipients, PR / PO / GRN, invoices, leases, capital projects | [x] | |
| 4.1-c | Currency model — transactional + functional, FX at txn date, period-end revaluation, FX gain/loss auto-posted | [x] | |
| 4.1-d | Multi-entity — `branches` introduced in Phase 4, intercompany clearing + reciprocal RPC + group consolidation | [x] | |
| 4.1-e | Posting controls — DR=CR, period open, account active, idempotency_key unique, sanctions block, SoD check | [x] | |
| 4.1-f | Reversal — contra-journal only, never delete | [x] | |
| 4.1-g | Audit-trail visualiser layered on `hierarchy_audit_log` + per-table triggers | [x] | |

## §4.2 Fund accounting *(nonprofit overlay)*

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.2-a | Net-asset classification (without/with restriction, board-designated, quasi-endowment) | [x] | |
| 4.2-b | Statement of Activities (replaces P&L for nonprofit views) | [x] | |
| 4.2-c | Statement of Financial Position (3-column net-asset BS) | [x] | |
| 4.2-d | Statement of Functional Expenses (Programs / M&G / Fundraising) | [x] | |
| 4.2-e | Statement of Cash Flows — direct method | [x] | |
| 4.2-f | Net assets released from restrictions auto-journal | [x] | |
| 4.2-g | Pledges receivable with present-value amortisation | [x] | |
| 4.2-h | Conditional vs unconditional contributions (ASU 2018-08) | [x] | |
| 4.2-i | Quasi-endowments / board-designated funds | [x] | |

## §4.3 Sources of postings *(operational integrations)*

| # | Source page | Confirm | Override |
|---|---|---|---|
| 4.3-a | Payroll runs (gross / statutory / net / wallet credit / employer / pension / loans) | [x] | |
| 4.3-b | Wallets + withdrawals → cash-side journals | [x] | |
| 4.3-c | Operational cost submissions → expense journals | [x] | |
| 4.3-d | Down-payments, salary advances, retainers, transport, classification fees, financial-gap reclaim | [x] | |
| 4.3-e | MMP per-diems + project field tasks | [x] | |
| 4.3-f | Transaction scanner → AI-suggested draft journals | [x] | |
| 4.3-g | Procurement (PR → PO encumbrance → GRN accrual → Invoice) | [x] | |
| 4.3-h | Inventory distribution (commodity expense + beneficiary count) | [x] | |
| 4.3-i | Lease commencement → ROU + lease liability + monthly amortisation | [x] | |
| 4.3-j | E-vouchers / cash-transfer programming | [x] | |

## §4.4 Statutory tax & e-filing

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.4-a | Sudan PIT, Social Insurance, Zakat (already seeded) + HAC reports + customs duty exemption | [x] | |
| 4.4-b | Kenya iTax + eTIMS | [x] | |
| 4.4-c | Uganda EFRIS + PAYE/NSSF | [x] | |
| 4.4-d | Tanzania VFD | [x] | |
| 4.4-e | Rwanda EBM | [x] | |
| 4.4-f | Ethiopia eTax + WHT certificates | [x] | |
| 4.4-g | WHT certificates + reverse-charge VAT | [x] | |
| 4.4-h | Per-country statutory bracket registry | [x] | |

## §4.5 Donor & grant compliance

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.5-a | `acct_donor_regimes` for USAID, EU PRAG, UN OCHA, FCDO, GIZ, Global Fund | [x] | |
| 4.5-b | Per-line `grant_id` + `donor_regime_id` tagging | [x] | |
| 4.5-c | Cost-share / matching contribution tracking | [x] | |
| 4.5-d | NICRA indirect-cost cap enforcement on posting | [x] | |
| 4.5-e | Burn-rate per grant + projected end-date | [x] | |
| 4.5-f | Time & effort certification | [x] | |
| 4.5-g | Donor reporting templates (FFR/SF-425, EU PRAG, UN OCHA, FCDO) | [x] | |
| 4.5-h | Donor-specific budget vs actual + re-budgeting workflow | [x] | |
| 4.5-i | Sub-recipient pass-through sub-ledger | [x] | |
| 4.5-j | Procurement compliance log | [x] | |
| 4.5-k | Carry-forward funds across fiscal years | [x] | |
| 4.5-l | Multi-year grant amortisation | [x] | |

## §4.6 Sanctions & AML

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.6-a | OFAC SDN + EU + UN baseline screening at onboarding | [x] | |
| 4.6-b | Nightly re-screening of all active partners | [x] | |
| 4.6-c | Hit-handling workflow blocks payment | [x] | |
| 4.6-d | PEP flagging | [x] | |
| 4.6-e | Disbursement-threshold escalation | [x] | |
| 4.6-f | Full audit log of screening decisions | [x] | |

## §4.7 P2P cycle

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.7-a | Purchase Requisitions with budget check | [x] | |
| 4.7-b | Purchase Orders (encumbrance) | [x] | |
| 4.7-c | GRN / Service Acceptance | [x] | |
| 4.7-d | 3-way match (PO ↔ GRN ↔ Invoice) | [x] | |
| 4.7-e | Vendor master on `partners` (extended) | [x] | |
| 4.7-f | Petty cash floats + replenishment + custodian rotation | [x] | |
| 4.7-g | Expense-advance settlement | [x] | |
| 4.7-h | Per-diem rates registry per location + grade | [x] | |

## §4.8 AR / billing

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.8-a | Donor / customer invoices | [x] | |
| 4.8-b | Credit & debit notes | [x] | |
| 4.8-c | Customer / donor statements | [x] | |
| 4.8-d | Recurring billing for retainers | [x] | |
| 4.8-e | Receipts allocated against invoices | [x] | |
| 4.8-f | Bank deposit slips reconciled to bank credits | [x] | |

## §4.9 Inventory, commodities & gifts-in-kind

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.9-a | Inventory module with warehouses, stock cards, reorder levels | [x] | |
| 4.9-b | Commodity tracking (Sphere Standards) | [x] | |
| 4.9-c | Costing — FIFO / weighted-average + write-down policy | [x] | |
| 4.9-d | GIK valuation at fair value at receipt date | [x] | |
| 4.9-e | Donated services recognition | [x] | |
| 4.9-f | Distribution → expense recognition with beneficiary count + GPS | [x] | |
| 4.9-g | Stock counts + shrinkage write-off workflow | [x] | |
| 4.9-h | Pre-positioned emergency stock | [x] | |
| 4.9-i | Beneficiary registry linkage | [x] | |
| 4.9-j | E-vouchers / CTP | [x] | |

## §4.10 Lease accounting (IFRS 16) & capital projects

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.10-a | Lease register | [x] | |
| 4.10-b | ROU asset + lease liability auto-generation | [x] | |
| 4.10-c | Monthly amortisation + interest journal | [x] | |
| 4.10-d | Modification handling (extend / terminate / reassess) | [x] | |
| 4.10-e | Short-term + low-value lease elections | [x] | |
| 4.10-f | Capital projects / CIP / WIP | [x] | |
| 4.10-g | Capitalisation policy threshold per branch | [x] | |
| 4.10-h | Asset impairment + disposal / write-off workflow | [x] | |
| 4.10-i | Insurance register linked to assets | [x] | |

## §4.11 Multi-signatory cash & treasury

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.11-a | Multi-signatory bank accounts with combination rules | [x] | |
| 4.11-b | Cheque register with sequence integrity | [x] | |
| 4.11-c | Cheque void / stop-payment | [x] | |
| 4.11-d | Bank guarantees + LCs (off-balance-sheet) | [x] | |
| 4.11-e | Bulk-disbursement files (M-Pesa B2C, NACHA, SEPA, local) | [x] | |
| 4.11-f | Failed-payment retry workflow | [x] | |
| 4.11-g | Refund processing | [x] | |
| 4.11-h | Daily cash-position projection | [x] | |
| 4.11-i | Cash-pooling across branches | [x] | |
| 4.11-j | Bank-feed reconciliation with AI matching | [x] | |
| 4.11-k | Mobile-money APIs (M-Pesa / Airtel / Sudan EBS) | [x] | |

## §4.12 HR financial extensions

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.12-a | Pension / provident fund management | [x] | |
| 4.12-b | Loans beyond advances (housing / vehicle / salary) with interest amortisation | [x] | |
| 4.12-c | Garnishments / court orders with priority ordering | [x] | |
| 4.12-d | Severance & gratuity accruals | [x] | |
| 4.12-e | Multi-currency payroll for expat / cross-border staff | [x] | |
| 4.12-f | Tax equalisation for expat staff | [x] | |
| 4.12-g | Per-diem reconciliation (actual vs schedule) | [x] | |
| 4.12-h | Volunteer / consultant honoraria | [x] | |

## §4.13 Reporting layer

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.13-a | `/reports/financial` (TB, GL, SoA, SoFP, Func Expenses, CF, Equity, AR/AP Aging, Bank Recon, Fixed Assets) | [x] | |
| 4.13-b | `/reports/project` | [x] | |
| 4.13-c | `/reports/cost-center` | [x] | |
| 4.13-d | `/reports/scenario` | [x] | |
| 4.13-e | `/reports/forecast` | [x] | |
| 4.13-f | Donor-specific reports (FFR/SF-425, EU PRAG, UN OCHA, FCDO) | [x] | |
| 4.13-g | Recharts wrappers + bilingual axis-label helper | [x] | |
| 4.13-h | Bilingual EN/AR exports (PDF/Excel/CSV) | [x] | |
| 4.13-i | Audit-pack ZIP generator with legal-hold | [x] | |
| 4.13-j | Read-only auditor account scoped to frozen period | [x] | |
| 4.13-k | Drill-everywhere — figure → GL → journal → source doc | [x] | |
| 4.13-l | Deep-links to existing PACT report pages | [x] | |

## §4.14 AI & analytics

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.14-a | AI journal coding suggestions (admin-scoped scanner) | [x] | |
| 4.14-b | Anomaly detection (unusual amount/frequency/vendor) | [x] | |
| 4.14-c | Single chat interface across ledger + reports | [x] | |
| 4.14-d | Predictive cash-flow forecasting | [x] | |
| 4.14-e | Automated ratio analysis | [x] | |
| 4.14-f | Sensitivity-analysis RPC | [x] | |
| 4.14-g | Forecast-accuracy tracking | [x] | |

## §4.15 Banking & mobile money

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.15-a | Bank-feed reconciliation engine (start with one bank format) | [x] | |
| 4.15-b | Mobile-money disbursement APIs per A3 priority | [x] | |
| 4.15-c | Charge-back / dispute handling | [x] | |

## §4.16 Notifications & alerts

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.16-a | Reuse `NotificationTriggerService` | [x] | |
| 4.16-b | Channels: in-app + email + WhatsApp + push (no SMS) | [x] | |
| 4.16-c | Audit log via existing notifications table | [x] | |
| 4.16-d | Threshold alerts via `report_alert_rules` | [x] | |
| 4.16-e | Scheduled email reports with embedded charts | [x] | |

## §4.17 APIs

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.17-a | REST `/api/v1/...` versioned | [x] | |
| 4.17-b | GraphQL `/graphql/v1` via `pg_graphql` | [x] | |
| 4.17-c | OAuth2 / JWT scopes | [x] | |
| 4.17-d | Auto-generated OpenAPI | [x] | |
| 4.17-e | Outbound webhooks (`journal.posted`, `period.closed`, `threshold.breached`) | [x] | |
| 4.17-f | Rate limiting + IP allow-list | [x] | |

## §4.18 Crisis & emergency-mode workflows

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.18-a | Emergency cash-advance fast-track | [x] | |
| 4.18-b | Pre-positioned funds release on activation | [x] | |
| 4.18-c | Crisis-mode approval bypass with auto-review | [x] | |
| 4.18-d | Quick-fund codes for new emergencies | [x] | |
| 4.18-e | Conflict-zone payment mode (cash + photo + GPS + biometric) | [x] | |

## §4.19 Internal audit, risk & whistleblower

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.19-a | Internal Audit module (plan / sample / findings / response) | [x] | |
| 4.19-b | Risk register tied to financial controls | [x] | |
| 4.19-c | COSO / ICFR self-assessment | [x] | |
| 4.19-d | Whistleblower / fraud-reporting channel | [x] | |
| 4.19-e | Audit committee dashboard | [x] | |
| 4.19-f | Management letter tracking | [x] | |

## §4.20 ESG / SDG / impact tagging

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.20-a | SDG 1–17 tagging on every expense line | [x] | |
| 4.20-b | Beneficiary cost-effectiveness | [x] | |
| 4.20-c | Carbon footprint of operations | [x] | |
| 4.20-d | Gender-responsive budgeting flags | [x] | |
| 4.20-e | Grand Bargain localisation index | [x] | |

## §4.21 Localisation

| # | Feature | Confirm | Override |
|---|---|---|---|
| 4.21-a | EN + AR with proper RTL on day one | [x] | |
| 4.21-b | French + Swahili (timing per E9) | [x] | |
| 4.21-c | Arabic-Indic vs Western numerals toggle per user | [x] | |
| 4.21-d | Hijri fiscal-year option per branch | [x] | |
| 4.21-e | Locale currency formatting per user | [x] | |
| 4.21-f | PDF font registration (Cairo / Amiri / IBM Plex Sans Arabic + FR / SW) | [x] | |
| 4.21-g | Per-block RTL within LTR pages | [x] | |

## §5 Non-functional requirements

| # | Feature | Confirm | Override |
|---|---|---|---|
| 5.1-a | DB-level Segregation of Duties (RLS + `check_sod` trigger) | [x] | |
| 5.1-b | Forbidden combos enforced (post≠approve, vendor-create≠pay, payroll-approve≠payee, transfer-init≠release) | [x] | |
| 5.1-c | Maker-checker on COA / tax / FX / template config | [x] | |
| 5.1-d | Mandatory 2FA for finance / accountant / auditor / admin | [x] | |
| 5.1-e | Encrypted bank account / IBAN columns | [x] | |
| 5.1-f | Rate limiting + IP allow-list on APIs | [x] | |
| 5.2-a | 7-year donor retention + legal-hold flags | [x] | |
| 5.2-b | GDPR pseudonymisation rule per D10 | [x] | |
| 5.2-c | PII inventory per finance table | [x] | |
| 5.2-d | Backup RPO/RTO sign-off + DR runbook | [x] | |
| 5.2-e | Read-only auditor account scoped to frozen period | [x] | |
| 5.3-a | Partition `acct_journal_lines` by fiscal period | [x] | |
| 5.3-b | Documented indexing strategy | [x] | |
| 5.3-c | Materialised views refreshed on `journal.posted` (NOTIFY/LISTEN) | [x] | |
| 5.3-d | `pg_cron` + Edge Function background job framework | [x] | |
| 5.3-e | API pagination + cursor listings | [x] | |
| 5.3-f | N+1 prevention via CTE-based RPCs | [x] | |
| 5.4-a | Sanctions block on payment | [x] | |
| 5.4-b | HMAC-signed webhooks with replay protection | [x] | |
| 5.4-c | Threat-model document for public APIs | [x] | |
| 5.5-a | Parallel-run period (2 fiscal periods) | [x] | |
| 5.5-b | Opening-balance cut-over playbook | [x] | |
| 5.5-c | Synthetic data generator | [x] | |
| 5.5-d | Posting-engine unit-test suite (≥95% branch coverage) | [x] | |
| 5.5-e | Reconciliation regression tests | [x] | |
| 5.5-f | End-to-end period-close test per release | [x] | |
| 5.5-g | Change-management plan + training cycle | [x] | |
| 5.5-h | In-app help / tooltips bilingual | [x] | |
| 5.5-i | Video walkthrough library EN + AR | [x] | |
| 5.5-j | User certification programme | [x] | |
| 5.5-k | Public transparency dashboard (off until donor requires) | [x] | |
| 5.5-l | Performance monitoring with p50/p95 alerts | [x] | |
| 5.5-m | Feature flags per branch with instant rollback | [x] | |
| 5.5-n | Daily sub-ledger reconciliation jobs | [x] | |

---

# PART III — Phase confirmation *(scope per phase)*

Tick to confirm each phase's scope is in-plan as written in §6. Phase 1 is
the immediate one — must sign off now. Later phases can sign off at the
start of their own kick-off.

| Phase | Scope summary | Confirm | Override |
|---|---|---|---|
| **Phase 0** *(in flight)* | Finish HR audit H1–H10 | [x] | |
| **Phase 1** *(2–3 sprints)* | GL foundations — `acct_*` schema + fund model + `acct_post_journal` RPC + sanctions module + SoD matrix + 2FA + PII inventory + partitioning + audit-trail view + posting-engine tests + synthetic data generator + feature flags + Arabic jsPDF font | [x] | |
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

- [x] HR audit gaps (H1–H10) — handled in current sprint, not this plan
- [x] Statutory tax-authority filing portals — handled per-country in Phase 6 connectors
- [x] Replacing existing operational pages — plan adds GL underneath, never in front
- [x] Mobile-app authoring of journals before Phase 9
- [x] Live multi-cursor co-editing
- [x] Investment management (term deposits, FX hedging)
- [x] Transfer-pricing documentation
- [x] Country-by-country reporting (BEPS)
- [x] IAS 12 deferred-tax assets / liabilities
- [x] EVM (Earned Value Management)
- [x] SEFA / Form 990 / Charity Commission auto-return generation
- [x] Donor-portal data feeds (USAID DEC, EU INFOREURO, UN partner portal)
- [x] SSO (SAML / Azure AD) for external auditors
- [x] SFTP batch-file exchange

---

# PART V — Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Country Director | | | |
| Finance Manager | | | |
| HR Director | | | |
| Engineering Lead | (Engineering) | _provisional_ | 2026-04-25 |
| Internal Audit Lead | | | |
| Donor Compliance Officer | | | |

---

*Once all six signatures are in place, attach a copy to the kick-off ticket
for **Phase 1 GL foundations** and proceed to
`docs/ACCOUNTING_PHASE1_DESIGN.md` for the sprint design.*
