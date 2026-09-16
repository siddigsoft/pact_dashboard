---
name: Filter visibility controls
description: Safety and precedence rules for Role Management control of optional page filters.
---

Filter visibility is presentation-only. A hidden optional filter must immediately reset its owned state to a neutral value, including dependent and saved-preset values.

**Why:** Merely hiding a control can leave an invisible active filter narrowing results, while treating filter visibility as authorization can weaken or confuse the real Data Scope and server boundaries.

**How to apply:** Use explicit user override first, then deterministic multi-role defaults. Keep Data Scope, RLS, RPC predicates, mandatory scope filters, and export authorization unchanged.