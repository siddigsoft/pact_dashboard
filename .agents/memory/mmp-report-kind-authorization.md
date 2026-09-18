---
name: MMP report-kind authorization
description: Permission and data-scope boundary for full, state, and hub/coordinator MMP reports.
---

MMP report access is action-authoritative, not role-hardcoded: `mmp:full_report`, `mmp:state_report`, and `mmp:hub_report` independently control their matching launch, route, payload, and export paths.

**Why:** A Supervisor grant was ignored by a hard-coded role check, while a state report fetched extra financial rows outside its authorized scoped payload and could retain stale exportable data after access changed.

**How to apply:** Use the matching action everywhere, source financial rows only from the authoritative scoped report RPC, clear prior payloads before permission attempts, fail closed while loading, and export only the current successfully authorized context.