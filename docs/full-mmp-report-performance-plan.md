# Full MMP Report Performance Plan

## Objective

Reduce the time between clicking **Full Report** and seeing usable report information while preserving:

- Existing report data and totals
- Full, State, and Hub report permissions
- Server-side scope enforcement
- Excel and PDF exports
- Financial and audit information

## Current Architecture

The report dialog makes one secure database call:

```ts
supabase.rpc('get_mmp_report_payload', {
  p_mmp_id: mmpId,
  p_report_kind: reportKind,
});
```

The database function:

1. Confirms the user is authenticated.
2. Checks the requested report permission.
3. Calculates the user's authorized MMP scope.
4. Loads the MMP and project information.
5. Loads all authorized MMP site entries.
6. Resolves assigned staff names.
7. Loads connected Down-Payment requests.
8. Loads connected Cost Submissions.
9. Loads recent MMP audit activity.
10. Returns one JSON payload.

This design correctly prevents the browser from deciding which records a user may access. The primary drawback is that the dialog waits for every section before displaying the report.

---

## Phase 1 — Optimize Database Lookups

### 1. Index MMP site entries

The largest report query filters by `mmp_file_id` and orders by `created_at` and `id`.

```sql
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_report_payload
  ON public.mmp_site_entries (mmp_file_id, created_at, id);
```

### 2. Index Cost Submissions by MMP

Cost Submissions can reference an MMP through either `mmp_file_id` or `mmp_id`.

```sql
CREATE INDEX IF NOT EXISTS idx_operational_cost_submissions_mmp_id_created
  ON public.operational_cost_submissions (mmp_id, created_at DESC);
```

### 3. Index Down-Payment activity

```sql
CREATE INDEX IF NOT EXISTS idx_down_payment_requests_mmp_entry_created
  ON public.down_payment_requests (mmp_site_entry_id, created_at DESC);
```

### 4. Refresh database statistics

```sql
ANALYZE public.mmp_site_entries;
ANALYZE public.operational_cost_submissions;
ANALYZE public.down_payment_requests;
```

### Status

This phase is implemented in:

```text
supabase/migrations/20260917270000_speed_up_full_mmp_report.sql
```

The migration must be applied to the production Supabase database before production receives the improvement.

---

## Phase 2 — Measure the Production Query

After applying the indexes, measure a large production MMP and record:

- Total database execution time
- Number of MMP site entries
- Number of Down-Payment records
- Number of Cost Submissions
- Returned JSON payload size
- Network download time
- Browser rendering time

Inspect the site-entry query:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM public.mmp_site_entries
WHERE mmp_file_id = '<MMP UUID>'
ORDER BY created_at, id;
```

The expected execution plan should use:

```text
idx_mmp_site_entries_report_payload
```

Inspect the Cost Submission query:

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT *
FROM public.operational_cost_submissions
WHERE mmp_file_id = '<MMP UUID>'
   OR mmp_id = '<MMP UUID>'
ORDER BY created_at DESC;
```

Use the measurements to determine whether the remaining delay is caused by database execution, JSON generation, network transfer, or browser rendering.

---

## Phase 3 — Return the Overview First

Split loading into two independently authorized server requests.

### Initial report request

Load only the information needed to display the report overview:

- MMP information
- Project name
- Authorized MMP site entries
- Staff-name map
- Effective report scope

This allows the report to display:

- Summary cards
- State statistics
- Hub statistics
- Site progress
- Status breakdown

### Background financial request

After the overview appears, load:

- Down-Payment requests
- Cost Submissions
- Audit activity

Show loading indicators only inside the Finance and Activity sections.

### Security requirement

Both server requests must independently enforce:

- Authentication
- The requested MMP report permission
- Organization, state, or hub scope
- Super Admin rules

The browser must never be responsible for removing unauthorized rows.

---

## Phase 4 — Reduce the Response Size

The current report uses broad conversions such as:

```sql
to_jsonb(e)
to_jsonb(dp)
to_jsonb(cs)
```

These conversions return every database column. Replace them with explicit response contracts after auditing all report and export consumers.

### MMP site-entry fields

Retain fields needed for:

- Site identity
- State, locality, and hub
- Status and progress
- Enumerator, transport, and other costs
- Assignment and forwarding
- WFP confirmation
- Archive and restoration history
- Report metadata

