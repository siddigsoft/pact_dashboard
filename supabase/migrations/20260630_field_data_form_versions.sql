-- ─────────────────────────────────────────────────────────────────────────────
-- Field Data Hub — Phase 4: Form Versions & Publishing
-- Run in Supabase Dashboard → SQL Editor → New query
-- ─────────────────────────────────────────────────────────────────────────────

-- Form versions table: each upload of an XLSForm creates one row
CREATE TABLE IF NOT EXISTS field_data_form_versions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id           UUID        NOT NULL REFERENCES field_data_forms(id) ON DELETE CASCADE,
  version_number    INTEGER     NOT NULL DEFAULT 1,
  version_label     TEXT,                              -- e.g. "v3 — June 2026 Endline"
  xlsform_filename  TEXT,                              -- original filename uploaded
  xlsform_parsed    JSONB       DEFAULT '{}',          -- {survey:[...], choices:[...], settings:{}}
  question_count    INTEGER     DEFAULT 0,
  uploaded_by       UUID        REFERENCES auth.users(id),
  uploaded_at       TIMESTAMPTZ DEFAULT now(),
  is_current        BOOLEAN     DEFAULT false,
  published_to      JSONB       DEFAULT '[]',          -- [{server_id, server_name, type, status, published_at, error}]
  notes             TEXT
);

CREATE INDEX IF NOT EXISTS idx_fdfv_form_id
  ON field_data_form_versions(form_id);

CREATE INDEX IF NOT EXISTS idx_fdfv_current
  ON field_data_form_versions(form_id, is_current)
  WHERE is_current = true;

ALTER TABLE field_data_form_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fdfv_authenticated"
  ON field_data_form_versions FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-number versions per form
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_form_version_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
    INTO NEW.version_number
    FROM field_data_form_versions
   WHERE form_id = NEW.form_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fdfv_version_number ON field_data_form_versions;
CREATE TRIGGER trg_fdfv_version_number
  BEFORE INSERT ON field_data_form_versions
  FOR EACH ROW EXECUTE FUNCTION set_form_version_number();

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: promote a version to current (unsets all others for that form)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_current_form_version(p_version_id UUID, p_form_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE field_data_form_versions SET is_current = false WHERE form_id = p_form_id;
  UPDATE field_data_form_versions SET is_current = true  WHERE id = p_version_id;
END;
$$;

GRANT EXECUTE ON FUNCTION set_current_form_version(UUID, UUID) TO authenticated;
