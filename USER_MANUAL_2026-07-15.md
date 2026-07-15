# User Manual — 2026-07-15
## Charge to Pre-Fund & Pre-Funding Category Breakdown

---

## What's New

Three improvements were added to the Finance module today:

1. **Charge a Cost Submission payment directly to a Pre-Fund** — when you mark a cost submission as paid, you can now choose which pre-fund the money comes from.
2. **Charge a Down Payment directly to a Pre-Fund** — same option when processing a single down payment.
3. **Category breakdown on the Pre-Funding details page** — the fund card now shows how much of the paid-out total went to Down Payments vs Cost Submissions.

---

## 1. Charging a Cost Submission to a Pre-Fund

### Who can do this
Finance Admin · Admin · Super Admin

### When to use it
When you are recording that a cost submission has been physically paid and the cash came from a specific pre-fund (petty cash or field fund).

### Steps

1. Go to **Finance → Cost Submissions** in the sidebar.
2. Find the submission you want to mark as paid (status must be **Approved**).
3. Click **Mark as Paid**.
4. The payment dialog opens. Fill in the receipt image as normal.
5. Scroll down to the **"Charge to Pre-Fund"** section.

   ![Charge to Pre-Fund selector]

6. Open the dropdown and pick the fund the cash came from.
   - Each option shows the fund name, currency, and how much is still available.
7. After selecting, a line appears below showing how much will remain in the fund after this payment.
   - If the amount **exceeds** the fund balance, the line turns red — you can still proceed, but it means the fund will go into deficit.
8. Add any payment notes (optional), then click **Confirm Payment**.

### What happens
- The submission is marked as **Paid**.
- The selected fund's **Available Balance** is reduced by the submission amount.
- The transaction is recorded under the fund's history with the source labelled "Cost Submissions".

### Skipping the pre-fund selector
If you leave the dropdown on "— No pre-fund —", the system will try to auto-detect a matching fund (existing behaviour). No change if no fund matches.

---

## 2. Charging a Down Payment to a Pre-Fund

### Who can do this
Finance Admin · Admin · Super Admin

### When to use it
When you process a single down payment and the cash is coming from a specific pre-fund.

### Steps

1. Go to **Finance → Down Payments** in the sidebar.
2. Go to the **Approved** tab and find the request you want to pay.
3. Click the **Pay** button on that row.
4. The **Process Payment** dialog opens.
5. Enter the payment amount and attach the receipt as normal.
6. Scroll down past the Notes field to the **"Charge to Pre-Fund"** section.
7. Pick the fund from the dropdown — same display as above (name · currency · available balance).
8. The balance preview updates as you change the amount.
9. Click **Confirm**.

### What happens
- The down payment is processed and a receipt is attached.
- The chosen fund's **Available Balance** is reduced by the payment amount.
- The transaction appears in the fund's history labelled as "Down Payments".

---

## 3. Viewing the Category Breakdown on a Pre-Fund

### Who can see this
Anyone who can access the Pre-Funding page.

### Where to find it

1. Go to **Finance → Pre-Funding** in the sidebar.
2. Click on any fund that has recorded payments (Paid Out > 0).
3. The fund detail card opens, showing the usual 4 KPI tiles:
   **Total Funded · Paid Out · Committed · Available**
4. Directly below those tiles, a new **"Paid-Out Breakdown"** section appears.

### What it shows

| Tile | Colour | Meaning |
|------|--------|---------|
| Down Payments | Blue | Total paid out for down payment requests |
| Cost Submissions | Violet | Total paid out for operational cost submissions |
| Other | Grey | Any payments not linked to either category (only shown if non-zero) |

Each tile also shows the **percentage** of the total paid-out that category represents.

### Example

A fund has paid out **SDG 50,000** total:
- Down Payments: **SDG 30,000** (60%)
- Cost Submissions: **SDG 20,000** (40%)

This helps you quickly see where the fund's money has gone without opening every transaction.

---

## Frequently Asked Questions

**Q: What if I select the wrong pre-fund by mistake?**
The transaction is already recorded once you confirm. Go to the Pre-Funding page, open the fund, find the transaction in the history, and delete it — the balance will be restored automatically.

**Q: Can I charge a batch payment (multiple down payments at once) to a pre-fund?**
Yes — the batch pay dialog already had this option before today's update. Select your payments, click **Batch Pay**, and choose the fund there.

**Q: The "Charge to Pre-Fund" section doesn't appear in the dialog.**
This means there are no funds currently in **Active** or **Low Balance** status. Either create a new pre-fund or top up an existing one.

**Q: The balance preview shows a red warning — should I still proceed?**
You can, but it means you are spending more than what is recorded in that fund. Either choose a different fund with sufficient balance, or top up the fund first.

**Q: Does skipping the pre-fund selector break anything?**
No. If you leave it on "— No pre-fund —", the system behaves exactly as it did before — it tries to auto-match a fund, and if none match, the payment is simply recorded without a fund link.
