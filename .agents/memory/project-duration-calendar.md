---
name: Project Duration & Calendar
description: MS-Project-style durations, checklist item scheduling, stage assignee work periods, and per-project working calendar.
---

## What was built

### DB schema (migration: `20260806_project_duration_calendar.sql`)
- `project_stage_checklist`: `planned_start date`, `planned_end date`
- `project_stage_assignees`: `start_date date`, `end_date date`
- `projects`: `working_days integer[] DEFAULT ARRAY[1,2,3,4,5]`, `calendar_exceptions jsonb DEFAULT '[]'`

**Working days integer encoding**: JS `Date.getDay()` — 0=Sun, 1=Mon … 6=Sat.

### New utility: `src/utils/workingDays.ts`
- `workingDaysBetween(start, end, workingDays, exceptions)` → number | null
- `calendarDaysBetween(start, end)` → number | null
- `addWorkingDays(start, days, workingDays, exceptions)` → ISO string
- `DEFAULT_WORKING_DAYS = [1,2,3,4,5]`
- `DAY_NAMES` array for UI day toggles

### New component: `src/components/project/ProjectCalendarDialog.tsx`
Dialog to configure per-project working days (Mon–Sun toggles) and holiday exceptions (add/remove date list). Saves to `projects` table directly. Calls `onSaved(wd, exc)` callback.

### Updated: `src/hooks/useStageData.ts`
- `StageChecklistItem` now has `plannedStart`, `plannedEnd`
- `StageAssignee` now has `startDate`, `endDate`
- `assignItem` accepts `plannedStart`/`plannedEnd` in ctx
- `addAssignee(userId, startDate, endDate)` — new signature

### Updated: `StageChecklist.tsx`
- New props: `stageStart`, `stageEnd`, `workingDays`, `calendarExceptions`
- Two-step assignment popover: pick person → set date range → confirm
- Duration badge per item (sky-blue "X wd") when dates are set

### Updated: `StageAssignees.tsx`
- New props: `stageStart`, `stageEnd`, `workingDays`, `calendarExceptions`
- Two-step popover: search → select person → step 2 date pickers → Assign
- Assignee chips show work period and "X wd" badge if dates are set

### Updated: `FlowTab.tsx`
- Imports `workingDaysBetween`, `ProjectCalendarDialog`
- Loads project calendar on mount via `useQuery(['project_calendar', projectId])`
- "Calendar" button in toolbar (next to Edit Flow) opens `ProjectCalendarDialog`
- Stage date row shows sky-blue "X wd" working-day duration badge
- Passes `stageStart`, `stageEnd`, `workingDays`, `calendarExceptions` to both StageAssignees and StageChecklist

## **Why the migration must be run manually**
`SUPABASE_ACCESS_TOKEN` was not available in this session. Run the SQL in `supabase/migrations/20260806_project_duration_calendar.sql` in Supabase Studio (SQL Editor) before using the new date fields — they are optional in the UI so the app won't break until then.
