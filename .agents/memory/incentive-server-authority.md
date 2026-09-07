---
name: Incentive server authority
description: Durable integrity rules for MMP bonus calculation, allocation, and settlement.
---

MMP incentive amounts, recipients, lifecycle eligibility, and settlement status must be calculated and enforced by database functions. Browser calculations are previews only and must never be accepted as authoritative payment input.

**Why:** Client-supplied totals and separate payment/status writes can be altered or interrupted, producing incorrect bonuses, duplicate credits, or payment records that disagree with wallet and payroll evidence.

**How to apply:** Lock the MMP/payment scope, calculate from canonical site/config/profile data, reject unresolved geographic assignments or unsupported roles, allocate integer remainders deterministically, and commit the settlement evidence and payment lifecycle in one transaction.