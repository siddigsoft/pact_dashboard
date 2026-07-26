# Runbook: Cost Submission Delete Request Workflow

## What This Migration Does
Adds 7 columns to `operational_cost_submissions` to support a delete-request workflow where:
- Any user can request deletion of a submission (with a reason)
- Admins / SuperAdmins / FinancialAdmins can approve or reject the request
- Notifications are sent automatically to the right people at each step

## SQL File
`supabase/migrations/cost_submission_delete_requests.sql`

## How to Apply
1. Open Supabase Dashboard → SQL Editor
2. Paste and run the contents of the migration file above
3. No data changes — only new nullable columns are added, existing rows are unaffected

## New Columns Added
| Column | Type | Purpose |
|---|---|---|
| `delete_requested_at` | timestamptz | When the request was submitted |
| `delete_requested_by` | uuid → profiles | Who requested deletion |
| `delete_request_reason` | text | Reason provided by the requester |
| `delete_request_status` | text (pending/approved/rejected) | Current state of the request |
| `delete_request_notes` | text | Admin feedback on rejection |
| `delete_request_reviewed_by` | uuid → profiles | Who approved/rejected |
| `delete_request_reviewed_at` | timestamptz | When the review happened |

## Behaviour After Migration

### For all users (FOM, CD, Supervisor, Coordinator, DataCollector, etc.)
- A **"Request Deletion"** button appears on any submission they can see
- They fill in a reason → request saved → admin notified instantly
- If their request is rejected, they see **"Request Again"** with the rejection feedback
- If pending, they see **"Deletion Pending"** (read-only)

### For Admin / SuperAdmin
- Still have the direct **"Delete"** button (no approval needed)
- Also see **"Approve Delete" / "Reject"** buttons on submissions with pending requests

### For FinancialAdmin
- No direct delete button
- See **"Approve Delete" / "Reject"** buttons on pending requests

### Notifications
| Event | Who gets notified |
|---|---|
| Delete request submitted | All Admin / SuperAdmin / FinancialAdmin |
| Request approved | The original requester (in-app + email) |
| Request rejected | The original requester with feedback (in-app + email) |
