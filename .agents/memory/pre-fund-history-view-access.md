---
name: Pre-Fund history view access
description: Why complete payment history needs controlled definer access for authenticated Finance/Admin browser reads.
---

Complete Pre-Fund source-payment history must be exposed through a role-gated definer boundary, not a security-invoker view that depends on browser access to the immutable ledger.

**Why:** SQL Editor runs with elevated database rights and can show correct payment events while the same security-invoker view returns zero rows to an authenticated browser. The UI then falsely reports that fully paid requests have no linked Pre-Fund.

**How to apply:** Keep direct ledger writes and broad table reads unavailable to browser users. Expose the narrow history projection through a definer view or RPC that checks the caller's Finance/Admin role, and test it as an authenticated application user rather than only in SQL Editor.