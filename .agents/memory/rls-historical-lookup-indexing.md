---
name: RLS-safe historical lookup indexes
description: PostgreSQL RLS can prevent an otherwise-correct expression index from serving receipt lookups.
---

Verify historical lookup index usage as a non-owner caller with RLS enabled, not just as the migration owner.

**Why:** An immutable JSON-to-array function with a GIN expression index still produced a sequential scan under saved-session RLS. Non-leakproof expression predicates cannot necessarily be pushed through the security boundary. Merely creating an index does not establish bounded historical lookup behavior.

**How to apply:** Prefer a normalized derived receipt projection with a plain indexed transaction-ID equality predicate, parent-derived RLS, and transactional trigger synchronization. Never mark arbitrary JSON extraction functions LEAKPROOF to force a plan. Include an authenticated EXPLAIN regression that proves the intended index remains usable.
