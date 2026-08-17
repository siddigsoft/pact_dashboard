---
name: Git push preference
description: User manages git pushes manually — agent should only commit locally, never push to origin.
---

**Rule:** Never run `git push` automatically. Only `git add` + `git commit` locally.
The user reviews commits and pushes to GitHub themselves.

**Why:** User explicitly stated this preference on 2026-08-17 after agent pushed directly without asking.

**How to apply:** After writing a migration or fixing code, commit with a clear message and stop. Tell the user "committed locally — push when ready."
