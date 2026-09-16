---
name: Action permission integrity
description: Rules for expanding Buttons & Actions without creating ineffective permissions or breaking established role access.
---

Every Role Management action must govern both the visible business control and its mutation handler. Do not add registry-only permissions that appear grantable but have no effect.

**Why:** Registry entries without enforcement create false security, while new checks without matching role defaults can silently lock existing users out of established workflows.

**How to apply:** Preserve explicit user deny precedence and Super Admin handling, retain existing ownership/state/scope restrictions, seed intended role defaults, and verify registry labels, controls, handlers, and defaults together.