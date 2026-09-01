/**
 * Column lists for mmp_site_entries queries.
 * Avoid select('*') on list/pagination paths — additional_data alone is ~75% of row size.
 */

/** Minimal fields for dashboard metrics / count-style transforms. */
export const MMP_SITE_ENTRY_METRIC_COLS =
  'id, site_code, site_name, status, state, locality, hub_office, visit_date, accepted_by, dispatched_at, created_at';

/**
 * List/browse columns without the heavy jsonb blob or long free-text notes.
 * Use for paginated tables that do not merge/write additional_data.
 */
export const MMP_SITE_ENTRY_LIST_COLS = [
  'id',
  'mmp_file_id',
  'site_code',
  'hub_office',
  'state',
  'locality',
  'site_name',
  'cp_name',
  'visit_type',
  'visit_date',
  'main_activity',
  'activity_at_site',
  'monitoring_by',
  'survey_tool',
  'use_market_diversion',
  'use_warehouse_monitoring',
  'status',
  'created_at',
  'updated_at',
  'cost',
  'enumerator_fee',
  'transport_fee',
  'verified_by',
  'verified_at',
  'dispatched_by',
  'dispatched_at',
  'accepted_by',
  'accepted_at',
  'claimed_by',
  'claimed_at',
  'verified_by_user_id',
  'completed_by_user_id',
  'forwarded_by_user_id',
  'forwarded_to_user_id',
  'forwarded_at',
  'cost_acknowledged',
  'cost_acknowledged_at',
  'cost_acknowledged_by',
  'rejected_by',
  'rejected_at',
  'registry_site_id',
  'visit_started_at',
  'visit_started_by',
  'visit_completed_at',
  'visit_completed_by',
  'tool_to_be_used',
  'not_covered_flag',
  'not_covered_at',
  'not_covered_by',
  'submitted_at',
  'wfp_confirmed_at',
  'wfp_rejected_at',
  'wfp_match_confidence',
  'status_changed_at',
  'status_changed_by',
  'status_change_source',
  'fee_paid_status',
  'fee_paid_amount',
  'fee_paid_at',
  'fee_paid_by',
  'fee_payment_method',
].join(', ');

/**
 * List columns plus additional_data — for rows that may be mutated in-place
 * (claim / start visit / fee edits) where additional_data must be preserved.
 */
export const MMP_SITE_ENTRY_DETAIL_COLS = `${MMP_SITE_ENTRY_LIST_COLS}, additional_data, comments, verification_notes, rejection_comments, not_covered_reason, not_covered_reason_other, wfp_rejection_reason, fee_payment_notes`;

/**
 * SiteVisitContext projection. It deliberately extracts only the JSON keys the
 * mapper consumes instead of transferring the entire additional_data document.
 */
export const MMP_SITE_ENTRY_CONTEXT_COLS = [
  MMP_SITE_ENTRY_LIST_COLS,
  'comments',
  'latitude:additional_data->latitude',
  'longitude:additional_data->longitude',
  'arrival_latitude:additional_data->arrival_latitude',
  'arrival_longitude:additional_data->arrival_longitude',
  'arrival_timestamp:additional_data->arrival_timestamp',
  'journey_path:additional_data->journey_path',
  'arrival_recorded:additional_data->arrival_recorded',
  'assigned_to:additional_data->assigned_to',
  'assigned_by:additional_data->assigned_by',
  'assigned_at:additional_data->assigned_at',
].join(', ');
