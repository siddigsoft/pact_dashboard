---
name: SQL role normalization order
description: Prevents human-readable uppercase roles from being silently misclassified in PostgreSQL authorization checks.
---

Normalize role labels by applying `lower(...)` before removing non-letter characters: `regexp_replace(lower(coalesce(role, '')), '[^a-z]', '', 'g')`.

**Why:** Applying `lower` after `regexp_replace` removes uppercase letters first. For example, `Super Admin` becomes `uperdmin`, so a Super Admin can silently fall into a restricted scope.

**How to apply:** Use this ordering in every SQL role predicate or RPC that accepts human-readable profile or user-role labels, and test with labels containing spaces and capitals.