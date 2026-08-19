---
name: Database trigger integration tests
description: How to avoid false confidence when an RPC mutates rows that fire dependent database triggers.
---

When testing a database RPC that updates a trigger-bearing table, install and execute the real dependent trigger function in the integration harness. Stub only the terminal external or infrastructure boundary, such as the central journal poster.

**Why:** A function-only harness once passed even though the real dependent trigger would have raised an error and rolled back the transaction.

**How to apply:** Use a transaction-scoped test, attach the real trigger, replace only the terminal service with a recording double, assert both the expected primary call and the absence of duplicate trigger calls, then roll back to restore the real function.