-- Migration: Site Entry Audit Trigger
-- Automatically logs every meaningful change to mmp_site_entries into audit_logs.
-- Tracks both top-level columns AND important sub-fields inside additional_data
-- (cp_verification, permit decisions, assignment, recall history, approved_and_costed, etc.).

CREATE OR REPLACE FUNCTION public.log_site_entry_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changes    jsonb := '{}'::jsonb;
  v_actor_id   text;
  v_actor_name text;
  v_action     text;
  v_old_ad     jsonb;
  v_new_ad     jsonb;
BEGIN
  -- Parse additional_data safely (it is stored as text in some rows, jsonb in others)
  v_old_ad := CASE
    WHEN OLD.additional_data IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(OLD.additional_data) IS NOT NULL THEN OLD.additional_data
    ELSE '{}'::jsonb
  END;
  v_new_ad := CASE
    WHEN NEW.additional_data IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(NEW.additional_data) IS NOT NULL THEN NEW.additional_data
    ELSE '{}'::jsonb
  END;

  -- =========================================================================
  -- TOP-LEVEL COLUMN CHANGES
  -- =========================================================================

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_changes := v_changes || jsonb_build_object('status',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  IF OLD.forwarded_to_user_id IS DISTINCT FROM NEW.forwarded_to_user_id THEN
    v_changes := v_changes || jsonb_build_object('forwarded_to_user_id',
      jsonb_build_object('from', OLD.forwarded_to_user_id, 'to', NEW.forwarded_to_user_id));
  END IF;

  IF OLD.forwarded_by_user_id IS DISTINCT FROM NEW.forwarded_by_user_id THEN
    v_changes := v_changes || jsonb_build_object('forwarded_by_user_id',
      jsonb_build_object('from', OLD.forwarded_by_user_id, 'to', NEW.forwarded_by_user_id));
  END IF;

  IF OLD.forwarded_at IS DISTINCT FROM NEW.forwarded_at THEN
    v_changes := v_changes || jsonb_build_object('forwarded_at',
      jsonb_build_object('from', OLD.forwarded_at, 'to', NEW.forwarded_at));
  END IF;

  IF OLD.dispatched_by IS DISTINCT FROM NEW.dispatched_by THEN
    v_changes := v_changes || jsonb_build_object('dispatched_by',
      jsonb_build_object('from', OLD.dispatched_by, 'to', NEW.dispatched_by));
  END IF;

  IF OLD.dispatched_at IS DISTINCT FROM NEW.dispatched_at THEN
    v_changes := v_changes || jsonb_build_object('dispatched_at',
      jsonb_build_object('from', OLD.dispatched_at, 'to', NEW.dispatched_at));
  END IF;

  IF OLD.accepted_by IS DISTINCT FROM NEW.accepted_by THEN
    v_changes := v_changes || jsonb_build_object('accepted_by',
      jsonb_build_object('from', OLD.accepted_by, 'to', NEW.accepted_by));
  END IF;

  IF OLD.accepted_at IS DISTINCT FROM NEW.accepted_at THEN
    v_changes := v_changes || jsonb_build_object('accepted_at',
      jsonb_build_object('from', OLD.accepted_at, 'to', NEW.accepted_at));
  END IF;

  IF OLD.verified_by IS DISTINCT FROM NEW.verified_by THEN
    v_changes := v_changes || jsonb_build_object('verified_by',
      jsonb_build_object('from', OLD.verified_by, 'to', NEW.verified_by));
  END IF;

  IF OLD.verified_at IS DISTINCT FROM NEW.verified_at THEN
    v_changes := v_changes || jsonb_build_object('verified_at',
      jsonb_build_object('from', OLD.verified_at, 'to', NEW.verified_at));
  END IF;

  IF OLD.rejected_by IS DISTINCT FROM NEW.rejected_by THEN
    v_changes := v_changes || jsonb_build_object('rejected_by',
      jsonb_build_object('from', OLD.rejected_by, 'to', NEW.rejected_by));
  END IF;

  IF OLD.rejected_at IS DISTINCT FROM NEW.rejected_at THEN
    v_changes := v_changes || jsonb_build_object('rejected_at',
      jsonb_build_object('from', OLD.rejected_at, 'to', NEW.rejected_at));
  END IF;

  IF OLD.rejection_comments IS DISTINCT FROM NEW.rejection_comments THEN
    v_changes := v_changes || jsonb_build_object('rejection_comments',
      jsonb_build_object('from', OLD.rejection_comments, 'to', NEW.rejection_comments));
  END IF;

  IF OLD.claimed_by IS DISTINCT FROM NEW.claimed_by THEN
    v_changes := v_changes || jsonb_build_object('claimed_by',
      jsonb_build_object('from', OLD.claimed_by, 'to', NEW.claimed_by));
  END IF;

  IF OLD.claimed_at IS DISTINCT FROM NEW.claimed_at THEN
    v_changes := v_changes || jsonb_build_object('claimed_at',
      jsonb_build_object('from', OLD.claimed_at, 'to', NEW.claimed_at));
  END IF;

  IF OLD.visit_started_by IS DISTINCT FROM NEW.visit_started_by THEN
    v_changes := v_changes || jsonb_build_object('visit_started_by',
      jsonb_build_object('from', OLD.visit_started_by, 'to', NEW.visit_started_by));
  END IF;

  IF OLD.visit_started_at IS DISTINCT FROM NEW.visit_started_at THEN
    v_changes := v_changes || jsonb_build_object('visit_started_at',
      jsonb_build_object('from', OLD.visit_started_at, 'to', NEW.visit_started_at));
  END IF;

  IF OLD.visit_completed_by IS DISTINCT FROM NEW.visit_completed_by THEN
    v_changes := v_changes || jsonb_build_object('visit_completed_by',
      jsonb_build_object('from', OLD.visit_completed_by, 'to', NEW.visit_completed_by));
  END IF;

  IF OLD.visit_completed_at IS DISTINCT FROM NEW.visit_completed_at THEN
    v_changes := v_changes || jsonb_build_object('visit_completed_at',
      jsonb_build_object('from', OLD.visit_completed_at, 'to', NEW.visit_completed_at));
  END IF;

  IF OLD.cost IS DISTINCT FROM NEW.cost THEN
    v_changes := v_changes || jsonb_build_object('cost',
      jsonb_build_object('from', OLD.cost, 'to', NEW.cost));
  END IF;

  IF OLD.enumerator_fee IS DISTINCT FROM NEW.enumerator_fee THEN
    v_changes := v_changes || jsonb_build_object('enumerator_fee',
      jsonb_build_object('from', OLD.enumerator_fee, 'to', NEW.enumerator_fee));
  END IF;

  IF OLD.transport_fee IS DISTINCT FROM NEW.transport_fee THEN
    v_changes := v_changes || jsonb_build_object('transport_fee',
      jsonb_build_object('from', OLD.transport_fee, 'to', NEW.transport_fee));
  END IF;

  IF OLD.cost_acknowledged IS DISTINCT FROM NEW.cost_acknowledged THEN
    v_changes := v_changes || jsonb_build_object('cost_acknowledged',
      jsonb_build_object('from', OLD.cost_acknowledged, 'to', NEW.cost_acknowledged));
  END IF;

  IF OLD.cost_acknowledged_by IS DISTINCT FROM NEW.cost_acknowledged_by THEN
    v_changes := v_changes || jsonb_build_object('cost_acknowledged_by',
      jsonb_build_object('from', OLD.cost_acknowledged_by, 'to', NEW.cost_acknowledged_by));
  END IF;

  IF OLD.cost_acknowledged_at IS DISTINCT FROM NEW.cost_acknowledged_at THEN
    v_changes := v_changes || jsonb_build_object('cost_acknowledged_at',
      jsonb_build_object('from', OLD.cost_acknowledged_at, 'to', NEW.cost_acknowledged_at));
  END IF;

  IF OLD.verification_notes IS DISTINCT FROM NEW.verification_notes THEN
    v_changes := v_changes || jsonb_build_object('verification_notes',
      jsonb_build_object('from', OLD.verification_notes, 'to', NEW.verification_notes));
  END IF;

  -- =========================================================================
  -- additional_data SUB-FIELD CHANGES
  -- Many workflow events are stored here rather than in top-level columns.
  -- =========================================================================

  -- CP Verification (cp_verification.status)
  IF (v_old_ad->'cp_verification'->>'status') IS DISTINCT FROM
     (v_new_ad->'cp_verification'->>'status') AND
     v_new_ad->'cp_verification' IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('cp_verification',
      jsonb_build_object(
        'from',        v_old_ad->'cp_verification'->>'status',
        'to',          v_new_ad->'cp_verification'->>'status',
        'verified_by', v_new_ad->'cp_verification'->>'verified_by',
        'verified_at', v_new_ad->'cp_verification'->>'verified_at'
      ));
  END IF;

  -- Assignment to data collector (assigned_to in additional_data)
  IF (v_old_ad->>'assigned_to') IS DISTINCT FROM (v_new_ad->>'assigned_to') THEN
    v_changes := v_changes || jsonb_build_object('assigned_to',
      jsonb_build_object(
        'from',        v_old_ad->>'assigned_to',
        'to',          v_new_ad->>'assigned_to',
        'assigned_by', v_new_ad->>'assigned_by',
        'assigned_at', v_new_ad->>'assigned_at'
      ));
  END IF;

  -- Approved and costed (approved_and_costed_at)
  IF (v_old_ad->>'approved_and_costed_at') IS DISTINCT FROM
     (v_new_ad->>'approved_and_costed_at') AND
     v_new_ad->>'approved_and_costed_at' IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('approved_and_costed',
      jsonb_build_object(
        'approved_at', v_new_ad->>'approved_and_costed_at',
        'approved_by', v_new_ad->>'approved_and_costed_by'
      ));
  END IF;

  -- State permit decision (state_permit_decision_at or state_permit_not_required)
  IF (v_old_ad->>'state_permit_decision_at') IS DISTINCT FROM
     (v_new_ad->>'state_permit_decision_at') AND
     v_new_ad->>'state_permit_decision_at' IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('state_permit_decision',
      jsonb_build_object(
        'decided_at',   v_new_ad->>'state_permit_decision_at',
        'not_required', v_new_ad->>'state_permit_not_required',
        'uploaded',     v_new_ad->'permit_decision'->'statePermit'->>'uploaded',
        'requirement',  v_new_ad->'permit_decision'->'statePermit'->>'requirement'
      ));
  END IF;

  -- Locality permit uploaded (locality_permit_uploaded_at)
  IF (v_old_ad->>'locality_permit_uploaded_at') IS DISTINCT FROM
     (v_new_ad->>'locality_permit_uploaded_at') AND
     v_new_ad->>'locality_permit_uploaded_at' IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('locality_permit_uploaded',
      jsonb_build_object(
        'uploaded_at',  v_new_ad->>'locality_permit_uploaded_at',
        'uploaded_by',  v_new_ad->>'locality_permit_uploaded_by',
        'requirement',  v_new_ad->'permit_decision'->'localityPermit'->>'requirement'
      ));
  END IF;

  -- Locality permit requirement set (locality_permit_requirement_set_at)
  IF (v_old_ad->>'locality_permit_requirement_set_at') IS DISTINCT FROM
     (v_new_ad->>'locality_permit_requirement_set_at') AND
     v_new_ad->>'locality_permit_requirement_set_at' IS NOT NULL THEN
    v_changes := v_changes || jsonb_build_object('locality_permit_requirement',
      jsonb_build_object(
        'set_at',      v_new_ad->>'locality_permit_requirement_set_at',
        'set_by',      v_new_ad->>'locality_permit_requirement_set_by',
        'requirement', v_new_ad->'permit_decision'->'localityPermit'->>'requirement',
        'required_but_not_uploaded', v_new_ad->>'locality_permit_required_but_not_uploaded'
      ));
  END IF;

  -- Recall history: a new entry was appended
  IF jsonb_array_length(COALESCE(v_new_ad->'recall_history', '[]'::jsonb)) >
     jsonb_array_length(COALESCE(v_old_ad->'recall_history', '[]'::jsonb)) THEN
    v_changes := v_changes || jsonb_build_object('recall_history_entry',
      jsonb_build_object(
        'count_before', jsonb_array_length(COALESCE(v_old_ad->'recall_history', '[]'::jsonb)),
        'count_after',  jsonb_array_length(COALESCE(v_new_ad->'recall_history', '[]'::jsonb)),
        'latest',       v_new_ad->'recall_history'->-1
      ));
  END IF;

  -- Skip if nothing tracked changed (e.g. only updated_at or untracked additional_data keys changed)
  IF v_changes = '{}'::jsonb THEN
    RETURN NEW;
  END IF;

  -- =========================================================================
  -- RESOLVE ACTOR
  -- =========================================================================
  v_actor_id := COALESCE(auth.uid()::text, 'system');
  SELECT COALESCE(full_name, email, 'System')
    INTO v_actor_name
    FROM public.profiles
   WHERE id = auth.uid()
   LIMIT 1;
  v_actor_name := COALESCE(v_actor_name, 'System');

  -- =========================================================================
  -- DETERMINE ACTION LABEL (priority order matters)
  -- =========================================================================
  v_action := CASE
    WHEN v_changes ? 'rejected_by'
      OR (v_changes ? 'status' AND NEW.status ILIKE '%reject%')
      THEN 'reject'
    WHEN v_changes ? 'visit_completed_at'
      OR (v_changes ? 'status' AND NEW.status ILIKE '%complet%')
      THEN 'site_complete'
    WHEN v_changes ? 'visit_started_at'
      THEN 'site_visit_start'
    WHEN v_changes ? 'claimed_by'
      OR (v_changes ? 'status' AND NEW.status ILIKE '%accept%')
      THEN 'site_claim'
    WHEN v_changes ? 'dispatched_by'
      OR (v_changes ? 'status' AND NEW.status ILIKE '%dispatch%')
      THEN 'site_dispatch'
    WHEN v_changes ? 'forwarded_to_user_id' AND NEW.forwarded_to_user_id IS NOT NULL
      THEN 'forward_to_coordinator'
    WHEN v_changes ? 'forwarded_to_user_id' AND NEW.forwarded_to_user_id IS NULL
      THEN 'reclaim_from_coordinator'
    WHEN v_changes ? 'recall_history_entry'
      THEN 'site_recalled'
    WHEN v_changes ? 'cp_verification'
      THEN 'cp_verification'
    WHEN v_changes ? 'approved_and_costed'
      OR (v_changes ? 'status' AND NEW.status ILIKE '%costed%')
      THEN 'site_approved_costed'
    WHEN v_changes ? 'state_permit_decision'
      THEN 'state_permit_decision'
    WHEN v_changes ? 'locality_permit_uploaded'
      THEN 'permit_upload'
    WHEN v_changes ? 'locality_permit_requirement'
      THEN 'permit_decision_set'
    WHEN v_changes ? 'assigned_to'
      THEN 'site_dispatch'
    WHEN v_changes ? 'cost_acknowledged' AND NEW.cost_acknowledged = true
      THEN 'cost_acknowledge'
    WHEN v_changes ? 'cost'
      OR v_changes ? 'enumerator_fee'
      OR v_changes ? 'transport_fee'
      THEN 'cost_update'
    WHEN v_changes ? 'verified_by'
      OR (v_changes ? 'status' AND NEW.status ILIKE '%verif%')
      THEN 'verify'
    WHEN v_changes ? 'status' AND NEW.status ILIKE '%return%'
      THEN 'site_return'
    ELSE 'status_change'
  END;

  -- =========================================================================
  -- INSERT AUDIT LOG
  -- =========================================================================
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
    success
  ) VALUES (
    'mmp',
    v_action,
    'mmp_site_entry',
    NEW.id::text,
    COALESCE(NEW.site_name, NEW.id::text),
    v_actor_id,
    v_actor_name,
    CASE
      WHEN v_action IN ('reject', 'site_recalled', 'reclaim_from_coordinator') THEN 'warning'
      ELSE 'info'
    END,
    format(
      'Site "%s": %s',
      COALESCE(NEW.site_name, NEW.id::text),
      CASE
        WHEN v_changes ? 'status'
          THEN format('%s → %s', COALESCE(OLD.status, 'unknown'), COALESCE(NEW.status, 'unknown'))
        WHEN v_changes ? 'cp_verification'
          THEN format('CP verification %s', v_new_ad->'cp_verification'->>'status')
        WHEN v_changes ? 'approved_and_costed'
          THEN format('approved and costed by %s', v_new_ad->>'approved_and_costed_by')
        WHEN v_changes ? 'state_permit_decision'
          THEN 'state permit decision recorded'
        WHEN v_changes ? 'locality_permit_uploaded'
          THEN 'locality permit uploaded'
        WHEN v_changes ? 'locality_permit_requirement'
          THEN format('locality permit requirement set: %s', v_new_ad->'permit_decision'->'localityPermit'->>'requirement')
        WHEN v_changes ? 'assigned_to'
          THEN format('assigned to data collector (additional_data)')
        WHEN v_changes ? 'recall_history_entry'
          THEN format('recalled: %s', v_new_ad->'recall_history'->-1->>'reason')
        ELSE v_action
      END
    ),
    -- previous_state: key workflow fields before the change
    jsonb_build_object(
      'status',            OLD.status,
      'forwarded_to',      OLD.forwarded_to_user_id,
      'dispatched_by',     OLD.dispatched_by,
      'accepted_by',       OLD.accepted_by,
      'rejected_by',       OLD.rejected_by,
      'cost',              OLD.cost,
      'cp_verification',   v_old_ad->'cp_verification',
      'assigned_to',       v_old_ad->>'assigned_to',
      'permit_decision',   v_old_ad->'permit_decision'
    ),
    -- new_state: key workflow fields after the change
    jsonb_build_object(
      'status',            NEW.status,
      'forwarded_to',      NEW.forwarded_to_user_id,
      'dispatched_by',     NEW.dispatched_by,
      'accepted_by',       NEW.accepted_by,
      'rejected_by',       NEW.rejected_by,
      'cost',              NEW.cost,
      'cp_verification',   v_new_ad->'cp_verification',
      'assigned_to',       v_new_ad->>'assigned_to',
      'permit_decision',   v_new_ad->'permit_decision',
      'approved_and_costed_at', v_new_ad->>'approved_and_costed_at',
      'approved_and_costed_by', v_new_ad->>'approved_and_costed_by'
    ),
    v_changes,
    jsonb_build_object(
      'mmpFileId',         NEW.mmp_file_id,
      'siteCode',          NEW.site_code,
      'hub',               NEW.hub_office,
      'state',             NEW.state,
      'locality',          NEW.locality,
      'cpName',            NEW.cp_name,
      'activityAtSite',    NEW.activity_at_site,
      'triggeredBy',       'db_trigger'
    ),
    ARRAY['mmp', 'site', 'db_trigger', v_action],
    true
  );

  RETURN NEW;
END;
$$;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS site_entry_audit_trigger ON public.mmp_site_entries;

CREATE TRIGGER site_entry_audit_trigger
  AFTER UPDATE ON public.mmp_site_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.log_site_entry_changes();

-- Index to make per-site audit queries fast
CREATE INDEX IF NOT EXISTS idx_audit_logs_site_entry
  ON public.audit_logs (entity_id, entity_type, timestamp DESC)
  WHERE entity_type = 'mmp_site_entry';
