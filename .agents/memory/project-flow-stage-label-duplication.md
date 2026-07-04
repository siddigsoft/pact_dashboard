---
name: Project stage label/progress must use shared resolver, not raw flowDef
description: List/board/timeline/badge views computing a project's current stage label or % progress must honor customFlowStages (renames/skips), not read the static default flow directly.
---

Several summary views (project cards, kanban board, timeline, linked-project badges) independently recomputed "current stage label" and "% progress" by calling `getProjectFlow(project.projectType)` and indexing into its static `stages` array with `project.currentFlowStage`. This ignores `project.customFlowStages` (per-project renames via `customLabel` and skips), so a stage renamed in the Edit Flow dialog shows its stale default label — and progress % is wrong once any stage is skipped — everywhere except the Stages tab (`useProjectFlow.ts`, which has its own resolution logic).

**Why:** `useProjectFlow.ts`'s full resolution logic (admin overrides, parallel groups, self-healing pointer) is too heavy to run per-row in a project list. But the *lightweight* renamed/skipped-stage resolution (customLabel + skipped, no DB overrides) is cheap and was simply skipped by each view independently, causing silent drift across the app.

**How to apply:** Use `getEffectiveStages()` / `getProjectStageProgress()` from `src/config/projectFlows.ts` for any new component that shows a project's current stage name or stage progress from a `Project` object outside of the full `useProjectFlow` hook context. Do not re-derive it by hand from `getProjectFlow(...).stages`. Note: `LinkedProjectsBadge.tsx` still has this bug unresolved because its data comes from a Postgres RPC (`get_projects_linked_to_mmp/site_visit`) that doesn't return `customFlowStages` — fixing it requires a SQL migration to the RPC, out of scope for a pure frontend fix.
