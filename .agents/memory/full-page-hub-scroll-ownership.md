---
name: Full-page hub scroll ownership
description: Layout rule for hubs that fill the available application viewport.
---

Full-page hub layouts must be explicitly opted into at both the application shell and hub layout. Keep exactly one vertical content scroll owner; nested scrolling at the shell, hub content, and page root causes scroll chaining and broken sticky headers.

**Why:** Making Data Management full-page initially introduced three nested vertical scroll containers and unintentionally changed every hub.

**How to apply:** Scope shell padding/card removal to the intended route, expose an opt-in full-page hub mode, and let the hub content viewport own scrolling while child pages use `h-full min-h-0` without another `overflow-y-auto`.