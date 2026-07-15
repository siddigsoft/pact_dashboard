# Runbook: HR Performance Reviews — 360° Enhancement

## Migration file
`supabase/migrations/20260715_hr_performance_360.sql`

## What it adds
| Object | Purpose |
|---|---|
| `performance_reviews.self_assessment_enabled` | Flag: employee must self-assess before manager can finalize |
| `performance_reviews.peer_feedback_enabled` | Flag: peer nominations and feedback are enabled |
| `performance_reviews.cycle_phase` | Current stage: `not_started` → `self_assessment` → `peer_feedback` → `manager_review` → `calibration` → `published` |
| `hr_review_self_assessments` | Employee's self-ratings per competency (jsonb) + comments |
| `hr_review_peer_nominations` | Peer nominations: reviewee nominates, admin approves, nominee submits feedback jsonb |
| `hr_review_calibration_adjustments` | Manager calibration overrides with reason |

## How to apply
1. Open Supabase SQL Editor for the PACT project.
2. Paste the entire migration file contents and execute.
3. Confirm via:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'performance_reviews'
   AND column_name IN ('self_assessment_enabled','peer_feedback_enabled','cycle_phase');

   SELECT table_name FROM information_schema.tables
   WHERE table_name IN (
     'hr_review_self_assessments',
     'hr_review_peer_nominations',
     'hr_review_calibration_adjustments'
   );
   ```

## RLS summary
| Table | Who can SELECT | Who can INSERT/UPDATE/DELETE |
|---|---|---|
| `hr_review_self_assessments` | Own rows OR HR/admin | Own rows (user_id = auth.uid()) OR HR/admin |
| `hr_review_peer_nominations` | reviewee OR nominee OR HR/admin | reviewee: INSERT; nominee: UPDATE; HR/admin: all |
| `hr_review_calibration_adjustments` | Own rows (user_id) OR HR/admin | HR/admin only |

## Phase flow
```
New review (self_assessment_enabled=true)  →  cycle_phase = 'self_assessment'
Employee submits self-assessment           →  cycle_phase = 'peer_feedback'  (if enabled)
                                               OR 'manager_review'           (if peer not enabled)
All peer feedback submitted / skipped      →  cycle_phase = 'manager_review'
Manager finalizes                          →  cycle_phase = 'calibration'    (if calibration step used)
                                               OR status = 'completed'        (direct publish)
Calibration saved                          →  cycle_phase = 'published' + status = 'completed'
```

## No scheduled jobs required
- All phase transitions are driven by user actions (button clicks) in the UI.
- The existing `hr-policy-reminder` edge function is unrelated.
