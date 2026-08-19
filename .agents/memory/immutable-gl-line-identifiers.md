---
name: Immutable GL line identifiers
description: How to include a generated parent journal UUID in immutable journal-line text.
---

When a GL line must show its final parent journal UUID, append it in a scoped
BEFORE INSERT trigger after the draft journal header exists. Do not attempt to
update posted or historical lines after their UUID is known.

**Why:** Journal lines are intentionally immutable after creation. Header UUIDs
do not exist while posting callers construct their initial line descriptions,
so a post-insert update conflicts with the accounting immutability guard.

**How to apply:** Scope the trigger to the applicable journal source type,
append a stable marker only when absent, and keep historical rows unchanged.
Validate both that the marker is added exactly once and that unrelated journal
sources are untouched.