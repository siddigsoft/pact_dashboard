-- Backfill audit_logs for mmp_site_entries from existing column data.
-- The site_entry_audit_trigger only fires on UPDATE and was added after many
-- sites were already dispatched/verified, so there are no historical rows.
-- This one-time backfill creates synthetic audit entries so the Site Audit
-- Trail UI shows a timeline for existing sites. New changes will be logged
-- by the trigger from now on.

-- Helper: insert one audit row per (entity_id, event_time) to avoid duplicates
-- when re-running. We use (entity_id, action, timestamp) as a loose uniqueness
-- check and only insert if no row exists for that site with same action and
-- same timestamp (within 1 second).

INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'site_dispatch',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  s.dispatched_by,
  COALESCE(NULLIF(TRIM(s.dispatched_by), ''), 'System'),
  'info',
  format('Site "%s": %s → %s', COALESCE(s.site_name, s.id::text), COALESCE(s.status, 'unknown'), 'Dispatched'),
  jsonb_build_object('status', NULL, 'dispatched_by', NULL),
  jsonb_build_object('status', s.status, 'dispatched_by', s.dispatched_by),
  jsonb_build_object(
    'dispatched_by', jsonb_build_object('from', NULL, 'to', s.dispatched_by),
    'dispatched_at', jsonb_build_object('from', NULL, 'to', s.dispatched_at::text)
  ),
  jsonb_build_object(
    'mmpFileId', s.mmp_file_id,
    'siteCode', s.site_code,
    'hub', s.hub_office,
    'state', s.state,
    'locality', s.locality,
    'backfill', true
  ),
  ARRAY['mmp', 'site', 'backfill', 'site_dispatch'],
  true,
  s.dispatched_at
FROM public.mmp_site_entries s
WHERE s.dispatched_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'site_dispatch'
      AND a.timestamp BETWEEN s.dispatched_at - interval '1 second'
                          AND s.dispatched_at + interval '1 second'
  );

INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'verify',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  s.verified_by,
  COALESCE(NULLIF(TRIM(s.verified_by), ''), 'System'),
  'info',
  format('Site "%s": verified', COALESCE(s.site_name, s.id::text)),
  jsonb_build_object('verified_by', NULL),
  jsonb_build_object('verified_by', s.verified_by),
  jsonb_build_object(
    'verified_by', jsonb_build_object('from', NULL, 'to', s.verified_by),
    'verified_at', jsonb_build_object('from', NULL, 'to', s.verified_at::text)
  ),
  jsonb_build_object(
    'mmpFileId', s.mmp_file_id,
    'siteCode', s.site_code,
    'backfill', true
  ),
  ARRAY['mmp', 'site', 'backfill', 'verify'],
  true,
  s.verified_at
FROM public.mmp_site_entries s
WHERE s.verified_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'verify'
      AND a.timestamp BETWEEN s.verified_at - interval '1 second'
                          AND s.verified_at + interval '1 second'
  );

INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'site_claim',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  s.accepted_by,
  COALESCE(NULLIF(TRIM(s.accepted_by), ''), 'System'),
  'info',
  format('Site "%s": claimed/accepted', COALESCE(s.site_name, s.id::text)),
  jsonb_build_object('accepted_by', NULL),
  jsonb_build_object('accepted_by', s.accepted_by),
  jsonb_build_object(
    'accepted_by', jsonb_build_object('from', NULL, 'to', s.accepted_by),
    'accepted_at', jsonb_build_object('from', NULL, 'to', s.accepted_at::text)
  ),
  jsonb_build_object(
    'mmpFileId', s.mmp_file_id,
    'backfill', true
  ),
  ARRAY['mmp', 'site', 'backfill', 'site_claim'],
  true,
  s.accepted_at
FROM public.mmp_site_entries s
WHERE s.accepted_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'site_claim'
      AND a.timestamp BETWEEN s.accepted_at - interval '1 second'
                          AND s.accepted_at + interval '1 second'
  );

INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'site_complete',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  s.visit_completed_by,
  COALESCE(p_c.full_name, p_c.email, p_c.username, s.visit_completed_by::text, 'System'),
  'info',
  format('Site "%s": visit completed', COALESCE(s.site_name, s.id::text)),
  jsonb_build_object('status', 'In Progress'),
  jsonb_build_object('status', s.status),
  jsonb_build_object(
    'visit_completed_at',
    jsonb_build_object('from', NULL, 'to', s.visit_completed_at::text)
  ),
  jsonb_build_object('mmpFileId', s.mmp_file_id, 'backfill', true),
  ARRAY['mmp', 'site', 'backfill', 'site_complete'],
  true,
  s.visit_completed_at
FROM public.mmp_site_entries s
LEFT JOIN public.profiles p_c ON p_c.id = s.visit_completed_by
WHERE s.visit_completed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'site_complete'
      AND a.timestamp BETWEEN s.visit_completed_at - interval '1 second'
                          AND s.visit_completed_at + interval '1 second'
  );

INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'reject',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  s.rejected_by,
  COALESCE(p_r.full_name, p_r.email, p_r.username, s.rejected_by::text, 'System'),
  'warning',
  format('Site "%s": rejected - %s', COALESCE(s.site_name, s.id::text),
    COALESCE(s.rejection_comments, 'No reason given')),
  jsonb_build_object('rejected_by', NULL),
  jsonb_build_object('rejected_by', s.rejected_by),
  jsonb_build_object(
    'rejection_comments', jsonb_build_object('to', s.rejection_comments),
    'rejected_at', jsonb_build_object('to', s.rejected_at::text)
  ),
  jsonb_build_object('mmpFileId', s.mmp_file_id, 'backfill', true),
  ARRAY['mmp', 'site', 'backfill', 'reject'],
  true,
  s.rejected_at
FROM public.mmp_site_entries s
LEFT JOIN public.profiles p_r ON p_r.id = s.rejected_by
WHERE s.rejected_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'reject'
      AND a.timestamp BETWEEN s.rejected_at - interval '1 second'
                          AND s.rejected_at + interval '1 second'
  );

-- Forwarded to coordinator (first time or re-forward after recall)
INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'forward_to_coordinator',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  s.forwarded_by_user_id,
  COALESCE(p_fb.full_name, p_fb.email, p_fb.username, s.forwarded_by_user_id::text, 'System'),
  'info',
  format('Site "%s": forwarded to coordinator', COALESCE(s.site_name, s.id::text)),
  jsonb_build_object('forwarded_to', NULL),
  jsonb_build_object('forwarded_to', s.forwarded_to_user_id),
  jsonb_build_object(
    'forwarded_to_user_id', jsonb_build_object('from', NULL, 'to', s.forwarded_to_user_id),
    'forwarded_at', jsonb_build_object('from', NULL, 'to', s.forwarded_at::text)
  ),
  jsonb_build_object(
    'mmpFileId', s.mmp_file_id,
    'forwarded_to_user_id', s.forwarded_to_user_id,
    'backfill', true
  ),
  ARRAY['mmp', 'site', 'backfill', 'forward_to_coordinator'],
  true,
  s.forwarded_at
FROM public.mmp_site_entries s
LEFT JOIN public.profiles p_fb ON p_fb.id = s.forwarded_by_user_id
WHERE s.forwarded_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'forward_to_coordinator'
      AND a.timestamp BETWEEN s.forwarded_at - interval '1 second'
                          AND s.forwarded_at + interval '1 second'
  );

-- Recalled: one row per entry in additional_data.recall_history (from_status, to_status, reason, recalled_at)
INSERT INTO public.audit_logs (
  module,
  action,
  entity_type,
  entity_id,
  entity_name,
  actor_id,
  actor_name,
  severity,
  description,
  previous_state,
  new_state,
  changes,
  metadata,
  tags,
  success,
  timestamp
)
SELECT
  'mmp',
  'site_recalled',
  'mmp_site_entry',
  s.id::text,
  COALESCE(s.site_name, s.id::text),
  rec->>'recalled_by',
  COALESCE(NULLIF(TRIM(rec->>'recalled_by_name'), ''), rec->>'recalled_by_email', rec->>'recalled_by', 'System'),
  'warning',
  format('Site "%s": recalled - %s', COALESCE(s.site_name, s.id::text), COALESCE(rec->>'reason', 'No reason given')),
  jsonb_build_object('status', rec->>'from_status'),
  jsonb_build_object('status', rec->>'to_status'),
  jsonb_build_object(
    'recall_history_entry',
    jsonb_build_object(
      'latest', rec,
      'count_after', 1
    )
  ),
  jsonb_build_object(
    'mmpFileId', s.mmp_file_id,
    'from_status', rec->>'from_status',
    'to_status', rec->>'to_status',
    'backfill', true
  ),
  ARRAY['mmp', 'site', 'backfill', 'site_recalled'],
  true,
  COALESCE(
    (rec->>'recalled_at')::timestamptz,
    s.updated_at
  )
FROM public.mmp_site_entries s,
     jsonb_array_elements(COALESCE((s.additional_data->'recall_history'), '[]'::jsonb)) AS rec
WHERE jsonb_typeof(COALESCE(s.additional_data->'recall_history', '[]'::jsonb)) = 'array'
  AND jsonb_array_length(COALESCE(s.additional_data->'recall_history', '[]'::jsonb)) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs a
    WHERE a.entity_type = 'mmp_site_entry'
      AND a.entity_id = s.id::text
      AND a.action = 'site_recalled'
      AND a.timestamp BETWEEN COALESCE((rec->>'recalled_at')::timestamptz, s.updated_at) - interval '1 second'
                          AND COALESCE((rec->>'recalled_at')::timestamptz, s.updated_at) + interval '1 second'
  );
