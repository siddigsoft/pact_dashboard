# Project and task workflow

## Activate the new controls

Run these files **in order**, manually in Supabase Studio:

1. `supabase/migrations/20261106090000_project_lifecycle_safety.sql`
2. `supabase/migrations/20261106091000_project_task_reviews_capacity.sql`
3. `supabase/migrations/20261106092000_project_period_reports.sql`
4. `supabase/migrations/20261106100000_project_review_queue.sql`

They require the existing project/task, permission and Recycle Bin schema. They do
not close, delete, reassign, or settle any existing business record. Reviewed tasks
are optional; existing tasks retain their normal workflow. Refresh after applying.

For automatic reports, deploy `supabase/functions/project-report-delivery` to the
same Supabase project and arrange a trusted POST invocation every five minutes.
Keep its service-role Authorization header server-side, in the scheduler's secure
configuration. Never expose it in browser code or paste it into documentation.
The worker reuses `dispatch-notification` and the existing notification schedules.
Its namespaced schedule status prevents a generic pending-notification poller from
consuming report jobs. Check **Reports → Weekly / monthly delivery**: a recent
worker heartbeat confirms polling, not inbox delivery. Test one report before
enabling wider delivery. Applying SQL or publishing the web app does not deploy
this Supabase function or configure its cron schedule.

## Daily work

1. Set up the project's existing **Team**, working calendar and responsibilities.
2. Open **Tasks → Add Task**. Set the title, main owner, co-assignees, dates and
   priority. Under Time, record each person's own allocation; unequal shares are
   supported. Do not enter the whole task effort separately for every assignee.
3. Keep simple tasks simple. Enable independent acceptance only when necessary,
   choose a different registered team member as reviewer, and describe the
   acceptance evidence. Done then means submitted; acceptance is separate.
4. Use existing **My Tasks**, list/board/timeline/Gantt and dependency controls.
   Existing dependency tracking remains informational; it is not a hard execution
   gate. Do not assume a predecessor automatically blocks a status change.
5. Use **Team Chat** for project coordination; task **Comments** for decisions,
   blockers and handover notes; task **Files** for evidence. Include the task
   reference and next responsible person. No separate chat or attachment system
   is introduced.
6. The named reviewer opens the task's Overview, records a decision and each
   person's actual contribution. Changes requested returns work to In Progress.
   Reviews cannot be rewritten. Editing a task invalidates its old acceptance.
   **My Tasks → Project work awaiting my acceptance** lists reviewer-only work,
   with bounded pages and direct links to the correct task. Accepted versions,
   archived projects and inaccessible projects are excluded.

## Workload and performance

- **Team → Team capacity by period** is management-only. It uses the project's
  working days/holidays, approved leave, personal daily-hour settings and active
  project-task allocations across projects. Other project names and leave
  reasons are not disclosed.
- Default working time is an explicit planning assumption of eight hours/day;
  change it for part-time members. Overload can exceed 100%. Undated, overdue,
  unallocated work and missing leave data are flagged, not assumed to be free time.
- Unestimated standalone personal tasks and external team members are outside
  that capacity calculation. A task count is not capacity or productivity.
- Compare timeliness, acceptance, rework, allocated/actual effort and the reviewer's
  individual contribution notes. Shared-task participation is not individual full
  credit. The system does not invent a performance score from task counts.

## Reports and delivery

Use the existing **Reports** section for saved period reports and existing
financial exports. A period report preserves task state **at capture time** plus
events and reviews actually recorded during the selected period. It is not an
as-of historical financial balance. Earlier periods have an explicit incomplete
history warning; there is no fabricated backfill. Saved reports are immutable and
can be exported to Excel by authorized users.

Choose weekly/monthly recurrence, timezone and current registered team recipients.
Repeated saves of the same cadence/recipients reuse the active schedule. Month-end
anchors and timezone transitions are respected. Stop a schedule from the same
section. The latest 20 schedules/delivery attempts are displayed there; saved
report history has pagination.

Financial summaries use the final applicable approval tier, not an intermediate
approval. Approved costs, advances and Pre-Fund disbursements stay separate and
are never added together as “Total Spent.” Costs/budget is a commitment comparison,
not a cash balance or proof of payment. Unknown source currencies are shown as
unverified, not assumed to match the project currency. Actual expenditure requires
reconciled accounting evidence. Excel period exports preserve the union of summary,
task and contribution columns so later-row details are not silently dropped.

“Dispatcher accepted” is not proof that an email reached an inbox. A failed or
unknown acknowledgement remains visible. Check in-app/email history before
retrying an uncertain delivery: remote delivery cannot be guaranteed exactly once.
Permissions and recipient membership are rechecked by the worker.

## Close, archive, reopen or remove

- **Close as completed:** all activities, deliverables, tasks and required reviews
  must be resolved. Applicable approval tiers must be resolved. Finance signs off
  against current source records and the project budget. This is a documented
  reconciliation, not an automatic claim that all accounting balances match.
  Financial changes invalidate clearance.
- **Finance clearance:** authorized Finance users can access it from Reports.
- **Retention archive:** use for suspended/abandoned projects with unfinished work.
  A reason is required; records remain, and completion is not claimed.
- **Reopen:** restricted to the existing Super Admin workflow.
- **Remove:** the server checks every direct foreign-key/project-ID link, including
  records hidden by child-table permissions. Populated projects cannot be deleted.
  An empty project's full header is saved atomically to the existing Recycle Bin.
  Type its exact name to confirm. The existing Recycle Bin retention applies.

No actual project should be deleted merely to test these controls.

## Verification and remaining environment checks

Local regression: `bash scripts/test-project-module.sh`; focused browser-component
and calculation tests are in the project lifecycle, task data/reporting, hook and
capacity test files. The SQL harness installs the real close/reopen and new
triggers against an isolated PostgreSQL database, not production.

Signed-in production UI, real mailbox delivery and actual Supabase cron are not
verified by these local tests. Flutter application source is absent from this
checkout; mobile parity must be checked against the original application source,
not recreated as a second app.
