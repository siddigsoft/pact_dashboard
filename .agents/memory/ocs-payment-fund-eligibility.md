---
name: Operational Cost payment fund eligibility
description: Preventing Cost Submission payment dialogs from offering funds the submission cannot charge.
---

When recording an Operational Cost payment, eligible Pre-Funds must be determined by the submission owner’s allocation and payment currency, not by the Finance/Admin operator. Allocation-free shared funds are also eligible.

**Why:** An Admin can process payment for another person but does not transfer their own fund allocation to that request. Offering the wrong fund leads to a server-side allocation rejection after receipt upload.

**How to apply:** Exclude funds allocated to other people, zero-remaining allocations, and malformed duplicate submitter allocations. Before uploading proof, validate the requested amount against the selected fund balance and the submitter’s remaining allocation; preserve the database guard for races.