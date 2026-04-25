# PACT — Phased Deployment & Test Runbook

> Companion to `docs/PLANNING_INDEX.md` (the "PACT Planning Master Index").
> This file says **how** each phase actually ships and **what you click** to
> verify it works before moving on.

**Targets**

| Layer | Where it lives | How it deploys |
|---|---|---|
| Database (PostgreSQL) | Supabase project **`pactdb`** (`abznugnirnlrqnnfkein`) | Paste SQL into the **Supabase → SQL Editor** for `pactdb`. All migrations are idempotent. |
| Edge Functions | Supabase Edge Functions in `pactdb` | `supabase functions deploy <name>` from the project root, **or** paste the function code into Supabase → Edge Functions UI. |
| Frontend (web) | Vercel (`app.pactorg.com`) | Push to `main` → Vercel auto-builds. Click **Promote to Production** on the build that passes. |
| Mobile | Flutter / Shorebird | Mobile is **not** in scope for Phases 0–8 except read-only. Phase 9 covers mobile parity. |

**Three rules that apply to every phase**

1. **Backup first.** Before any phase that ships a new migration, take a Supabase point-in-time-recovery snapshot (Project → Settings → Database → Backups → "Create on-demand").
2. **Feature-flag risky changes.** Anything that affects money is wrapped in a feature flag (introduced in Phase 1). Default = OFF. Flip ON for a small pilot, monitor 24h, then go wide.
3. **No phase advances** without all green checks in its **Sign-off gate** at the end of its block.

---

## Phase 0 — HR Audit (H1–H10) · *partially deployed*

### What this phase ships
- Seven new HR tables (`salary_advances`, `expense_claims`, `expense_claim_lines`, `eosb_accruals`, `attendance_logs`, `offboarding_cases`, `payroll_statutory_brackets`, `leave_entitlement_audit`)
- Triggers: salary-increment auto-apply (H1), leave-entitlement audit (H6)
- RPCs: `calculate_payroll_statutory`, `accrue_eosb_for_period`, `next_expense_claim_number`
- Frontend: `PayrollAdmin.tsx` deductions snapshot, `AdvanceRequestsReport`, `MyExpenses`, `Attendance`, `Offboarding` pages, sidebar entries (Wallet/Clock icon fix)
- Edge function: `payroll-auto-run` includes statutory + combined deductions

### Deploy steps
1. **DB (`pactdb` SQL editor):**
   1. If you haven't yet → paste **`docs/sql/HR_AUDIT_MANUAL_APPLY.sql`** (rev 3). Run.
   2. If the previous run left things stuck → paste **`docs/sql/HR_AUDIT_FIX_PATCH.sql`** (rev 2). Run.
2. **Edge function:** `supabase functions deploy payroll-auto-run --project-ref abznugnirnlrqnnfkein`
3. **Frontend:** push current `main` → wait for Vercel build → **Promote to Production**.

### Smoke tests (10 minutes)
| # | Action | Expected |
|---|---|---|
| 0.1 | Log in as super_admin → open `/dashboard` | Page renders, **no** "Wallet is not defined" crash. |
| 0.2 | `/payroll-admin` → open any active employee → click "Recalculate" | Net pay row shows a **Statutory deductions** sub-block with PIT, NPF Employee, NPF Employer, total. |
| 0.3 | `/salary-increments` → approve a pending row with `effective_date = today` | Within 2s the linked employee's `employee_salary_config.base_salary` updates **and** the employee receives a notification (in-app + WhatsApp if opted in). |
| 0.4 | `/leave` → as HR, edit any employee's `annual_days` from 21 → 22 → save | New row in `leave_entitlement_audit` with `field_name='annual_days'`, `old_value=21`, `new_value=22`, AND the employee gets a notification. |
| 0.5 | `/advance-requests` → as employee, submit an advance for SDG 50,000, 3 months | Status = `pending_manager`. Manager and Finance get notifications. |
| 0.6 | As manager → approve → as finance → approve | Status flips through `pending_finance` → `approved` → `disbursed`. |
| 0.7 | `/my-expenses` → submit a multi-line claim with a receipt URL | Status = `pending_manager`, claim_number auto-assigned `EXP-2026-NNNNN`. |
| 0.8 | `/attendance` → check-in (allow GPS) | Row in `attendance_logs` with lat/lng + timestamp. |
| 0.9 | `/offboarding` → initiate for a test employee | Final-settlement worksheet renders (pro-rated salary + leave encashment + EOSB − advances). PDF export works. |
| 0.10 | In SQL editor: `SELECT public.calculate_payroll_statutory(50000, 'SD', false);` | Returns JSON with `pit`, `social_employee`, `social_employer`, `total_employee`. |

