-- ============================================================================
-- REMOVE TRANSPORT FEES FROM FEE STRUCTURES
-- ============================================================================
-- Purpose: Enforce business rule that fee structures only contain BASE fees
--          Transport fees should ONLY come from approved site visits
-- Created: 2025-11-23
-- ============================================================================

-- ============================================================================
-- 1. REMOVE TRANSPORT FEE COLUMN FROM FEE STRUCTURES
-- ============================================================================

-- Drop the constraint that validates transport fees
ALTER TABLE classification_fee_structures
  DROP CONSTRAINT IF EXISTS valid_fee_amounts;

-- Remove the transport fee column (no longer part of fee structures)
ALTER TABLE classification_fee_structures
  DROP COLUMN IF EXISTS site_visit_transport_fee_cents;

-- Re-add constraint for base fee only
ALTER TABLE classification_fee_structures
  ADD CONSTRAINT valid_fee_amounts CHECK (
    site_visit_base_fee_cents >= 0
  );

-- ============================================================================
-- 2. UPDATE GET_CLASSIFICATION_FEE FUNCTION (Base Fees Only)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_classification_fee(
  p_classification_level classification_level,
  p_role_scope classification_role_scope,
  p_currency text DEFAULT 'SDG'
)
RETURNS TABLE (
  base_fee_cents integer,
  complexity_multiplier decimal
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cfs.site_visit_base_fee_cents,
    cfs.complexity_multiplier
  FROM classification_fee_structures cfs
  WHERE 
    cfs.classification_level = p_classification_level
    AND cfs.role_scope = p_role_scope
    AND cfs.currency = p_currency
    AND cfs.is_active = true
    AND cfs.valid_from <= now()
    AND (cfs.valid_until IS NULL OR cfs.valid_until > now())
  ORDER BY cfs.valid_from DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 3. ADD VALIDATION: Transport Fees Only from Approved Site Visits
-- ============================================================================

-- Create function to validate transport fees require approved site visit
CREATE OR REPLACE FUNCTION validate_transport_fee_requires_approved_visit()
RETURNS TRIGGER AS $$
DECLARE
  visit_status TEXT;
BEGIN
  -- Only validate if transportation cost is non-zero
  IF NEW.transportation_cost_cents > 0 THEN
    -- Check if site visit exists and get its status
    IF NEW.site_visit_id IS NOT NULL THEN
      SELECT status INTO visit_status
      FROM site_visits
      WHERE id = NEW.site_visit_id;
      
      -- Transport fees only allowed for approved, completed, or closed visits
      -- Including multi-stage approvals (approved_stage_one, approved_stage_two)
      IF visit_status NOT IN ('approved', 'approved_stage_one', 'approved_stage_two', 'completed', 'closed') THEN
        RAISE EXCEPTION 'Transport fees can only be submitted for approved site visits. Current visit status: %', visit_status;
      END IF;
    ELSE
      -- No site visit linked - reject transport fees
      -- This enforces business rule: transport reimbursements must be tied to a specific approved site visit
      RAISE EXCEPTION 'Transport fees require an approved site visit reference. Cannot submit transport costs without a linked site visit.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to cost submissions
DROP TRIGGER IF EXISTS trg_validate_transport_fee ON site_visit_cost_submissions;
CREATE TRIGGER trg_validate_transport_fee
  BEFORE INSERT OR UPDATE OF transportation_cost_cents, site_visit_id
  ON site_visit_cost_submissions
  FOR EACH ROW
  EXECUTE FUNCTION validate_transport_fee_requires_approved_visit();

-- ============================================================================
-- 4. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN classification_fee_structures.site_visit_base_fee_cents IS 
  'Base fee amount (in cents) for site visit based on classification level and role. This does NOT include transport fees - those come only from approved site visits.';

COMMENT ON FUNCTION validate_transport_fee_requires_approved_visit IS 
  'Enforces business rule: Transport fees can only be submitted for approved site visits. Fee structures contain only base fees.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Summary of changes:
-- ✅ Removed site_visit_transport_fee_cents from classification_fee_structures
-- ✅ Updated get_classification_fee function to return base fees only
-- ✅ Added validation trigger to ensure transport fees only from approved visits
-- ✅ Fee structures now correctly contain ONLY base fees per level (A, B, C)
-- ✅ Transport reimbursements properly tied to site visit approvals
