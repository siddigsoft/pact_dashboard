# PACT Accounting Module — Open Questions Sign-off Sheet

**Companion to:** `docs/ACCOUNTING_MODULE_MASTER_PLAN_V2.md` §7
**Purpose:** circulate to stakeholders for confirm-or-change. Each question
has a **recommended default** based on the consolidated plan; tick or amend.
**Sign-off rule:** Phase 1 cannot start until every Group A + D + E item is
agreed; Group B + C items can defer to their owning phase.

---

## How to use

1. Read the **Recommended default** for each question.
2. If you agree, tick `[x]` in the **Confirm** column and leave **Override**
   blank.
3. If you disagree, leave **Confirm** blank and write the new answer in
   **Override**.
4. Sign at the bottom.

Most defaults are obvious; the genuine debates are likely **A1, A3, D1, D3,
D6, D7, E2, E9**.

---

## Group A — Platform *(blocks Phase 1)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **A1** | Branches scope on day one — which legal entities are live first? | **PACT-Sudan only**; add other countries from Phase 4 |  | |
| **A2** | Functional currency per entity | **SDG** for PACT-Sudan; **USD** for any donor-facing reporting branch |  | |
| **A3** | Mobile-money providers priority | **Sudan EBS first (local need), then M-Pesa (KE/UG/TZ), then Airtel** |  | |
| **A4** | AI provider for journal coding + chat | **Reuse existing Gemini 2.0 Flash → Groq fallback** stack from `scan-transaction` |  | |
| **A5** | First external API consumer | **None at launch** — keep APIs internal until a real consumer surfaces, then re-scope OAuth scopes |  | |

---

## Group B — Reporting *(can defer to Phase 3 / 7 / 8)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **B3** | Waterfall charts | **Custom Recharts composition** (no new dependency) |  | |
| **B4** | Server-side chart rendering for scheduled email | **Static PNG via headless Chromium in an Edge Function** — render once, attach to email |  | |
| **B5** | Threshold-alert rule shape | **Confirm `report_alert_rules` schema as proposed in §4.16** |  | |
| **B6** | Sensitivity engine | **RPC-based** (`compute_sensitivity_scenario`) — same numbers everywhere |  | |
| **B7** | Drill-down depth | **4 levels**: report figure → GL account → journal → source document |  | |
| **B8** | Report refresh cadence | **Near-real-time** via materialised views refreshed on `journal.posted` (NOTIFY/LISTEN) |  | |

---

## Group C — Reality / reuse *(blocks Phase 1 if controversial)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **C1** | Wallets vs GL | **Subordinate sub-ledger** — wallets stay, reconcile daily to a `Wallet Liabilities` GL account |  | |
| **C2** | Department-as-cost-center sufficiency for Phase 1 | **Yes** — use `departments` as proxy in Phases 1–3; introduce real `cost_centers` only if reporting needs require |  | |
| **C3** | Offline journal posting | **Idempotency-key + last-writer-wins on header / immutable lines** |  | |
| **C4** | Keep `acct_*` table-name prefix | **Yes** — keeps the bounded context obvious |  | |
| **C5** | Existing report pages | **Deep-link** from new `/reports/*` index pages — no rewrites |  | |
| **C6** | EAC statutory bracket sourcing | **Finance team owns the seed data per country**; engineering owns the schema |  | |
| **C7** | Period-close authority chain | **Finance Manager opens / verifies → Country Director approves**; Accountant operates within open period |  | |
| **C8** | Mobile-money sandbox access | **Procure** — none exists today |  | |

---

## Group D — Donor / compliance *(blocks Phase 2.5)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **D1** | Donor regimes on day one | **USAID, EU PRAG, UN OCHA** (top three); add FCDO + Global Fund in Phase 2.5 +1 |  | |
| **D2** | Sanctions list sources | **OFAC SDN + EU consolidated + UN consolidated** baseline; **HMT UK + DFAT Australia opt-in per branch** |  | |
| **D3** | Current NICRA letter rate | **Confirm with finance** — no default; needed before NICRA cap can enforce |  | |
| **D4** | Active grants with cost-share targets | **Confirm with finance** — list of grant IDs + target % |  | |
| **D5** | Reversal policy | **Contra-journal only** — never delete-and-replace |  | |
| **D6** | Soft-close window | **5 working days** post-period-end for adjustments before hard-close |  | |
| **D7** | Auditor access | **Read-only DB role + scoped API token** (both) |  | |
| **D8** | Hijri calendar | **Per-user opt-in** — Gregorian remains primary; Hijri renders alongside on user-flagged pages |  | |
| **D9** | Per-diem registry source | **PACT-internal** schedule with **UN DSA fallback** for missing locations |  | |
| **D10** | PII pseudonymisation rule on GDPR erasure | **Replace `full_name`, `email`, `phone`, `national_id` with hashed token; retain ledger numbers + amounts unchanged** |  | |

---

## Group E — Nonprofit / hygiene *(blocks Phase 1 + Phase 2.5)*

| # | Question | Recommended default | Confirm | Override |
|---|---|---|---|---|
| **E1** | Fund-accounting model | **Dual-render** — one set of books, two report layouts (corporate P&L + nonprofit Statement of Activities) |  | |
| **E2** | Inventory / commodities scope on day one | **Defer to Phase 6** — too big for Phase 1; track GIK valuation in Phase 2.5 only |  | |
| **E3** | IFRS 16 vs ASC 842 + discount rate | **IFRS 16**; discount rate = **PACT incremental borrowing rate per branch, reviewed annually** |  | |
| **E4** | Mobile-money bulk-disbursement formats day one | **M-Pesa B2C bulk only**; add others as needed |  | |
| **E5** | Pension fund managers + remittance file formats | **Confirm with HR** — no default |  | |
| **E6** | Crisis-mode bypass policy | **Country Director can activate for max 7 days; auto-review within 14 days; every bypassed approval logged** |  | |
| **E7** | SDG tagging | **Mandatory on every expense line**; default tag = "untagged" so it never blocks posting |  | |
| **E8** | Parallel-run length | **2 fiscal periods** — confirmed |  | |
| **E9** | Localisation languages on day one | **EN + AR only**; add FR / SW from Phase 3 if a partner explicitly requires |  | |
| **E10** | Public transparency dashboard | **Off until a donor explicitly requires it**, then enable per branch |  | |

---

## Out-of-scope confirmation

Tick to confirm these stay **out of scope** (per master plan §8):

- [ ] Investment management (term deposits, FX hedging)
- [ ] Transfer-pricing documentation
- [ ] Country-by-country reporting (BEPS)
- [ ] IAS 12 deferred-tax assets / liabilities
- [ ] EVM (Earned Value Management)
- [ ] SEFA / Form 990 / Charity Commission auto-return generation
- [ ] Donor-portal data feeds (USAID DEC, EU INFOREURO, UN partner portal)
- [ ] SSO (SAML / Azure AD) for external auditors
- [ ] SFTP batch-file exchange
- [ ] Live multi-cursor co-editing
- [ ] Mobile app authoring journals before Phase 9

---

## Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Country Director | | | |
| Finance Manager | | | |
| HR Director | | | |
| Engineering Lead | | | |
| Internal Audit Lead | | | |
| Donor Compliance Officer | | | |

---

*Once signed, attach a copy to the kick-off ticket for **Phase 1 GL
foundations** and proceed to `docs/ACCOUNTING_PHASE1_DESIGN.md` for the
sprint design.*