### Rollback
- DB: this phase **adds** tables/policies/functions only — no destructive change. Rollback = drop the 7 new tables (data loss accepted because nothing else references them yet).
- Frontend: in Vercel, "Promote to Production" the previous build.
- Edge function: re-deploy the previous git revision of `payroll-auto-run`.

### Sign-off gate → Phase 1
- [ ] All 10 smoke tests pass
- [ ] Production has stayed up 24 h with no new error in `Vercel → Logs` matching `Wallet|payroll|advance|expense`
- [ ] Finance has eyeballed one pay slip and confirmed the deductions math

---

## Phase 1 — GL foundations *(2–3 sprints)*

### What this phase ships
*(See `docs/ACCOUNTING_PHASE1_DESIGN.md` for the full design.)*
- New tables `acct_accounts`, `acct_funds` (with restriction type), `acct_periods`, `acct_journals`, `acct_journal_lines`, `acct_tax_codes`, `acct_sanctions_list`, `acct_sod_rules`
- Seed: Sudan Chart of Accounts + default tax codes
- RPCs: `acct_post_journal(p_journal jsonb)`, `acct_trial_balance(p_period text, p_branch uuid)`, `acct_check_sanctions(p_partner_id uuid)`
- Triggers: `acct_journal_balance_trg` (rejects unbalanced journals), `acct_sod_check_trg`
- **Feature-flag framework** (`feature_flags` table + `is_feature_on(name)` RPC)
- **Sanctions screening module** (CSV import → `acct_sanctions_list` + nightly refresh)
- **SoD matrix + 2FA enforcement** for finance roles
- Frontend: `/accounting/journals`, `/accounting/coa`, `/accounting/trial-balance` (admin-only behind flag `acct_phase1`)
- Posting-engine **unit-test suite** (run with `npm run test:acct`) + **synthetic data generator**

### Deploy steps

**Sprint 1.1 (this iteration — code ready 2026-04-25):**
1. **Backup `pactdb`** → on-demand snapshot.
2. **DB:** paste `supabase/migrations/20260501_acct_phase1_sprint1_1.sql` into the pactdb SQL editor. Run. (Schema, posting RPC, Trial Balance RPC, feature flags, FY2026, 7 root chapter headers.)
3. **DB:** paste `docs/sql/PHASE1_SPRINT1_1_SEED_SUDAN_COA.sql`. Run. (~80 postable accounts under the 7 chapters.)
4. **DB:** run smoke checks from `docs/sql/PHASE1_SPRINT1_1_MANUAL_APPLY.md` §Smoke tests — all object counts and the end-to-end posting + TB test must pass.
5. **DB rollback (if needed):** paste `docs/sql/PHASE1_SPRINT1_1_ROLLBACK.sql` (refuses if posted entries exist).

**Sprint 1.2 (next — sanctions / SoD / audit-trail):** queued — paste
`supabase/migrations/20260508_acct_phase1_sprint1_2.sql` once Sprint 1.1 has
been smoke-clean for 24 h.

**Sprint 1.3 (next — test harness + synthetic data generator):** queued —
paste `supabase/migrations/20260515_acct_phase1_sprint1_3.sql` after Sprint
1.2 sign-off.

**Frontend rollout (after all three sprints DB-applied):**
6. Push the `/accounting/coa`, `/accounting/journals`, `/accounting/trial-balance`, `/finance/audit-trail` pages (ships in Sprint 2 of frontend work — gated behind `acct.posting_engine.enabled`).
7. Verify in Vercel preview, then promote.

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 1.1 | As super_admin → `/accounting/coa` | Sudan COA tree renders, ≥ 5 top-level groups (Assets, Liabilities, Equity, Revenue, Expenses). |
| 1.2 | `/accounting/journals` → "New journal" → add 2 lines: Dr 1000 Cash, Cr 1000 Donations (same fund) → Save | Status `posted`, `acct_post_journal` returned `ok`. |
| 1.3 | Repeat 1.2 but make it unbalanced (Dr 1000, Cr 999) | Save fails with explicit "journal does not balance" error. **No row written.** |
| 1.4 | Try to post a journal that pays a partner whose name is on the sanctions seed list | Save fails with "sanctioned partner" error and writes a row to `acct_journal_attempts`. |
| 1.5 | `/accounting/trial-balance?period=2026-04` | Net debit total = net credit total. |
| 1.6 | Toggle `acct_phase1` flag OFF → reload `/accounting/journals` | Page shows "Feature not enabled for your role" — confirms the kill switch works. |
| 1.7 | Run `npm run test:acct` locally against the deployed DB | All ≥ 30 unit tests pass. |
| 1.8 | As a finance user **without** 2FA enabled → try to open `/accounting/journals` | Redirected to `/security/enable-2fa` first. |

