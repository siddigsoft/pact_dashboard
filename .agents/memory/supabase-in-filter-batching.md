---
name: Supabase IN-filter batching
description: Avoid browser request failures when loading payment links for large source lists.
---

Large PostgREST `.in()` queries over hundreds of UUIDs can exceed the browser or gateway request URL limit and surface only as `TypeError: Failed to fetch`.

**Why:** Payment-link hydration loads both canonical ledger records and historic source-side back-links. Batching only one of those requests still leaves the other path able to fail and makes a filter look like it has no matching payments.

**How to apply:** When a UI loads related records for a large list of UUIDs, split every `.in()` lookup in that chain into small, consistent batches and combine the results before filtering or aggregating.