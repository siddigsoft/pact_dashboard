# Testing Manual — 2026-07-15
## Features: Charge to Pre-Fund Selectors + Pre-Funding Category Breakdown

---

## Prerequisites

- You are logged in as a user with **Finance Admin**, **Admin**, or **Super Admin** role.
- At least one Pre-Fund record exists with status **active** or **low_balance** (create one under Finance → Pre-Funding if needed).
- At least one **approved** Cost Submission exists (status = Approved).
- At least one **approved** Down Payment request exists (ready for payment).

---

## Test 1 — "Charge to Pre-Fund" in the Cost Submission Mark as Paid Dialog

### Steps

1. Go to **Finance → Cost Submissions** in the sidebar.
2. Find any submission with status **Approved**.
3. Click the **Mark as Paid** button (green button, visible to Finance Admin / Admin / Super Admin).
4. The dialog opens. Scroll down — you should see a new section labelled **"Charge to Pre-Fund / خصم من التمويل المسبق"**.

### What to check

| # | Check | Expected |
|---|-------|----------|
| 1 | Pre-fund dropdown appears | Yes — a `Select` dropdown listing active funds with name + currency + available balance |
| 2 | Default selection | "— No pre-fund —" (nothing selected by default) |
| 3 | Select a fund | Dropdown shows each fund as: `Fund Name · SDG 12,000 available` |
| 4 | Balance preview after selecting | A line appears below: `After payment: SDG X remaining` |
| 5 | If amount > fund balance | Preview text turns **red** with `⚠ Exceeds available balance` warning |
| 6 | No active pre-funds exist | The section is hidden entirely (no empty dropdown shown) |
| 7 | Upload a receipt, then click Confirm | Payment is marked as paid AND the fund's available balance decreases by the submission amount |
| 8 | Toast notification | Shows **"Charged to Pre-Fund"** with fund name and amount deducted |
| 9 | If no fund selected | Falls back to auto-detection (existing behaviour — no regression) |

---

## Test 2 — "Charge to Pre-Fund" in the Down Payment Process Payment Dialog

### Steps

1. Go to **Finance → Down Payments** in the sidebar.
2. Find any request with status **Approved** (in the Approved tab).
3. Click the **Pay** button (or the pay action from the row menu).
4. The **Process Payment** dialog opens. Scroll down past the Notes field — you should see the **"Charge to Pre-Fund"** section.

### What to check

| # | Check | Expected |
|---|-------|----------|
| 1 | Pre-fund dropdown appears | Yes — same pattern as Cost Submission dialog |
| 2 | Default selection | "— No pre-fund —" |
| 3 | Select a fund | Fund list shows name + currency + available balance |
| 4 | Balance preview | `After payment: SDG X remaining` updates as you change the payment amount |
| 5 | Overage warning | Red text + ⚠ if payment amount exceeds fund balance |
| 6 | Attach receipt and confirm | Payment processed AND fund balance deducted |
| 7 | Toast on success | **"Charged to Pre-Fund"** toast with amount and fund name |
| 8 | If no fund selected | Payment processes normally with auto-link fallback (no regression) |

---

## Test 3 — Pre-Funding Category Breakdown

### Steps

1. Go to **Finance → Pre-Funding** in the sidebar.
2. Click on any Pre-Fund record that has **at least one transaction** (Paid Out > 0).
3. The detail panel opens on the right (or a details card expands).
4. Look at the KPI card — below the 4-cell grid (Total Funded / Paid Out / Committed / Available), there should be a new **"Paid-Out Breakdown"** section.

### What to check

| # | Check | Expected |
|---|-------|----------|
| 1 | Breakdown section visible | Yes — appears below the KPI grid, separated by a divider line |
| 2 | "Down Payments" tile | Shows total amount charged from down payment requests in **sky/blue** |
| 3 | "Cost Submissions" tile | Shows total amount charged from cost submissions in **violet** |
| 4 | "Other" tile | Only appears if there are transactions with a different or null source type |
| 5 | Percentages | Each tile shows `X%` of total paid out |
| 6 | Fund with zero paid out | Breakdown section is **hidden entirely** |
| 7 | Math check | Down Payments + Cost Submissions + Other should equal the "Paid Out" KPI value |

---

## Quick Smoke Test (All 3 in One Flow)

1. Create or find an active pre-fund with, say, **SDG 10,000** available.
2. Mark a Cost Submission of **SDG 2,000** as paid → charge it to that fund.
3. Process a Down Payment of **SDG 3,000** → charge it to the same fund.
4. Open the Pre-Funding detail for that fund.
   - KPI "Paid Out" should show **SDG 5,000**.
   - Breakdown: Cost Submissions = SDG 2,000 (40%) · Down Payments = SDG 3,000 (60%).
   - Available balance should have decreased by SDG 5,000.

---

## Regression Checks

- Mark a Cost Submission as paid **without** selecting a pre-fund → payment still completes, auto-link logic runs as before.
- Process a Down Payment **without** selecting a pre-fund → same, no regression.
- Pre-Funding page for a fund with **no transactions** → no breakdown section shown, page loads normally.
