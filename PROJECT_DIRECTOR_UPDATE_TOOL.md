# Project Director Update Tool — In-App Implementation Plan

**Status:** Design doc (pre-build)
**Goal:** Replace the external "Project Directors' Update Tool" Word document with a native module in the PACT Command Center that produces the *same* structured weekly/biweekly update, validated and published into the existing project dashboards, **reusing the infrastructure already in place** rather than building a parallel tracker.

The governing constraint from the source document is explicit and we honor it:

> "This tool is the single approved source for routine project implementation updates; it must not create or operate as a parallel tracker."

So the design principle is **derive-then-confirm**: every number the tool asks a Director to type by hand, we compute from data the app already holds, show it pre-filled, and let the Director confirm or override with a justification. The Director's job shrinks from *re-entering* to *reviewing and narrating*.

---

## 1. What the document is

A per-project, per-reporting-cycle report the Project Director completes weekly/biweekly. It has nine parts:

1. **Project Summary** — name, director, reporting period/cycle, location, current phase/stage, overall progress %, risk flag.
2. **Milestone Progress** — planned / completed / remaining / delayed / completion rate, each with an explanation.
3. **Implementation Progress Breakdown** — Completed % / In-progress % / Not-started % by approved activity weight (must sum to 100).
4. **Progress Over Time** — overall progress % per reporting week.
5. **Challenges & Support Needs** — main challenge, category, effect, support needed, responsible unit, action, deadline, follow-up status, resolution date.
6. **Open Actions** — a table of (action, responsible unit, deadline, status) + total.
7. **Risk Flag** — Green / Yellow / Orange / Red with variance-based thresholds.
8. **Director's Short Summary** — progress this period, main issue, immediate support.
9. **Governance** — who submits, validates, responds, escalates, and the change-control rule.

The final section maps every field to a "PACT Command Center Dashboard" item and describes the flow: **Director submits → Implementation & Management Dept validates → data feeds the project dashboard → surfaces in the Command Center → units are engaged → actions followed up until resolved.**

---

## 2. Mapping: tool field → existing infrastructure

This is the core of the plan. Legend: **Reuse** (already in the DB), **Derive** (compute from existing data), **New** (must be added).

| Tool field | Source | Where it lives today |
|---|---|---|
| Project name, code, location | Reuse | `projects.name / project_code / location` |
| Project Director | Reuse | `project_team_members` (role = director) / `projects.team` |
| Current phase / activity stage | Reuse | `projects.current_flow_stage` + flow engine (`project_flow_log`, `project_flow_stage_overrides`) |
| Overall progress % (weighted) | Derive | `project_field_tasks.percent_complete` × activity **weight** → see §4 |
| Overall status / risk flag | Derive + confirm | computed from progress variance + risks + overdue milestones → §4; Director may override |
| Total / completed / remaining / delayed milestones | Derive | `project_milestones.status / due_date` |
| Milestone completion rate | Derive | completed ÷ total × 100 |
| Implementation breakdown (Completed / In-progress / Not-started %) | Derive | `project_field_tasks.percent_complete` bucketed by weight → §4 |
| Progress over time | Derive | time series = the sequence of published updates (each stores overall %) → §3 (new table provides it) |
| Challenges & support needs, responsible unit, resolution date | Reuse | `project_risks` already has `category, status, owner_id, responsible_unit, due_date, resolution_date, mitigation_plan` |
| Open actions (action, unit, deadline, status) | **New (small)** | `project_update_actions` child table → §3 |
| Director's short summary, main challenge narrative | **New** | fields on the update row → §3 |
| Reporting period / cycle | **New (small)** | `projects.reporting_cadence` + cycle stamped on the update → §3, §7 |
| Validation / publish state | **New** | workflow columns on the update row → §5 |
| Dashboard consumption | Reuse | `ProjectWeeklyDashboard` (project) + `PortfolioDashboard` (org) → §6 |

**Takeaway:** ~70% is Reuse/Derive. The genuinely new surface area is one submission table, one small child table, one weight column, one cadence column, a derivation function, and the UI.

---

## 3. Data model (new)

Keep it minimal. One parent table (the snapshot), one child table (open actions). Everything else reuses existing tables.

### 3.1 `project_director_updates` — the submission

One row per project per reporting cycle. Stores derived snapshot values (frozen at submission for the time series), Director narrative, chosen risk flag, and workflow state.

