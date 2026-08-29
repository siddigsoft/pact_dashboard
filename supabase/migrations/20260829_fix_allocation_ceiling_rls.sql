-- Allocation ceiling validation reads the parent fund while an allocation is
-- being changed. Run it with definer rights so parent-fund RLS cannot turn a
-- visible fund into a false "does not exist" error.

CREATE OR REPLACE FUNCTION public.pre_fund_guard_allocation_ceiling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fund_amount NUMERIC;
  v_other_allocated NUMERIC;
BEGIN
  -- Payment processing updates spent_amount only. A historic over-allocation
  -- must not block a legitimate reversal or payment; Finance resolves it
  -- before changing allocation amounts.
  IF TG_OP = 'UPDATE'
     AND NEW.allocated_amount IS NOT DISTINCT FROM OLD.allocated_amount
     AND NEW.pre_fund_request_id IS NOT DISTINCT FROM OLD.pre_fund_request_id THEN
    RETURN NEW;
  END IF;

  SELECT amount INTO v_fund_amount
  FROM public.pre_fund_requests
  WHERE id = NEW.pre_fund_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation fund % does not exist.', NEW.pre_fund_request_id;
  END IF;

  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_other_allocated
  FROM public.pre_fund_allocations
  WHERE pre_fund_request_id = NEW.pre_fund_request_id
    AND (TG_OP = 'INSERT' OR id <> OLD.id);

  IF v_other_allocated + NEW.allocated_amount > v_fund_amount THEN
    RAISE EXCEPTION 'Allocation ceiling exceeded: allocations would be %, fund authorisation is %.',
      v_other_allocated + NEW.allocated_amount, v_fund_amount;
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';