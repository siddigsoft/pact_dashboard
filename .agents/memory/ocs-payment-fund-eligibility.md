---
name: Shared Pre-Fund payment eligibility
description: Pre-Fund eligibility rules for Cost Submissions and Down Payments.
---

Operational Cost Submissions and Down Payments may use any active or low-balance Pre-Fund in the same currency with enough available balance. They do not consume or require a personal allocation.

**Why:** Payments are charged to the selected program fund. Personal allocation data is for reporting and must not block Finance from recording a valid disbursement or cause repeated batch failures.

**How to apply:** Filter payment funds by active/low-balance status, matching currency, and available fund balance. Keep the requester/submitter as ledger attribution, but do not require an allocation row, cap payment by personal remaining allocation, or increment allocation spend.

Payment authorization must require both the Cost Submission “Mark Paid” capability and the Pre-Funding “Use for Payment” capability. Load selector balances through a narrow guarded RPC rather than direct table reads, because PostgreSQL SELECT policies are additive.

**Why:** Approval, fund visibility, and fund debit authority are separate responsibilities; direct table policies cannot hide payment balances from users admitted by another permissive policy.