### Rollback
- Flip feature flag `acct_phase1` to OFF — frontend hides everything immediately.
- DB: `acct_*` tables are net-new and have no FK from any pre-existing PACT table, so a clean drop is safe. Have the drop-script ready before deploy.

### Sign-off gate → Phase 2
- [ ] All 8 smoke tests pass
- [ ] Synthetic-data run posts 10,000 journals in < 60s
- [ ] Sanctions list is populated (≥ 1 entry from each of: UN, OFAC, EU, UK, Sudan local list)
- [ ] At least one finance user is enrolled in 2FA in production
- [ ] Open Questions §A (platform) signed off

---

## Phase 2 — Wire operational pages to GL *(2 sprints)*

### What this phase ships
- Posting-bridge code in: `PayrollAdmin` (run approval → journals), wallet credit/withdraw, operational cost final approval, down-payments, salary advances, retainers, transport, classification fees, financial-gap reclaim, transaction scanner (AI draft lines)
- P2P module: `/procurement` (PR → PO → GRN → 3-way match)
- `/expense-advances/settlement` workflow
- `/invoices` + credit / debit notes
- Cheque register + multi-signatory bank accounts (`/banking/cheques`)
- Daily cron job `acct-subledger-reconcile` that flags any operational-table row without a matching journal
- Crisis-mode bypass (super_admin can short-circuit SoD with mandatory reason text)

### Deploy steps
1. **Backup `pactdb`**.
2. DB: `supabase/migrations/20260601_acct_phase2.sql` (P2P tables + bridge views) → SQL editor for `pactdb`.
3. Edge function: `supabase functions deploy acct-subledger-reconcile`.
4. Schedule the cron in Supabase → Database → Cron: `0 1 * * *` (01:00 UTC daily).
5. Frontend: push, build, set flag `acct_phase2` ON for super_admin + finance role.
6. **Pilot ONE operational stream first** (recommend payroll). Watch the daily reconciliation report for 7 days before turning on the next stream.

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 2.1 | Create a test payroll run for 1 employee, approve | Two journals appear in `/accounting/journals` (gross expense + net liability). |
| 2.2 | Wallet → credit a user SDG 1000 | Cash-side journal posted. Reverse → contra-journal posted. |
| 2.3 | Submit + approve an operational cost SDG 5000 | Expense journal posted on final approval, **not** on submission. |
| 2.4 | `/procurement` → PR → PO → GRN → match invoice → pay | All 4 steps create the right journals; mismatched 3-way blocks payment. |
| 2.5 | Run `acct-subledger-reconcile` manually | Returns `{processed: N, mismatches: 0}` on a clean day. |
| 2.6 | Trial Balance for the period | Reconciles to `SELECT sum(amount) FROM payroll_run_items WHERE period = …` etc. for each operational source. |
| 2.7 | As super_admin, attempt a "crisis bypass" of SoD | Allowed, but row written to `acct_audit_bypass_log` with the reason text. |

### Rollback
- Flip `acct_phase2` OFF — operational pages stop posting (revert to pre-Phase-2 behaviour).
- New tables (P2P, cheques) are isolated; rows can be left in place or truncated.

### Sign-off gate → Phase 2.5
- [ ] All 7 smoke tests pass
- [ ] Daily reconciliation has reported `mismatches: 0` for 7 consecutive days
- [ ] Finance has signed off the first month's TB matches sub-ledger totals

---

## Phase 2.5 — Donor & grant compliance *(2 sprints, blocks Phase 3)*

### What this phase ships
- Tables: `acct_donor_regimes`, `acct_grants`, `acct_pledges`, `acct_sub_recipients`, `acct_cost_share`, `acct_time_effort`, `acct_gik`
- NICRA indirect-cost cap enforced by trigger on `acct_journal_lines`
- Re-budgeting workflow + carry-forward funds across fiscal years
- Multi-year grant amortisation (deferred-revenue recognition)
- Reports: Statement of Activities, Functional Expenses, Pledges Receivable
- SDG tagging field on expense lines

