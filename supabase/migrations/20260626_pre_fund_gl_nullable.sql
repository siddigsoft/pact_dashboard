-- Pre-Fund GL Columns — drop NOT NULL constraints
-- The UI allows "— None —" (NULL) for all four GL account fields.
-- The RPC enforces GL codes at link/close time, so NULLs here are valid
-- during fund creation and should only be blocked at the point of use.

ALTER TABLE public.pre_fund_requests
  ALTER COLUMN gl_receipt_account   DROP NOT NULL,
  ALTER COLUMN gl_liability_account DROP NOT NULL,
  ALTER COLUMN gl_expense_account   DROP NOT NULL,
  ALTER COLUMN gl_cf_account        DROP NOT NULL;