```sql
create table public.project_director_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,

  -- reporting window (must match the Command Center calendar)
  reporting_period text not null,          -- e.g. '2026-W32' or 'Aug 2026 C2'
  cycle_start date not null,
  cycle_end date not null,

  -- SNAPSHOT (frozen derived values — see §4; source of the time series)
  stage_id text,                           -- confirmed current flow stage
  overall_progress numeric(5,2),           -- weighted %
  planned_progress numeric(5,2),           -- planned cumulative % at cycle_end (§4.4)
  milestones_total int, milestones_completed int,
  milestones_remaining int, milestones_delayed int,
  breakdown_completed numeric(5,2),        -- Σ weights @100%
  breakdown_in_progress numeric(5,2),      -- Σ weights >0 & <100
  breakdown_not_started numeric(5,2),      -- Σ weights @0

  -- OVERRIDES (Director may replace a derived value; requires a reason)
  overall_progress_override numeric(5,2),
  override_reason text,

  -- RISK FLAG (computed suggestion + Director's choice)
  risk_flag text check (risk_flag in ('green','yellow','orange','red')),
  risk_flag_suggested text,                -- what §4.4 computed
  risk_flag_reason text,

  -- CHALLENGE / SUPPORT (the single "main" block; the register lives in project_risks)
  main_challenge text,
  challenge_category text,                 -- Operations/Finance/ICT/Data/M&E/Field/Security/Management/Other
  challenge_effect text[],                 -- Timeline/Deliverable/Quality/Budget/Access/Team
  support_needed text,
  responsible_unit text,

  -- NARRATIVE
  summary_progress text,                   -- "main progress this period"
  summary_issue text,                      -- "main issue requiring follow-up"
  summary_support text,                    -- "immediate support needed"

  -- WORKFLOW (§5)
  status text not null default 'draft'
    check (status in ('draft','submitted','validated','returned')),
  submitted_by uuid, submitted_at timestamptz,
  validated_by uuid, validated_at timestamptz,   -- Implementation & Mgmt Dept
  returned_reason text,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (project_id, reporting_period)    -- one update per project per cycle
);

create index idx_pdu_project_cycle on public.project_director_updates (project_id, cycle_end desc);
create index idx_pdu_status on public.project_director_updates (status) where status in ('submitted','validated');
```

### 3.2 `project_update_actions` — the Open Actions table

```sql
create table public.project_update_actions (
  id uuid primary key default gen_random_uuid(),
  update_id uuid not null references public.project_director_updates(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  action_required text not null,
  responsible_unit text,
  deadline date,
  status text not null default 'pending'
    check (status in ('pending','in_progress','resolved','escalated')),
  resolution_date date,
  created_at timestamptz default now()
);
create index idx_pua_update on public.project_update_actions (update_id);
create index idx_pua_open on public.project_update_actions (project_id) where status in ('pending','in_progress','escalated');
```

### 3.3 Additive columns on existing tables

```sql
-- Activity weight for the weighted-progress formula (§4). NULL => equal weighting.
alter table public.project_field_tasks add column if not exists weight numeric(6,2);

-- Reporting cadence per project (drives the calendar + reminders, §7)
alter table public.projects add column if not exists reporting_cadence text default 'weekly'
  check (reporting_cadence in ('weekly','biweekly'));
```

**RLS:** mirror the existing project tables. Read = any authenticated project member; write draft = Director / project team; validate = Implementation & Management Dept role. Reuse the role checks already used by `project_risks` policies. Register both new tables in the `supabase_realtime` publication **only if** the validation queue needs live updates (otherwise poll — see the realtime-hygiene note in the codebase).

---

## 4. Derivation logic (the "derive-then-confirm" engine)

All of these are computed by **one RPC**, `get_project_progress_snapshot(p_project_id uuid, p_as_of date)`, returning a JSON blob the form pre-fills and the dashboards reuse. Formulas are taken verbatim from the document.

### 4.1 Overall progress (weighted)
```
overall_progress = Σ( weight_i × percent_complete_i ) ÷ Σ( weight_i )
```
over `project_field_tasks` for the project. `weight_i = COALESCE(weight, estimated_hours, 1)` so it works before weights are set (equal/hours-based fallback). The document's canonical form is `Σ[weight% × completion%] ÷ 100` with weights summing to 100; normalizing by `Σ weight` is equivalent and robust to un-normalized weights.

### 4.2 Milestones
```
total      = count(project_milestones)
completed  = count(status = 'completed')
delayed    = count(status <> 'completed' AND due_date < today)
remaining  = total − completed
rate       = completed ÷ total × 100        (count-based, equal weight)
```

