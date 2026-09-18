---
name: Claimed Sites server filtering
description: Pagination and filter consistency rules for large Data Management site datasets.
---

Claimed Sites must load bounded server-filtered pages, not download the entire dataset for browser filtering. Feed rows, totals, searches, status normalization, claimant precedence, and filter options must share one canonical SQL model.

**Why:** Client-side filtering loaded thousands of rows and delayed the page. Early server-pagination attempts produced stale pages, inconsistent options, former-claimant matches, and incorrect zero totals.

**How to apply:** Keep global and site searches separate, escape LIKE literals identically, compute one effective claimant key, count before pagination, return a monotonic server offset/cursor, invalidate stale requests, and build each option list with all active predicates except its own dimension.