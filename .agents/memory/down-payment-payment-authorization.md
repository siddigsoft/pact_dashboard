---
name: Down Payment payment authorization
description: Separates advance approval from actual disbursement through Pre-Funding.
---

Down Payment approval and payment are separate capabilities. Actual full, partial, complete, or batch payment requires both `down_payments:mark_paid` and `pre_funding:use_for_payment`.

**Why:** Approval permissions previously appeared grantable to non-finance users while payment buttons were hard-coded to Finance/Admin roles, making Role Management grants ineffective and conflating approval with disbursement.

**How to apply:** Keep pending approval states non-payable. Enforce the dual permission in controls, confirmation handlers, and the atomic database path while retaining positive remaining balance, fund, currency, receipt, lifecycle, and idempotency checks.