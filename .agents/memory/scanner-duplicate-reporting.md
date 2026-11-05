---
name: Scanner duplicate reporting
description: User-required duplicate evidence and totals in bank transfer scanner exports.
---

Keep duplicate receipt rows in scanner exports, visibly highlighted, and provide totals including duplicates and counting each transaction once. Show duplicate counts and account/transaction breakdowns.

**Why:** The user needs to audit repeated receipts in exported files rather than lose the evidence through automatic removal.

**How to apply:** Identify duplicates by non-empty transaction ID, not account or amount alone. State the count-once policy and flag conflicting account/amount evidence for review; never silently treat missing IDs as the same transaction.
