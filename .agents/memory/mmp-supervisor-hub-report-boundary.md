---
name: MMP supervisor hub report boundary
description: Security rule for limiting supervisor MMP visibility and reports to assigned hubs.
---

Supervisor MMP visibility must be enforced at the database and report-payload boundary using primary, secondary, and additional-role hub assignments. UI filtering and hidden report buttons are defense-in-depth only.

**Why:** MMPs can contain sites from several hubs, and client-side filtering can still expose other hubs through direct URLs, report reloads, coordinator performance, payments, costs, or exports. Conflicting state and hub values must fail closed rather than authorizing the row for multiple hubs.

**How to apply:** Any new MMP list, detail, report, PDF, Excel, finance, activity, or performance query used by supervisors must consume the same server-authorized hub scope. Keep Country Office and Port Sudan's intentional Red Sea overlap explicit.