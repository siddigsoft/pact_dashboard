---
name: Down-Payment balance authority
description: Canonical status, payment-evidence, and remaining-balance rules for Down-Payment reporting.
---

Every Down-Payment card, tab, grouped view, regular export, and bulk export must use one canonical status and per-request balance policy. Legacy settled statuses (`paid`, `reconciled`, `completed`, and `closed`) belong with completed payments; the Closed UI bucket means rejected or cancelled requests.

**Why:** Independent status lists caused cards, tabs, and exports to disagree even when each local calculation appeared reasonable.

**How to apply:** Approved financial lifecycle includes approved, partially paid, and all settled statuses. Rejected, cancelled, and deleted rows retain historical visibility but contribute zero approved, paid, and remaining financial amounts.

Cumulative `total_paid_amount` is authoritative for the financial Paid total because it includes both “Paid — Waiting Confirmation” and “Confirmed” payments. Immutable links remain authoritative for fund attribution and are a fallback when the source total is empty.

**Why:** Confirmation is a workflow subdivision, not a financial exclusion. Counting only confirmed immutable links understated Paid and overstated Remaining.

**How to apply:** Calculate remaining per request as `max(approved - total_paid_amount, 0)` and then sum. Use active immutable links only when the source total is empty.

Site completion/coverage is a separate dimension from the Down-Payment request/payment status and must be reported separately.

**Why:** An approved or fully-paid advance does not prove that the linked field site was completed or WFP-confirmed.

**How to apply:** Detailed and grouped reports should show both statuses: the request lifecycle (pending, approved, partially paid, settled, etc.) and the linked site’s current system status/coverage classification.

Tracker geography must prefer the linked MMP site’s state, locality, and hub over copied request fields.

**Why:** Request-level hub values can become stale and caused Hub filters to return fewer rows than State + MMP filters for the same sites.

**How to apply:** Use `mmp_site_entries` geography for Hub/State/Locality/MMP filters and report grouping; use request geography only when no linked site value exists.