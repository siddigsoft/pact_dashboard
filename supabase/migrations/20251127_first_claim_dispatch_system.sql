-- First-Claim Dispatch System Migration
-- Enables Uber-like first-come, first-served claiming of dispatched sites

-- Add claimed_at and claimed_by columns to mmp_site_entries if they don't exist
DO $$
BEGIN
  -- Add claimed_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mmp_site_entries' AND column_name = 'claimed_at'
  ) THEN
    ALTER TABLE mmp_site_entries ADD COLUMN claimed_at TIMESTAMPTZ;
    COMMENT ON COLUMN mmp_site_entries.claimed_at IS 'Timestamp when the site was claimed by an enumerator';
  END IF;

  -- Add claimed_by column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mmp_site_entries' AND column_name = 'claimed_by'
  ) THEN
    ALTER TABLE mmp_site_entries ADD COLUMN claimed_by UUID REFERENCES profiles(id);
    COMMENT ON COLUMN mmp_site_entries.claimed_by IS 'User ID of the enumerator who claimed this site';
  END IF;
END $$;

-- Create index for faster queries on claimed sites
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_claimed_by ON mmp_site_entries(claimed_by) WHERE claimed_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_status_claimed ON mmp_site_entries(status, claimed_by) WHERE status = 'Dispatched';

-- Create atomic claim function to prevent race conditions
-- This function uses SELECT FOR UPDATE SKIP LOCKED to ensure only one user can claim a site
CREATE OR REPLACE FUNCTION claim_site_visit(
  p_site_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_site RECORD;
  v_user_name TEXT;
  v_result JSONB;
BEGIN
  -- Get user name for audit trail
  SELECT COALESCE(full_name, username, email) INTO v_user_name
  FROM profiles
  WHERE id = p_user_id;

  -- Try to lock and claim the site atomically
  -- SKIP LOCKED ensures we don't wait if another transaction has the lock
  SELECT id, status, claimed_by, accepted_by, site_name
  INTO v_site
  FROM mmp_site_entries
  WHERE id = p_site_id
  FOR UPDATE SKIP LOCKED;

  -- Check if we got the lock (if not, another transaction has it)
  IF v_site IS NULL THEN
    -- Could not acquire lock - site is being claimed by someone else
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CLAIM_IN_PROGRESS',
      'message', 'This site is currently being claimed by another user. Please try a different site.'
    );
  END IF;

  -- Verify site is in "Dispatched" status and not yet claimed
  IF LOWER(v_site.status) != 'dispatched' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INVALID_STATUS',
      'message', 'This site is no longer available for claiming. Status: ' || v_site.status
    );
  END IF;

  -- Check if already claimed (by accepted_by or claimed_by)
  IF v_site.claimed_by IS NOT NULL OR v_site.accepted_by IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CLAIMED',
      'message', 'This site has already been claimed by another enumerator.'
    );
  END IF;

  -- All checks passed - claim the site
  UPDATE mmp_site_entries
  SET 
    status = 'Assigned',
    claimed_by = p_user_id,
    claimed_at = NOW(),
    accepted_by = p_user_id,
    accepted_at = NOW(),
    additional_data = COALESCE(additional_data, '{}'::jsonb) || jsonb_build_object(
      'claimed_by', v_user_name,
      'claimed_at', NOW()::TEXT,
      'claim_type', 'first_claim'
    )
  WHERE id = p_site_id;

  -- Create notification for the claimer
  INSERT INTO notifications (user_id, title, message, type, link, related_entity_id, related_entity_type)
  VALUES (
    p_user_id,
    'Site Claimed Successfully',
    'You have successfully claimed site "' || COALESCE(v_site.site_name, 'Unknown') || '". You can now start your visit.',
    'success',
    '/site-visits?status=assigned',
    p_site_id,
    'mmpFile'
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Site claimed successfully! You are now assigned to this site.',
    'site_name', v_site.site_name
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
GRANT EXECUTE ON FUNCTION claim_site_visit(UUID, UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION claim_site_visit IS 'Atomically claim a dispatched site for a user. Uses row-level locking to prevent race conditions in first-come, first-served claiming.';
