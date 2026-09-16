---
name: MMP full-report scope performance
description: Prevent report row predicates from repeating expensive authorization work across every MMP site.
---

Once the report RPC has authorized a Full MMP report, its row-scope predicate must return immediately instead of repeating canonical Super Admin or role lookups for every site.

**Why:** Full reports can contain many sites. A database-backed identity check inside the per-row predicate multiplies authorization cost by the report size and can leave the UI waiting indefinitely.

**How to apply:** authorize once at the report RPC boundary; keep per-row scope work for State and Hub reports only. Add a bounded client timeout and Retry action so transient database stalls cannot create an endless spinner.