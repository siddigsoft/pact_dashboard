---
name: Verify bug-audit findings against real code before fixing
description: When working from a subagent- or list-generated set of "bugs" across a hub/module, re-read the actual current code for each claim first — several are typically already-safe false positives.
---

When auditing a large surface (e.g. an entire HR hub with 10+ panels) using a pre-generated list of suspected bugs, treat each item as a hypothesis, not a confirmed defect.

**Why:** In one HR-hub audit, roughly a third of flagged items (payroll exchange-rate guard, EOSB salary override fallback, HRBroadcast null-exclusion logic) turned out to already have correct guard/fallback logic in place — the claims were stale or based on a misreading of the code. Fixing non-existent bugs wastes effort and risks introducing regressions into working code.

**How to apply:**
- For each claimed bug, grep/read the actual current implementation before touching it.
- Only apply a fix once you've confirmed the unsafe path is real (e.g. by tracing the exact null/undefined value through to where it's used unguarded).
- If a claim doesn't hold up, explicitly note it as a false positive (no fix needed) rather than silently skipping it, so it's clear it was checked.
