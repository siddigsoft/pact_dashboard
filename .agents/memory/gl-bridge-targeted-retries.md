---
name: GL bridge targeted retries
description: Safety rules for retrying failed GL bridge postings from the Finance UI.
---

Retry actions must accept one unresolved GL bridge log record ID, validate it in
the database, and serialize work at the source-record level. The queue must list
each unresolved error record rather than grouping all entries from a source or
event.

**Why:** Existing bridge backfills are intentionally bulk operations. Grouping
errors by event can also conceal a failed installment when a later installment
succeeds, and unguarded retries can race and create misleading extra failures.

**How to apply:** Keep selection, authorization, stale-row checks, and locking
inside a SECURITY DEFINER RPC. A successful or obsolete retry resolves only the
selected error record; a failed retry keeps that record unresolved with its
current error message.