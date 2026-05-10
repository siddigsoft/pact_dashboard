-- Migration: Add short_code to surveys for short shareable URLs
-- Run this in Supabase SQL editor.

-- 1. Add the column (idempotent)
ALTER TABLE surveys
  ADD COLUMN IF NOT EXISTS short_code VARCHAR(12) UNIQUE;

-- 2. Helper function to generate a random 8-char code (no ambiguous chars)
CREATE OR REPLACE FUNCTION _gen_survey_short_code() RETURNS text AS $$
DECLARE
  chars text := 'abcdefghjkmnpqrstuvwxyz23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 3. Populate existing surveys that don't have a code yet
DO $$
DECLARE
  r   RECORD;
  code text;
  tries int;
BEGIN
  FOR r IN SELECT id FROM surveys WHERE short_code IS NULL ORDER BY created_at LOOP
    tries := 0;
    LOOP
      code := _gen_survey_short_code();
      BEGIN
        UPDATE surveys SET short_code = code WHERE id = r.id;
        EXIT;  -- success
      EXCEPTION WHEN unique_violation THEN
        tries := tries + 1;
        IF tries > 20 THEN
          RAISE EXCEPTION 'Could not generate unique short_code after 20 attempts';
        END IF;
      END;
    END LOOP;
  END LOOP;
END $$;

-- 4. Auto-assign short_code on insert if not supplied
CREATE OR REPLACE FUNCTION surveys_auto_short_code()
RETURNS TRIGGER AS $$
DECLARE
  code text;
  tries int := 0;
BEGIN
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;
  LOOP
    code := _gen_survey_short_code();
    BEGIN
      NEW.short_code := code;
      RETURN NEW;
    EXCEPTION WHEN unique_violation THEN
      tries := tries + 1;
      IF tries > 20 THEN
        RAISE EXCEPTION 'Could not generate unique short_code';
      END IF;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_surveys_auto_short_code ON surveys;
CREATE TRIGGER trg_surveys_auto_short_code
  BEFORE INSERT ON surveys
  FOR EACH ROW EXECUTE FUNCTION surveys_auto_short_code();
