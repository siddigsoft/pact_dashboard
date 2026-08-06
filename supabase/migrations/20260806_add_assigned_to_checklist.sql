-- Add per-item assignee to project stage checklist
-- This powers the "checklist item as task" feature: each item can be assigned
-- to any project team member, who then sees it in My Tasks.

ALTER TABLE public.project_stage_checklist
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_stage_checklist_assigned_to
  ON public.project_stage_checklist (assigned_to)
  WHERE assigned_to IS NOT NULL;
