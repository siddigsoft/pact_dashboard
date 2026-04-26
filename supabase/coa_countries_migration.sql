-- ============================================================
-- PACT Command Center — Multi-Country + COA Management
-- Migration: countries, user_country_access, acct_accounts.country_id
-- Apply in Supabase SQL editor (safe to run multiple times)
-- ============================================================

-- ─── 1. COUNTRIES TABLE ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS countries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(10) NOT NULL UNIQUE,   -- ISO code: SD, SS, ET …
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  currency_code   VARCHAR(10) NOT NULL DEFAULT 'USD',
  currency_symbol VARCHAR(10) NOT NULL DEFAULT '$',
  flag_emoji      VARCHAR(10),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_countries_updated_at ON countries;
CREATE TRIGGER trg_countries_updated_at
  BEFORE UPDATE ON countries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed initial countries
INSERT INTO countries (code, name_en, name_ar, currency_code, currency_symbol, flag_emoji)
VALUES
  ('SD', 'Sudan',       'السودان',  'SDG', 'SDG', '🇸🇩'),
  ('SS', 'South Sudan', 'جنوب السودان', 'SSP', 'SSP', '🇸🇸'),
  ('ET', 'Ethiopia',    'إثيوبيا',  'ETB', 'ETB', '🇪🇹'),
  ('KE', 'Kenya',       'كينيا',    'KES', 'KES', '🇰🇪'),
  ('UG', 'Uganda',      'أوغندا',   'UGX', 'UGX', '🇺🇬'),
  ('LY', 'Libya',       'ليبيا',    'LYD', 'LYD', '🇱🇾'),
  ('EG', 'Egypt',       'مصر',      'EGP', 'EGP', '🇪🇬')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. USER–COUNTRY ACCESS TABLE ───────────────────────────
-- Defines which countries each user has access to.
-- A user with NO row here sees only the default country.
-- Super admins bypass this table entirely (app-level check).
CREATE TABLE IF NOT EXISTS user_country_access (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  country_id    UUID NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,  -- one primary per user
  granted_by    UUID REFERENCES auth.users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, country_id)
);

CREATE INDEX IF NOT EXISTS idx_user_country_access_user   ON user_country_access(user_id);
CREATE INDEX IF NOT EXISTS idx_user_country_access_country ON user_country_access(country_id);

-- ─── 3. ADD country_id TO acct_accounts ─────────────────────
ALTER TABLE acct_accounts
  ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES countries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_acct_accounts_country ON acct_accounts(country_id);

-- Stamp existing accounts as Sudan (SD)
UPDATE acct_accounts
SET country_id = (SELECT id FROM countries WHERE code = 'SD' LIMIT 1)
WHERE country_id IS NULL;

-- ─── 4. ROW LEVEL SECURITY ──────────────────────────────────

-- countries: everyone can read active countries
ALTER TABLE countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "countries_select" ON countries;
CREATE POLICY "countries_select"
  ON countries FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "countries_admin_all" ON countries;
CREATE POLICY "countries_admin_all"
  ON countries FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'admin')
    )
  );

-- user_country_access: user sees their own rows; admins see all
ALTER TABLE user_country_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uca_self_select" ON user_country_access;
CREATE POLICY "uca_self_select"
  ON user_country_access FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "uca_admin_all" ON user_country_access;
CREATE POLICY "uca_admin_all"
  ON user_country_access FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin', 'admin')
    )
  );

-- ─── 5. HELPER VIEW: countries a user can access ────────────
CREATE OR REPLACE VIEW user_accessible_countries AS
SELECT
  c.*,
  uca.is_primary,
  uca.user_id
FROM countries c
JOIN user_country_access uca ON uca.country_id = c.id
WHERE c.is_active = TRUE;

-- ─── DONE ────────────────────────────────────────────────────
-- After running this script:
-- 1. Existing acct_accounts rows are stamped with Sudan (SD).
-- 2. Assign users to countries via user_country_access.
-- 3. The COA page now shows the country selector and
--    Add / Edit / Delete account management (admin/super_admin only).