### 4.3 Implementation breakdown (by weight, sums to 100)
```
completed_%   = Σ weight where percent_complete = 100
in_progress_% = Σ weight where 0 < percent_complete < 100
not_started_% = Σ weight where percent_complete = 0
```
normalized by `Σ weight`. Guaranteed to sum to 100 (single source of weights = §4.1).

### 4.4 Risk-flag suggestion (thresholds from §7 of the doc)
Requires **planned cumulative progress** at `cycle_end`. We don't store an S-curve today, so v1 derives a **linear planned baseline** from `projects.start_date → end_date` (planned % = elapsed ÷ duration). This is a documented approximation; a later phase can replace it with a milestone-weighted or manually-baselined curve.

```
variance = planned_progress − overall_progress     -- points behind plan
flag =
  red    if variance > 20  OR any milestone overdue > 3 cycles OR open 'critical' risk
  orange if variance 11–20 OR key deliverable delayed 2–3 cycles OR open 'high' risk
  yellow if variance 6–10  OR minor delay ≤ 1 cycle
  green  if variance ≤ 5   AND no overdue key deliverable AND no open high/critical risk
```
Uses `project_risks.impact/status` for the "high/critical unresolved issue" test and `project_milestones.due_date` for overdue deliverables. The Director sees the suggestion and **must confirm or override with a reason** (never silently overridden).

### 4.5 Progress over time
The published updates *are* the series: `select cycle_end, overall_progress from project_director_updates where project_id = ? and status = 'validated' order by cycle_end`. No separate snapshot table needed — the submission cadence provides the weekly points the document's Section 3 asks for.

---

## 5. Workflow & roles

Mirror the governance table in the document, reusing the existing notification + audit infrastructure (`dispatchNotification`, `audit_logs` trigger).

```
draft ──submit──▶ submitted ──validate──▶ validated (published to dashboards)
                       │
                       └──return (with reason)──▶ returned ──edit──▶ submitted
```

| Step | Owner (role) | Trigger |
|---|---|---|
| Complete & submit update | Project Director / project team | weekly/biweekly per `reporting_cadence` |
| Validate & publish | Projects Implementation & Management Dept | on each submission: completeness, formulas, evidence, risk flag |
| Respond to actions | Assigned responsible unit | by deadline; follow-up reviewed each cycle |
| Escalate | Implementation Dept / Management | **automatic** notification on Orange/Red flag, blocked delivery, or overdue critical action |

- **Only `validated` updates feed the dashboards** (drafts/submitted are invisible to the portfolio). This enforces the "validated data feeds the dashboard" rule.
- Reuse `audit_logs` (the `pact_audit_trigger_fn` already audits project tables) for the change history the governance section requires.
- Escalation on Orange/Red reuses the notification dispatch already in the app; **do not** reintroduce a client-side fan-out (see the digest-storm lesson) — trigger escalation server-side on `validated` with `risk_flag in ('orange','red')`.

---

## 6. Surfaces (UX / UI)

Register: **product** (the design serves the workflow, it is not the product). Scene sentence that fixes the theme: *"A project director at their desk mid-week, before a management check-in, reviewing their project and writing three honest sentences about where it stands."* That forces a **calm, light, form-first** interface, not a dark "ops" console.

Design commitments (product register + shared laws):
- **Color: restrained.** Tinted neutrals + the risk flag as the single semantic accent (green/yellow/orange/red used *only* for status, never decoration). No gradient text, no glassmorphism, no side-stripe cards.
- **The form is a guided single page, not a modal and not a wizard-for-wizard's-sake.** Sections mirror the document, each showing the **derived value pre-filled** with a quiet "computed from N activities" caption and an "override" affordance that reveals a reason field. This is the whole point: the Director confirms, doesn't retype.
- **Risk flag** is a four-segment selector showing the computed suggestion highlighted, with the threshold rationale inline and a required reason when the Director diverges.
- **Progress over time** is a small sparkline of validated updates, not a hero chart.
- Avoid the banned "hero-metric template" and "identical card grids" — group the summary as a compact definition list, not four glowing stat cards.

Three places it lives:

