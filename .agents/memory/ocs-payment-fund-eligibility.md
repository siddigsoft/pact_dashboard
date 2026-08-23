---
name: Operational Cost payment fund eligibility
description: Pre-Fund eligibility rules for Cost Submissions versus Down Payments.
---

Operational Cost Submissions may use any active or low-balance Pre-Fund in the same currency with enough available balance. They do not consume or require a personal allocation. Down Payments remain allocation-bound.

**Why:** Cost Submissions are paid from the available program fund, while individual allocation reporting should not block Finance from recording a valid disbursement. The user explicitly chose this policy after allocation data prevented payment.

**How to apply:** For Cost Submissions, filter only by active/low-balance status, matching currency, and available fund balance; keep the submission owner as the ledger attribution. Scope the database allocation bypass to `operational_cost_submissions` so Down Payment allocation and spend rules stay unchanged.