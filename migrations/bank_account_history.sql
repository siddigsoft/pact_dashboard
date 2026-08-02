-- Bank Account Change History
-- Tracks every time a profile's bank_account JSONB column is updated
-- so HR / Admin can audit which account details were active at any point in time.

CREATE TABLE IF NOT EXISTS bank_account_history (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  changed_by   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  old_data     JSONB,
  new_data     JSONB,
  change_note  TEXT
);

CREATE INDEX IF NOT EXISTS idx_bank_account_history_profile
  ON bank_account_history (profile_id, changed_at DESC);

-- RLS
ALTER TABLE bank_account_history ENABLE ROW LEVEL SECURITY;

-- Admins, SuperAdmins, and HR can read all history
CREATE POLICY "admins_view_bank_history"
  ON bank_account_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('Admin', 'SuperAdmin', 'HR')
    )
  );

-- An employee can read their own history
CREATE POLICY "owner_view_own_bank_history"
  ON bank_account_history FOR SELECT
  USING (profile_id = auth.uid());

-- Any authenticated user may insert (the app code logs on behalf of the target profile)
CREATE POLICY "authenticated_insert_bank_history"
  ON bank_account_history FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