1. **ProjectDetail → new "Director Update" tab.** Shows the latest validated update (read view) + "Start this cycle's update" button. The submission form opens inline here. The existing `ProjectWeeklyDashboard` component already renders health ring, risks, and milestones — the published update *feeds* it (overall progress ring, risk flag chip, open-actions list) rather than duplicating it.
2. **Validation queue** (new page, Implementation & Management Dept): list of `submitted` updates with completeness checks, validate/return actions. Reuse the approvals-queue pattern already in the app (e.g. cost/down-payment approval panels).
3. **PortfolioDashboard** (existing): add a "latest Director update" per project — risk flag, weighted progress, open-action count, last reporting cycle. This delivers the document's "consolidated view of all projects … on track / need support / need escalation." The page already computes a `HealthSignal`; feed it from the latest validated update's `risk_flag`.

---

## 7. Reporting cycles & cadence

- `projects.reporting_cadence` (`weekly` | `biweekly`) drives the cycle windows and the reminder schedule.
- The `reporting_period` label and `cycle_start/end` on each update **must align to the Command Center calendar** (the document is emphatic about this). v1: derive cycles from cadence + a fixed week anchor (e.g. ISO week). A later phase can add an explicit reporting-calendar table if cycles need manual editing.
- **Reminders** reuse the existing cron + notification infrastructure (there is already a `daily-digest-cron` / pg_cron setup). Add a scheduled job that, at cycle open/close, notifies Directors with a draft due and the Implementation Dept with pending validations. Keep generation **server-side** (do not repeat the client-side digest-storm pattern).

---

## 8. Command Center integration (the document's Section: mapping table)

The document's "Dashboard Summary Fields (For IT Purposes)" is effectively the read contract. Each item maps 1:1 to a `project_director_updates` column or a derived value from §4, so the Command Center simply reads the **latest validated update** per project:

`project name, director, reporting period, location, overall %, milestones completed, active challenges, open actions, risk level, challenge identified, support needed, responsible unit, action required, deadline, follow-up status, resolution date` → all present on the update row / its child actions / joined project.

No parallel data path: the dashboards read the same rows the Director submitted and the Dept validated.

---

## 9. Phased delivery

**Phase 1 — Capture (MVP).** Migrations (§3), the `get_project_progress_snapshot` RPC (§4.1–4.3), the "Director Update" tab with the derive-then-confirm form, draft/submit, and a read view of the latest update on ProjectDetail. Value: Directors stop using the Word doc; data is captured natively.

**Phase 2 — Validate.** Workflow states (§5), the validation queue page, submit/validate/return notifications, audit trail. Value: the "single validated source" rule is enforced.

**Phase 3 — Consolidate.** Risk-flag suggestion + planned baseline (§4.4), progress-over-time sparkline, PortfolioDashboard latest-update strip, automatic Orange/Red escalation. Value: management gets the org-wide board the document promises.

**Phase 4 — Cadence & governance.** `reporting_cadence` calendar alignment, scheduled reminders (server-side), activity-weight editing UI, and a data-dictionary/version record for change control (the document requires joint IT + Implementation Dept approval for any field/formula/threshold change).

---

## 10. Decisions needed before build

1. **Activity weights** — do we let Directors set per-activity weights, or always derive from `estimated_hours`? (v1 falls back to hours/equal; a weights UI is Phase 4.)
2. **Planned-progress baseline** — accept the linear start→end approximation for the risk-flag variance in v1, or require a milestone-weighted planned curve from day one?
3. **Challenges vs. risk register** — confirm we reuse `project_risks` for the ongoing register and keep only the *single main challenge* narrative on the update. (Recommended: yes — avoids a parallel tracker.)
4. **Who is "Project Director"** — the source of truth for the director role (a `project_team_members` role, a `projects` field, or a profile role). Needed for RLS write + reminders.
5. **Cycle calendar** — derive cycles from cadence (v1) or add an editable reporting-calendar table now?

---

## Appendix A — Reused components/tables (do not rebuild)

- `projects`, `project_milestones`, `project_risks`, `project_field_tasks`, `project_flow_log`, `project_stage_checklist`, `project_team_members`
- `ProjectDetail` (tab host), `ProjectWeeklyDashboard` (health ring / risks / milestones), `PortfolioDashboard` (org roll-up), `ProjectMilestonesPanel`, `ProjectRisksPanel`
- `dispatchNotification`, `audit_logs` + `pact_audit_trigger_fn`, pg_cron + digest infrastructure (for reminders)

## Appendix B — New objects (the whole net-new footprint)

- Tables: `project_director_updates`, `project_update_actions`
- Columns: `project_field_tasks.weight`, `projects.reporting_cadence`
- Function: `get_project_progress_snapshot(project_id, as_of)`
- UI: "Director Update" tab + form, validation queue page, PortfolioDashboard latest-update strip
- Cron: cycle-open / validation-pending reminders (server-side)
