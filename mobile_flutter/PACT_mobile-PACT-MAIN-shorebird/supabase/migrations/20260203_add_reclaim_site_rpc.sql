-- Migration: Create reclaim_site_visit RPC function
-- Description: Allows admins to release claimed sites back to the dispatch pool
-- Date: 2026-02-03

BEGIN;

-- Drop existing function if present
DROP FUNCTION IF EXISTS public.reclaim_site_visit(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.reclaim_site_visit(
  p_site_id UUID,
  p_admin_id UUID,
  p_reason TEXT DEFAULT 'Admin reclaim'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site RECORD;
  v_admin_name TEXT;
  v_admin_role TEXT;
  v_former_assignee TEXT;
  v_former_assignee_name TEXT;
BEGIN
  -- Get admin info
  SELECT COALESCE(full_name, username, email), role
  INTO v_admin_name, v_admin_role
  FROM public.profiles
  WHERE id = p_admin_id;

  -- Verify admin has permission to reclaim (admin/super_admin only)
  IF v_admin_role IS NULL OR LOWER(v_admin_role) NOT IN ('admin', 'super_admin', 'superadmin') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'PERMISSION_DENIED',
      'message', 'You do not have permission to reclaim sites. Only admins can reclaim.'
    );
  END IF;

  -- Get the site entry
  SELECT id, site_name, site_code, status, accepted_by, accepted_at
  INTO v_site
  FROM public.mmp_site_entries
  WHERE id = p_site_id
  FOR UPDATE;

  IF v_site IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_FOUND',
      'message', 'Site entry not found.'
    );
  END IF;

  -- Get the former assignee info
  v_former_assignee := v_site.accepted_by;
  
  IF v_former_assignee IS NOT NULL THEN
    SELECT COALESCE(full_name, username, email)
    INTO v_former_assignee_name
    FROM public.profiles
    WHERE id = v_former_assignee::uuid;
  END IF;

  -- Check if site is actually claimed (handle various status formats)
  IF v_site.accepted_by IS NULL AND LOWER(REPLACE(v_site.status, ' ', '_')) NOT IN ('claimed', 'accepted', 'in_progress', 'ongoing', 'assigned') THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_CLAIMED',
      'message', 'This site is not currently claimed by anyone.'
    );
  END IF;

  -- Update the site entry to release it back to dispatched
  UPDATE public.mmp_site_entries
  SET 
    status = 'Dispatched',
    accepted_by = NULL,
    accepted_at = NULL,
    visit_started_at = NULL,
    visit_started_by = NULL,
    enumerator_fee = NULL,
    cost = NULL,
    additional_data = COALESCE(additional_data, '{}'::jsonb) || jsonb_build_object(
      'reclaimed_at', NOW()::TEXT,
      'reclaimed_by', p_admin_id::TEXT,
      'reclaimed_by_name', v_admin_name,
      'reclaim_reason', p_reason,
      'former_assignee', v_former_assignee,
      'former_assignee_name', v_former_assignee_name,
      'previous_status', v_site.status
    ),
    updated_at = NOW()
  WHERE id = p_site_id;

  -- Create notification for the former assignee
  IF v_former_assignee IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, link, related_entity_id, related_entity_type)
    VALUES (
      v_former_assignee::uuid,
      'Site Reclaimed',
      'Your site "' || COALESCE(v_site.site_name, v_site.site_code, 'Unknown') || '" has been reclaimed by ' || v_admin_name || '. Reason: ' || p_reason,
      'warning',
      '/site-visits',
      p_site_id,
      'mmpSiteEntry'
    );
  END IF;

  -- Log the reclaim action in audit log if table exists
  BEGIN
    INSERT INTO public.super_admin_deletion_logs (
      table_name,
      record_id,
      record_data,
      deleted_by,
      deleted_by_role,
      deleted_by_name,
      deletion_reason,
      is_restorable
    ) VALUES (
      'mmp_site_entries',
      p_site_id,
      jsonb_build_object(
        'action', 'site_reclaimed',
        'site_name', v_site.site_name,
        'former_assignee', v_former_assignee,
        'former_assignee_name', v_former_assignee_name,
        'previous_status', v_site.status
      ),
      p_admin_id,
      v_admin_role,
      v_admin_name,
      'Site reclaimed: ' || p_reason,
      true
    );
  EXCEPTION WHEN undefined_table THEN
    -- Audit log table doesn't exist, skip logging
    NULL;
  END;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site reclaimed successfully and released back to dispatch pool.',
    'site_id', p_site_id,
    'site_name', COALESCE(v_site.site_name, v_site.site_code),
    'former_assignee', v_former_assignee_name,
    'reclaimed_at', NOW()::TEXT
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SYSTEM_ERROR',
      'message', 'An unexpected error occurred: ' || SQLERRM
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.reclaim_site_visit(UUID, UUID, TEXT) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.reclaim_site_visit IS 'Allows admins to reclaim/release claimed sites back to the dispatch pool';

COMMIT;
