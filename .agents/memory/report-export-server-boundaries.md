---
name: Report export server boundaries
description: How to enforce unified export permissions without breaking shared report page data.
---

Require the matching `resource:export` permission at backend functions that actually generate files or signed export downloads. Do not add export authorization to RPCs that also load ordinary page data. Server assertions must preserve the UI's active, table-backed Super Admin bypass before evaluating individual overrides. An in-page report control must follow its action permission and secure report boundary; legacy page-role metadata must not cancel an explicit action grant.

**Why:** Many accounting, finance, and HR exports are assembled client-side from the same RPC or table data used to render pages. Gating those shared loaders with `export` would prevent users who can view a page but cannot download it from using the page at all.

**How to apply:** Inventory generation and re-download call sites before securing a report-like RPC. Gate dedicated CSV/PDF/ZIP payloads and signed export URLs with the caller's JWT before any service-role query, and block direct storage signing. Keep shared data loaders on normal read/scope authorization. If a report opens inside an already-authorized page, do not add a second static page-role condition to its button.