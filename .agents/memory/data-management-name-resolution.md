---
name: Data Management name resolution
description: Durable rules for resolving collector and MMP display names in large administrative datasets.
---

Administrative site tables must resolve claimant names from the effective-claimant overlay first, then canonical profile names, then preserved legacy human identifiers. MMP filters and columns must keep `mmp_file_id` as the relation key and resolve labels from the MMP context before RPC and direct-table fallbacks.

**Why:** The cached user directory is not guaranteed to contain every historical profile, and one unbatched lookup can truncate at production row counts. Missing MMP RPC rows previously produced generated UUID labels even when the context already knew the real name.

**How to apply:** Batch effective-claimant and profile lookups with bounded `.in()` requests, preserve narrow legacy JSON name projections, and query only unresolved MMP IDs without overwriting a higher-priority context label.