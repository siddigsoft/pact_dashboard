# PACT Accounting Module — Executive Sign-off (One-Pager)

**Companion to:** `docs/ACCOUNTING_OPEN_QUESTIONS_SIGNOFF.md` (full 460-line sheet)
**Audience:** Country Director · Finance Manager · HR Lead
**Time required:** 20 minutes
**Output:** Phase 1 of the accounting build is unblocked

---

## What you're being asked to decide

The full sign-off sheet has ~150 line items. **Engineering has already accepted
the recommended default on every line.** This page surfaces only the rows that
deserve a real executive conversation — six contested questions and three rows
that need a number from your team.

Everything else is locked-in as the master plan describes; if any of those
need to change, mark them on the full sheet later.

---

## Part A — The six contested questions *(decide today)*

For each row, **circle one option** OR write a different answer in the margin.

| # | Question | Option 1 *(recommended)* | Option 2 *(alternative)* | Decision |
|---|---|---|---|---|
| **A1** | Which legal entities go live on day one? | **PACT-Sudan only** — add other countries from Phase 4 | Sudan **+ one other** branch from day one (which?) | ____________ |
| **A3** | Which mobile-money provider do we wire first? | **Sudan EBS** first, then M-Pesa, then Airtel | M-Pesa first (if KE/UG/TZ revenue is bigger today) | ____________ |
| **C1** | What happens to the existing Wallet system? | **Wallets stay**, reconcile daily to a `Wallet Liabilities` GL account | Collapse wallets into GL (bigger change, breaks current UX) | ____________ |
| **C2** | Do `departments` work as cost-centers in Phase 1? | **Yes** — use `departments` as proxy now; introduce a real `cost_centers` table only if reporting needs require it later | Build `cost_centers` in Phase 1 (adds 2-3 weeks) | ____________ |
| **C7** | Who closes a fiscal period? | **Finance Manager opens / verifies → Country Director approves**. Accountant operates within an open period. | Different chain (specify below) | ____________ |
| **NICRA** | When NICRA indirect-cost cap is breached on a posting, what do we do? | **Hard-block** the posting (donor-safe, can frustrate edge cases) | **Soft-warn only** — log the breach, allow the posting | ____________ |

> **Tip for the meeting:** if you accept the *recommended* option on all six, the meeting is over and you can move straight to Part B.

---

## Part B — Three numbers we need from your team

These cannot be defaulted — engineering needs the actual values from PACT.

| # | What we need | Owner | Value |
|---|---|---|---|
| **D3** | Current NICRA indirect-cost rate (the % from your latest NICRA letter) | Finance Manager | _____ % |
| **D4** | List of currently-active grants with cost-share targets *(grant ID + cost-share %)* | Finance Manager | (attach list) |
| **E5** | Pension fund manager(s) + the file format they expect for monthly remittances | HR Lead | _____________ |

If any of these aren't ready today, they can be filled in within a week — they
only block **Phase 2.5** (donor compliance), not Phase 1.

---

## Part C — Confirmation we're starting Phase 1 next

Engineering has assumed the rest of the sheet exactly as written. By signing
below, you are also confirming:

- [ ] Phase 0 (HR audit H1–H10) is complete and acceptable
- [ ] Phase 1 (GL foundations) can start as scoped in §3 of the planning index
- [ ] All deferred phases (2 through 9) keep the scope shown in the master plan, with each phase re-confirmed at its own kick-off
- [ ] All "out of scope" items in Part IV of the full sheet are accepted as out of scope (mobile journals before Phase 9, transfer-pricing docs, BEPS, IAS 12 deferred tax, EVM, etc.)

---

## Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Country Director | | | |
| Finance Manager | | | |
| HR Lead | | | |
| IT / Engineering owner | | | |

---

### After signing

1. Save this page **and** the (mostly pre-ticked) full sheet to the repo.
2. Engineering opens the **Phase 1 GL Foundations** project task scoped to §3 of the planning index, with a target of 2-3 sprints.
3. Phase 0 (HR audit) is promoted in production and the 10 smoke tests in `docs/DEPLOYMENT_PHASED_PLAN.md` are walked through.
4. The status banner in `docs/PLANNING_INDEX.md` flips from `Open Questions in progress` → `Open Questions signed off YYYY-MM-DD`.

If the meeting can't decide one of the six questions, **mark it parked** and we'll proceed with the recommended default; the parked item can be revisited at the start of its owning phase without delaying Phase 1.
