---
name: Reconciliation filter load atomicity
description: Prevent review filters from treating unfinished metadata as unassigned or showing an earlier fund after a rapid switch.
---

When a reconciliation filter depends on source metadata, keep rows unavailable until that metadata is complete, and version asynchronous fund loads so stale responses cannot publish state.

**Why:** Missing State/MMP metadata during a load is unknown, not an intentional "unassigned" value. Treating it as unassigned can expose rows to filter-scoped bulk actions. Independent asynchronous loads can also finish out of order and overwrite the currently selected fund.

**How to apply:** Clear the previous ledger and metadata at the start of a fund load, build all metadata locally, then publish the transaction rows and metadata together only if the load token is still current. Gate stale errors and loading cleanup with the same token.