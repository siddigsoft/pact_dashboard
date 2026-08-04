-- Single round-trip GL for one account + period (opening balance + period lines).
-- Replaces client-side: fetch all prior entry IDs, batch journal_lines, then period lines.

CREATE OR REPLACE FUNCTION public.get_acct_gl_ledger(
  p_account_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_opening numeric := 0;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF p_account_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL THEN
    RETURN jsonb_build_object('openingBalance', 0, 'lines', '[]'::jsonb);
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN l.debit_credit = 'DR' THEN COALESCE(l.functional_amount, 0)
      ELSE -COALESCE(l.functional_amount, 0)
    END
  ), 0)
  INTO v_opening
  FROM acct_journal_lines l
  INNER JOIN acct_journal_entries e ON e.id = l.entry_id
  WHERE l.account_id = p_account_id
    AND e.status = 'posted'
    AND e.posting_date < p_start_date;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'entry_id', x.entry_id,
        'entry_no', x.entry_no,
        'posting_date', x.posting_date,
        'description_en', x.description_en,
        'description_ar', x.description_ar,
        'source_type', x.source_type,
        'status', x.status,
        'line_no', x.line_no,
        'debit_credit', x.debit_credit,
        'functional_amount', x.functional_amount,
        'functional_currency', x.functional_currency,
        'original_amount', x.original_amount,
        'original_currency', x.original_currency,
        'line_description', x.line_description
      )
      ORDER BY x.posting_date, x.entry_no, x.line_no
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM (
    SELECT
      e.id AS entry_id,
      e.entry_no,
      e.posting_date,
      e.description_en,
      e.description_ar,
      e.source_type,
      e.status,
      l.line_no,
      l.debit_credit,
      COALESCE(l.functional_amount, 0) AS functional_amount,
      l.functional_currency,
      COALESCE(l.original_amount, 0) AS original_amount,
      l.original_currency,
      l.description AS line_description
    FROM acct_journal_lines l
    INNER JOIN acct_journal_entries e ON e.id = l.entry_id
    WHERE l.account_id = p_account_id
      AND e.status = 'posted'
      AND e.posting_date >= p_start_date
      AND e.posting_date <= p_end_date
  ) x;

  RETURN jsonb_build_object(
    'openingBalance', v_opening,
    'lines', v_lines
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_acct_gl_ledger(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_acct_gl_ledger(uuid, date, date) TO service_role;

COMMENT ON FUNCTION public.get_acct_gl_ledger(uuid, date, date) IS
  'Returns openingBalance + period journal lines for one account (posted only).';
