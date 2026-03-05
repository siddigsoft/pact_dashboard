CREATE TABLE IF NOT EXISTS bank_transaction_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id TEXT,
  transaction_date DATE,
  transaction_time TEXT,
  from_account TEXT,
  to_account TEXT,
  recipient_name TEXT,
  mobile_number TEXT,
  comment TEXT,
  amount NUMERIC,
  currency TEXT DEFAULT 'SDG',
  batch_id UUID DEFAULT gen_random_uuid(),
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bts_date ON bank_transaction_scans(transaction_date);
CREATE INDEX IF NOT EXISTS idx_bts_uploaded_by ON bank_transaction_scans(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_bts_batch ON bank_transaction_scans(batch_id);

ALTER TABLE bank_transaction_scans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='bank_transaction_scans' AND policyname='bts_admin_all'
  ) THEN
    CREATE POLICY bts_admin_all ON bank_transaction_scans
      FOR ALL USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
          AND role IN ('super_admin','admin','financial_auditor','financialadmin'))
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='bank_transaction_scans' AND policyname='bts_own_select'
  ) THEN
    CREATE POLICY bts_own_select ON bank_transaction_scans
      FOR SELECT USING (uploaded_by = auth.uid());
  END IF;
END $$;
