-- ============================================================================
-- Phase 14: Multi-Language Form Management
-- fd_form_translations + fd_region_lang_defaults
-- Run in Supabase SQL Editor (safe to re-run: IF NOT EXISTS / OR REPLACE guards)
-- ============================================================================

-- ── fd_form_translations ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fd_form_translations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id          UUID REFERENCES fd_forms(id) ON DELETE CASCADE,
  form_name        TEXT NOT NULL DEFAULT '',
  lang_code        TEXT NOT NULL,                -- e.g. 'ar', 'fr', 'so'
  field_key        TEXT NOT NULL,                -- e.g. 'q1_label', 'q2_hint', 'form_title'
  source_text      TEXT NOT NULL DEFAULT '',     -- English (source) text
  translated_text  TEXT,                         -- NULL = not yet translated
  is_ai_generated  BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reviewed      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (form_id, lang_code, field_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fd_form_translations_form_lang ON fd_form_translations(form_id, lang_code);
CREATE INDEX IF NOT EXISTS idx_fd_form_translations_missing
  ON fd_form_translations(form_id, lang_code)
  WHERE translated_text IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_fd_translation_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fd_translation_updated_at ON fd_form_translations;
CREATE TRIGGER trg_fd_translation_updated_at
  BEFORE UPDATE ON fd_form_translations
  FOR EACH ROW EXECUTE FUNCTION set_fd_translation_updated_at();

-- ── fd_region_lang_defaults ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fd_region_lang_defaults (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country    TEXT NOT NULL UNIQUE,
  lang_code  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_fd_region_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fd_region_updated_at ON fd_region_lang_defaults;
CREATE TRIGGER trg_fd_region_updated_at
  BEFORE UPDATE ON fd_region_lang_defaults
  FOR EACH ROW EXECUTE FUNCTION set_fd_region_updated_at();

-- Seed common region defaults (safe to re-run)
INSERT INTO fd_region_lang_defaults (country, lang_code) VALUES
  ('Sudan',       'ar'),
  ('South Sudan', 'en'),
  ('Chad',        'fr'),
  ('Ethiopia',    'am'),
  ('Somalia',     'so'),
  ('Kenya',       'sw'),
  ('Nigeria',     'ha'),
  ('Egypt',       'ar'),
  ('Libya',       'ar'),
  ('Eritrea',     'ti')
ON CONFLICT (country) DO NOTHING;

-- ── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE fd_form_translations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE fd_region_lang_defaults ENABLE ROW LEVEL SECURITY;

-- Translations: readable by all field-data users; editable by data team / admin
DROP POLICY IF EXISTS "fd_translations_select"  ON fd_form_translations;
DROP POLICY IF EXISTS "fd_translations_insert"  ON fd_form_translations;
DROP POLICY IF EXISTS "fd_translations_update"  ON fd_form_translations;
DROP POLICY IF EXISTS "fd_translations_delete"  ON fd_form_translations;

CREATE POLICY "fd_translations_select" ON fd_form_translations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom', 'project_manager', 'country_director')
    )
  );

CREATE POLICY "fd_translations_insert" ON fd_form_translations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom')
    )
  );

CREATE POLICY "fd_translations_update" ON fd_form_translations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom')
    )
  );

CREATE POLICY "fd_translations_delete" ON fd_form_translations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict')
    )
  );

-- Region defaults: readable by all; writable by admin
DROP POLICY IF EXISTS "fd_region_select"  ON fd_region_lang_defaults;
DROP POLICY IF EXISTS "fd_region_write"   ON fd_region_lang_defaults;

CREATE POLICY "fd_region_select" ON fd_region_lang_defaults
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "fd_region_write" ON fd_region_lang_defaults
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_profiles WHERE id = auth.uid()
        AND role IN ('super_admin', 'admin', 'ict', 'data_team', 'fom')
    )
  );

-- ── get_translation_summary view ────────────────────────────────────────────
-- Used by Overview tab to show completion % per form × language

CREATE OR REPLACE VIEW fd_translation_summary AS
SELECT
  form_id,
  form_name,
  lang_code,
  COUNT(*)                                          AS total_fields,
  COUNT(*) FILTER (WHERE translated_text IS NOT NULL) AS translated_fields,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE translated_text IS NOT NULL) / NULLIF(COUNT(*), 0),
    0
  )                                                 AS completion_pct,
  COUNT(*) FILTER (WHERE is_ai_generated AND NOT ai_reviewed) AS pending_ai_review
FROM fd_form_translations
GROUP BY form_id, form_name, lang_code;

GRANT SELECT ON fd_translation_summary TO authenticated;

-- ── Helper: seed form question keys from fd_form_schema ─────────────────────
-- Call this after uploading an XLSForm to populate translation rows.
-- Usage: SELECT seed_form_translation_keys('<form_id>', 'ar');
-- (Requires fd_form_schema table with columns: form_id, field_key, label_en)

CREATE OR REPLACE FUNCTION seed_form_translation_keys(
  p_form_id   UUID,
  p_lang_code TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_form_name TEXT;
BEGIN
  SELECT name INTO v_form_name FROM fd_forms WHERE id = p_form_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Form % not found', p_form_id; END IF;

  -- Only works if fd_form_schema exists; silently returns 0 if it doesn't.
  BEGIN
    INSERT INTO fd_form_translations (form_id, form_name, lang_code, field_key, source_text)
    SELECT p_form_id, v_form_name, p_lang_code, field_key, COALESCE(label_en, field_key)
    FROM fd_form_schema
    WHERE form_id = p_form_id
    ON CONFLICT (form_id, lang_code, field_key) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN
    NULL; -- fd_form_schema not yet created; skip silently
  END;

  RETURN v_inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_form_translation_keys(UUID, TEXT) TO authenticated;

-- ============================================================================
-- Notes:
--  • To bulk-import source texts from an XLSForm: upload to fd_form_schema
--    then call SELECT seed_form_translation_keys('<form_id>', 'ar');
--  • The translate-form Edge Function uses GOOGLE_AI_API_KEY (Gemini 2.0 Flash).
--  • AI-generated translations have is_ai_generated=TRUE, ai_reviewed=FALSE
--    until a user approves them in the AI Assistant tab.
-- ============================================================================
