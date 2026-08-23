---
name: Pre-Fund journal fiscal period
description: Ensuring Pre-Fund payment journals comply with the accounting period requirement.
---

Pre-Fund payment journal entries require an open or soft-closed fiscal period that covers the entry's posting date. If no matching period exists, the payment must fail atomically with a clear setup error.

**Why:** Production accounting journals require `period_id`, while a reduced local test schema previously omitted that constraint and allowed an invalid payment path to appear healthy.

**How to apply:** Resolve the period at the journal-entry boundary for Pre-Fund transaction sources before the NOT NULL check. Keep the lookup scoped to Pre-Fund journals, use the actual payment/posting date, and model the period constraint in ledger regression tests.