### Deploy steps
1. Backup. Migration. Seed donor regimes (USAID, EU PRAG, UN OCHA, FCDO, Global Fund).
2. Frontend behind flag `acct_phase25`. Pilot with **one** active grant.

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 2.5.1 | Create a grant, set NICRA cap = 12% | Posting an indirect-cost journal that pushes the grant past 12% **fails** with explicit error. |
| 2.5.2 | Time & effort cert → fill 60% Grant A / 40% Grant B for a payroll period | Salary auto-splits 60/40 between the two grants on next payroll run. |
| 2.5.3 | `/reports/statement-of-activities?grant=G1` | All four columns (Unrestricted / Temp Restricted / Permanently Restricted / Total) present and tie back to journals. |
| 2.5.4 | Carry-forward year-end | Unspent restricted funds appear as opening balance in the next fiscal year's grant ledger. |

### Rollback
- Flag off. Tables remain (data is the user's grant data, not destructive).

### Sign-off gate → Phase 3
- [ ] All 4 smoke tests pass on one real grant
- [ ] One donor (whichever regime is active) signs off Statement of Activities format

---

## Phase 3 — Reporting layer v1 *(2 sprints)*

### What this phase ships
- Routes `/reports/financial`, `/reports/project`, `/reports/cost-center`
- Recharts wrappers + bilingual axis-label helper
- EN/AR exports (PDF / Excel / CSV) — verify Arabic glyphs render in jsPDF (was registered in Phase 1)
- Read-only auditor view (frozen-period scope)
- Saved filters, favourites, drill-everywhere, Hijri calendar
- Capture channels: email-to-expense, WhatsApp-to-expense, camera-to-expense from Flutter
- Optional FR / SW localisation

### Deploy steps
1. DB: small migration for `report_saved_filters`, `report_favourites`.
2. Edge functions: `email-to-expense`, `whatsapp-to-expense` (re-uses Wasender).
3. Frontend behind flag `acct_phase3`.

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 3.1 | `/reports/financial?type=trial_balance&period=2026-04` | Matches `acct_trial_balance` RPC output 1:1. |
| 3.2 | Export to PDF in AR | Arabic renders right-to-left, no missing-glyph boxes. |
| 3.3 | Save filter → log out → log back in | Filter is in `Favourites`. |
| 3.4 | Email a receipt to `expenses@app.pactorg.com` | Draft expense claim appears for the matching user with the receipt attached. |
| 3.5 | WhatsApp a receipt photo to the bot number | Same — draft expense claim is created. |
| 3.6 | As an auditor user with `period_lock = 2026-03` | Can read 2026-03 reports only; all earlier or later periods read-only or hidden. |
| 3.7 | Drill into TB row → Journals → Lines → Source document | Each level loads in < 2s on production data. |

### Rollback
- Flag off — reports hidden. Capture-channel edge functions can be paused individually.

### Sign-off gate → Phase 4
- [ ] Finance produces TB, Statement of Activities, Statement of Financial Position, Cash Flow on demand
- [ ] Every figure traces to a posted journal
- [ ] Bilingual exports approved by Arabic-speaking finance reviewer

---

## Phase 4 — Multi-entity + FX revaluation *(2 sprints)*

### What this phase ships
- `branches` table (legal entities, distinct from `hubs`)
- `branch_id` added to `acct_*` and source tables
- FX revaluation RPC at period close + auto-reversal at next period start
- Intercompany clearing accounts + reciprocal-entry RPC
- Group consolidation RPC
- Lease accounting (IFRS 16) + capital projects (CIP / WIP)
- Cash pooling across branches
- Inter-warehouse inventory transfers
- Year-end retained-earnings rollover RPC
- Reversal-pattern enforcement (contra-journal only)
- Soft-close vs hard-close + adjusting-entries period
- Trial Balance lockdown after audit sign-off
- Optional: real `cost_centers` table replacing the `departments` proxy

### Deploy steps
1. Backup. **Big migration** — schedule maintenance window (≤ 30 min expected).
2. Run a dry-run of `acct_fx_revalue` on staging first (you'll have a copy of `pactdb`).
3. Frontend behind flag `acct_phase4`.

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 4.1 | Create a second branch "PACT Kenya" | Trial Balance can be filtered per-branch and consolidated. |
| 4.2 | Post a USD journal in a SDG branch, run period-close FX revalue | Realised + unrealised FX gain/loss appears on TB. |
| 4.3 | Inter-branch transfer of SDG 100,000 | Two reciprocal journals auto-created; clearing account nets to zero. |
| 4.4 | Lease commencement (5-year, 1M SDG/yr) | ROU asset + lease liability appear automatically. |
| 4.5 | Year-end rollover RPC | Income & expense accounts close to retained earnings; new fiscal year opens. |
| 4.6 | Hard-close period 2026-04, then try to post a journal dated 2026-04 | Rejected with "period closed". |

### Rollback
- Major. Plan a **rollback-by-restore** strategy: take a fresh PITR snapshot before the migration; if something blocks, restore to that snapshot.

### Sign-off gate → Phase 5
- [ ] Consolidated TB across at least two branches with FX revaluation visible
- [ ] Lease commencement test passes
- [ ] No corrupted balances reported in 14 days

---

## Phase 5 — Public APIs + webhooks *(1–2 sprints)*

### What this phase ships
- `pg_graphql` extension enabled; `/graphql/v1` exposed with API-key scope
- Versioned REST `/api/v1/...`
- OAuth2 / JWT scopes; published OpenAPI
- Outbound webhooks: `journal.posted`, `period.closed`, `threshold.breached`
- Internal audit module APIs
- Public transparency dashboard endpoint
- Rate limiting + IP allow-list
- Retention legal-hold flags

### Deploy steps
1. DB: `CREATE EXTENSION IF NOT EXISTS pg_graphql;`. Verify with `SELECT extname FROM pg_extension WHERE extname='pg_graphql';`.
2. Edge function: `acct-webhook-dispatcher` for outbound webhooks.
3. Generate OpenAPI from server code; publish to a static `/docs/api` page.

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 5.1 | `curl -H "apikey: …" /graphql/v1` introspection query | Returns the full schema, no auth errors. |
| 5.2 | Post a journal via REST `/api/v1/journals` with a scoped API key | Journal posts; webhook fires within 5s. |
| 5.3 | Try the same call with a key missing the `journals.write` scope | 403. |
| 5.4 | Hit `/api/v1/trial-balance` 200 times in a minute | After the rate limit, returns 429 with retry-after. |
| 5.5 | Public transparency endpoint `/api/public/spending` | Returns aggregated, **non-PII** numbers. |

### Rollback
- Disable `pg_graphql` (`DROP EXTENSION pg_graphql;`); pause webhook edge function; revoke all API keys.

### Sign-off gate → Phase 6
- [ ] A third party can read TB and post a journal via the API
- [ ] Webhooks deliver reliably (< 1% failure over 7 days)

---

## Phase 6 — Banking, treasury & mobile money *(2–3 sprints)*

### What this phase ships
- Bank-feed reconciliation engine (start with **one** bank format)
- AI matching suggestions
- Mobile-money disbursement APIs (priority per Q-A3)
- Cash-position dashboard (multi-bank, multi-currency, real-time)
- Payment batching / authorisation workflow
- Bulk-disbursement file generators (M-Pesa B2C bulk + others)
- Government e-filing connectors (per country)
- E-vouchers / CTP integration
- Petty cash module
- IBAN encryption at rest

### Smoke tests (key ones)
| # | Action | Expected |
|---|---|---|
| 6.1 | Upload a sample bank statement file | ≥ 80% of lines auto-matched. |
| 6.2 | Run a mobile-money disbursement of SDG 5,000 to one number | Reaches the recipient; success callback updates the journal status. |
| 6.3 | Cash-position dashboard | Multi-currency, multi-bank totals refresh in < 5s. |
| 6.4 | Petty-cash count at end-of-day | Variance flagged in real time. |

### Rollback
- Pause individual edge functions (`bank-feed-import`, `mm-disburse`). Bank file imports are write-once and can be soft-deleted (`status='reverted'`).

### Sign-off gate → Phase 7
- [ ] One bank's statement auto-reconciles ≥ 80% of lines
- [ ] One mobile-money disbursement runs end-to-end in production

---

## Phase 7 — Scenario, forecast & AI analytics *(2 sprints)*

### What this phase ships
- Routes `/reports/scenario`, `/reports/forecast`
- Tables `scenarios`, `scenario_variables`; RPC `compute_sensitivity_scenario`
- Predictive cash-flow forecasting
- Anomaly detection job for unusual transactions
- Single AI chat shared across ledger + reports
- Risk register + COSO self-assessment

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 7.1 | Build a scenario "USD up 20%" | Sensitivity chart updates within 3s. |
| 7.2 | Forecast next-quarter cash flow | Output band (P10/P50/P90) renders. |
| 7.3 | AI chat: "What was our Q1 PIT total in Sudan?" | Returns a number that matches the TB. |
| 7.4 | Anomaly job runs nightly | Posts to `notifications` for any flagged transaction. |

### Sign-off gate → Phase 8
- [ ] Variance + sensitivity charts render on real data
- [ ] Chat answers a benchmark set of 20 finance questions correctly (≥ 18 of 20)

---

## Phase 8 — Reporting alerts + scheduled email *(1 sprint)*

### What this phase ships
- `report_alert_rules` table + scheduled evaluator
- Alerts via existing notification service (in-app + email + WhatsApp + push)
- Scheduled email reports (chart-rendering decision per Q-B4)
- Audit-pack ZIP generator with legal-hold flagged items
- Conditional-contribution recognition triggers
- Audit committee dashboard
- Donor reporting template delivery via scheduled email

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 8.1 | Define a rule "Notify finance if expenses > budget × 1.1" | Trigger met → notification within 1 hour. |
| 8.2 | Schedule weekly TB email Monday 07:00 | Email arrives Monday with the right charts. |
| 8.3 | Generate an audit pack for one grant | ZIP contains all source docs flagged legal-hold. |

### Sign-off gate → Phase 9
- [ ] Finance gets a Monday-morning email with charts
- [ ] Budget breach triggers an alert within 1 hour

---

## Phase 9 — Hardening, BI, mobile parity *(open-ended)*

### What this phase ships
- Power BI / Supabase BI connector
- Flutter mobile app: read-only finance views + offline-safe journal posting for cash advances
- Threat model + pen test of public APIs
- Performance tuning of posting engine + report RPCs
- DR runbook + RPO / RTO sign-off
- Materialised view refresh strategy
- Keyboard shortcuts for accountants
- Carbon footprint + Grand Bargain localisation index reporting

### Smoke tests
| # | Action | Expected |
|---|---|---|
| 9.1 | Connect Power BI to Supabase | TB report renders in Power BI within 10s. |
| 9.2 | Flutter app offline → post a cash-advance journal → reconnect | Journal syncs to Supabase, no duplicates. |
| 9.3 | Pen-test report received | All criticals + highs closed before going wider. |
| 9.4 | DR drill | Restore from PITR snapshot to a fresh project, app boots, reports match. |

### Sign-off gate → done
- [ ] All criticals/highs from pen test resolved
- [ ] DR drill passed
- [ ] BI connector in use by at least one analyst

---

## Cross-phase reference

### Where the test users live
| Role | Test user | Use for |
|---|---|---|
| super_admin | `qa_super@pactorg.com` | Full-access smoke tests |
| finance | `qa_finance@pactorg.com` | SoD, posting, reports |
| hr | `qa_hr@pactorg.com` | HR audit, leave, payroll |
| manager | `qa_manager@pactorg.com` | Approvals |
| employee | `qa_employee@pactorg.com` | Self-service forms |
| auditor | `qa_auditor@pactorg.com` | Read-only, frozen periods |

### Feature-flag cheat sheet
```sql
-- See current state
SELECT name, enabled_for_roles FROM feature_flags ORDER BY name;
-- Turn ON for super_admin only
UPDATE feature_flags SET enabled_for_roles = '{super_admin}' WHERE name = 'acct_phase1';
-- Turn ON for super_admin + finance + hr
UPDATE feature_flags SET enabled_for_roles = '{super_admin,finance,hr}' WHERE name = 'acct_phase1';
-- Kill switch
UPDATE feature_flags SET enabled_for_roles = '{}' WHERE name = 'acct_phase1';
```

### Rollback playbook (any phase)
1. **Frontend:** Vercel → previous build → "Promote to Production" (instant).
2. **Edge functions:** `supabase functions deploy <name>` from previous git tag.
3. **DB schema:** restore Supabase PITR snapshot taken right before the deploy. Accept the small window of data loss; communicate clearly.
4. **Communicate:** post a single status update in the `#pact-ops` channel + one notification to admin users via the Broadcast Center.

### What we do **not** test in deployment
- Performance load tests — those go in a dedicated load environment, not prod.
- Real money mobile-money transfers in QA — only end-to-end test against the sandbox until phase sign-off, then a single SDG 1 production round-trip.
- Anything that writes to the agriculture **PACT-SuperApp** project (`lgdvhpxuxkrznncvqmuc`). That project is unrelated and must never receive these migrations.
