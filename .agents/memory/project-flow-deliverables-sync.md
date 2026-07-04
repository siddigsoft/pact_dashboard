---
name: Project Overview deliverables checklist vs Stage checklist
description: How the "Required Deliverables" list (Overview tab) relates to the per-stage checklist gating stage advancement, and a schema gap discovered along the way.
---

The Overview tab's "Required Deliverables" list and the Stages tab's per-stage
checklist (which gates "Mark Complete & Advance") are now backed by the SAME
`project_stage_checklist` table, distinguished by a `source` column
(`'deliverable'` vs `'manual'`) and a `deliverable_id` column. Deliverable
definitions (`src/config/projectTypeConfig.ts`, keyed by `phase`) are mapped
to a stage id via `src/config/projectFlows.ts` (matching `phase` to a stage's
`label`). Rows are seeded lazily on first read per project (idempotent via a
unique index on `(project_id, deliverable_id)`).

**Why:** previously the Overview checklist wrote to a JSONB blob
(`projects.team.deliverablesState`) while the Stages tab read/wrote a
separate table — ticking deliverables never advanced the stage stepper. User
confirmed they wanted the two merged into one source of truth.

**How to apply:** when adding new deliverables or stages, no extra sync code
is needed — both UIs read the same table. If you need to add fields to stage
checklist items, update the migration and BOTH `useStageChecklist` and
`useProjectDeliverablesChecklist` in `src/hooks/useStageData.ts`.

**Schema gap discovered (still relevant):** `project_stage_checklist`,
`project_stage_assignees`, and `project_stage_attachments` are referenced by
already-shipped UI (`StageChecklist`, `StageAssignees`, `StageAttachments` in
`src/components/project/flow/`) but did NOT exist in the dev DB at all before
this fix — meaning those panels silently failed for everyone. Only
`project_stage_checklist` was created so far (this task). If assignees or
attachments panels are reported broken/empty, check whether those two tables
still need the same treatment. No RLS is used on these tables — this app
enforces authorization at the application layer for the project/flow feature
set, not via Postgres RLS (consistent with `project_flow_log`, which also has
RLS disabled).