### Down-Payment fields

Retain:

- Request and site-entry IDs
- Site, hub, and state
- Requested, approved, paid, and remaining amounts
- Request and approval statuses
- Payment type
- Reconciliation status
- Creation and payment dates

### Cost Submission fields

Retain:

- Submission ID
- Request title
- Expense category
- Amount
- Status and approval statuses
- Creation date
- MMP relationship fields

Before removing any field, verify the requirements of:

- On-screen report tabs
- Excel export
- PDF export
- Financial summaries
- Audit and activity views

---

## Phase 5 — Eliminate Repeated Server Work

### Profile-name lookup

Collect all relevant user IDs while loading site entries, then perform one indexed lookup against `profiles`. Avoid rescanning the site-entry table separately for each staff relationship.

### State and Hub authorization

The Full Report already avoids repeating a Super Admin lookup for every site.

Apply the same approach to State and Hub reports:

1. Authenticate once at the RPC boundary.
2. Calculate the authorized scope once.
3. Pass the prepared scope into row filtering.
4. Compare entries against that scope.
5. Do not query role or permission tables for each entry.

All authorization must remain server-side.

---

## Phase 6 — Improve Browser Rendering

### Render only the active tab

Do not build every report section while the Overview tab is selected.

- Render Overview only when Overview is active.
- Render the site table only when its tab is active.
- Render financial tables only when Finance is active.
- Render audit logs only when Activity is active.

### Virtualize large tables

If an MMP contains hundreds or thousands of sites, render only the visible rows and a small buffer.

### Defer expensive calculations

Calculate Finance and Activity statistics only when those sections are opened. Keep core overview calculations memoized and recompute them only when the site-entry payload changes.

---

## Phase 7 — Add Short-Lived Report Caching

Cache report results by:

- User ID
- MMP ID
- Report kind
- Effective scope

Recommended duration:

```text
30–60 seconds
```

This makes closing and reopening the same report nearly immediate.

Invalidate the cache after:

- Site-status changes
- Assignment or forwarding changes
- Archive or restoration
- Connected Down-Payment changes
- Connected Cost Submission changes
- Payments or financial corrections
- An explicit report refresh

Never share a scoped cache entry between users.

---

## Phase 8 — Improve Loading Feedback

Replace the blank loading area with a structured skeleton:

- Display the report header immediately.
- Show placeholders for summary cards.
- Show “Loading MMP sites…” for the core request.
- Show “Loading financial details…” only in Finance.
- Show “Loading activity…” only in Activity.

For long requests:

- After approximately 10 seconds, explain that the MMP contains many records.
- Keep the report dialog open if loading fails.
- Provide a Retry button.
- Preserve the selected MMP and report kind during retry.

---

## Phase 9 — Verify Security and Correctness

Test separately as:

- Super Admin opening Full Report
- User explicitly granted Full Report
- Country Director or state-scoped user
- Supervisor with Hub Report only
- User without report permission

Verify:

- Full Reports include all authorized sites.
- State Reports include only authorized states.
- Hub Reports include only authorized hubs.
- Financial totals remain unchanged.
- Excel and PDF exports match the report.
- Archived and restored sites remain correct.
- Direct RPC calls cannot bypass report scope.

---

## Phase 10 — Performance Targets

### Warm load

- Dialog appears immediately.
- Overview becomes usable within 2 seconds.
- Finance details load within 3–5 seconds.

### Cold load for a large MMP

- Overview becomes usable within 5 seconds.
- Other sections load progressively.
- The browser remains responsive.
- The user does not wait for one blank full-report spinner.

### Reopening the same report

- Under 1 second while the short-lived cache is valid.

---

## Recommended Implementation Order

1. Apply the completed index migration.
2. Measure a large production report.
3. Identify whether the remaining delay is database, payload, network, or rendering.
4. Split overview loading from Finance and Activity.
5. Reduce the JSON response to required fields.
6. Render only the selected report tab.
7. Add table virtualization if large site lists remain slow.
8. Add short-lived, user-scoped caching.
9. Test Full, State, and Hub authorization.
10. Compare all totals and exports before release.

This order applies low-risk improvements first and preserves the existing security boundary throughout the work.