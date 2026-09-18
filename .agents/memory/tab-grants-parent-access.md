---
name: Tab grants require parent access
description: Access-control dependency and transaction rules for granting individual hub tabs.
---

An explicit user tab grant must create an active grant for the tab’s canonical parent page in the same authorized transaction. An active explicit parent block always wins, and clearing a tab override must not remove an independently useful parent grant.

**Why:** A tab override alone was shown as granted in the editor but remained unreachable because navigation and route guards correctly required parent-page access.

**How to apply:** Validate tab slugs against the canonical registry, derive mapped parents rather than splitting strings, protect Super Admin targets, reactivate expired overrides intentionally, and keep registry/runtime identifiers covered by tests.