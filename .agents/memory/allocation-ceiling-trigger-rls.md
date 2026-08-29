---
name: Allocation ceiling trigger RLS
description: Why allocation parent-fund validation must not run under caller-visible RLS.
---

Parent-fund existence and allocation-ceiling validation inside a database trigger must run with definer rights and a fixed search path.

**Why:** A caller may be permitted to update an allocation while row-level security hides the parent fund from the trigger's own SELECT. Running as the caller then produces a false “allocation fund does not exist” error for a real fund.

**How to apply:** For integrity triggers that validate protected parent rows, use `SECURITY DEFINER`, `SET search_path = public`, and fully qualified relations. Keep UI stale-record checks too, but do not weaken the ceiling constraint.