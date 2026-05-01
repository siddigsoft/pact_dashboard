-- ============================================================
-- Auto-generate Employee ID: PACT-NNNN
-- Run this in: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE OR REPLACE FUNCTION generate_next_employee_id()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  max_num integer := 0;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(employee_id FROM 6) AS integer)),
    0
  )
  INTO max_num
  FROM profiles
  WHERE employee_id ~ '^PACT-[0-9]{4}$';

  RETURN 'PACT-' || LPAD((max_num + 1)::text, 4, '0');
END;
$$;

-- Grant execute to authenticated users (the app calls this as an RPC)
GRANT EXECUTE ON FUNCTION generate_next_employee_id() TO authenticated;
