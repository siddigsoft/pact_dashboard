-- One-time backfill: fix missed add-on fee multipliers (MDM/WHM/PDM) on already completed visits.
-- This migration does NOT create wallet adjustment transactions.
-- It backfills:
--   1) reports.total_visit_fees (when missing)
--   2) mmp_site_entries enumerator_fee/cost + additional_data fee metadata

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Backfill reports.total_visit_fees if missing (NULL/0) from activity_details
-- ---------------------------------------------------------------------------
WITH computed_totals AS (
  SELECT
    r.id,
    GREATEST(
      COALESCE(
        (
          SELECT SUM(
            GREATEST(
              COALESCE(NULLIF(entry.value ->> 'site_visits', '')::INT, 1),
              1
            )
          )
          FROM jsonb_each(COALESCE(r.activity_details, '{}'::jsonb)) AS entry
        ),
        1
      ),
      1
    ) AS total_visit_fees
  FROM reports r
  WHERE COALESCE(r.total_visit_fees, 0) <= 0
)
UPDATE reports r
SET
  total_visit_fees = c.total_visit_fees
FROM computed_totals c
WHERE r.id = c.id;

-- ---------------------------------------------------------------------------
-- 2) Backfill mmp_site_entries fee columns for add-on multipliers > 1
--    Safety guard: only rows not previously marked as fee_adjusted_for_addon_activities
-- ---------------------------------------------------------------------------
WITH latest_report_per_site AS (
  SELECT DISTINCT ON (r.site_visit_id)
    r.site_visit_id,
    r.id AS report_id,
    GREATEST(COALESCE(r.total_visit_fees, 1), 1) AS fee_multiplier,
    r.submitted_at
  FROM reports r
  WHERE r.site_visit_id IS NOT NULL
  ORDER BY
    r.site_visit_id,
    r.submitted_at DESC NULLS LAST,
    r.id DESC
),
targets AS (
  SELECT
    m.id AS site_id,
    m.enumerator_fee AS current_enumerator_fee,
    COALESCE(m.transport_fee, 0) AS transport_fee,
    COALESCE(m.additional_data, '{}'::jsonb) AS additional_data,
    lr.report_id,
    lr.fee_multiplier
  FROM mmp_site_entries m
  INNER JOIN latest_report_per_site lr
    ON lr.site_visit_id = m.id
  WHERE
    lr.fee_multiplier > 1
    AND m.enumerator_fee IS NOT NULL
    AND COALESCE((m.additional_data ->> 'fee_adjusted_for_addon_activities')::BOOLEAN, FALSE) = FALSE
),
prepared_updates AS (
  SELECT
    t.site_id,
    t.report_id,
    t.fee_multiplier,
    t.current_enumerator_fee AS base_enumerator_fee,
    (t.current_enumerator_fee * t.fee_multiplier)::NUMERIC AS adjusted_enumerator_fee,
    ((t.current_enumerator_fee * t.fee_multiplier) + t.transport_fee)::NUMERIC AS adjusted_total_cost,
    t.additional_data || jsonb_build_object(
      'base_enumerator_fee', t.current_enumerator_fee,
      'adjusted_enumerator_fee', (t.current_enumerator_fee * t.fee_multiplier),
      'total_visit_fees', t.fee_multiplier,
      'fee_multiplier', t.fee_multiplier,
      'fee_adjusted_for_addon_activities', TRUE,
      'fee_backfilled_at', NOW()::TEXT,
      'fee_backfill_source', '20260304_backfill_addon_activity_fees',
      'fee_backfill_report_id', t.report_id
    ) AS merged_additional_data
  FROM targets t
)
UPDATE mmp_site_entries m
SET
  enumerator_fee = u.adjusted_enumerator_fee,
  cost = u.adjusted_total_cost,
  additional_data = u.merged_additional_data,
  updated_at = NOW()
FROM prepared_updates u
WHERE m.id = u.site_id;

COMMIT;
