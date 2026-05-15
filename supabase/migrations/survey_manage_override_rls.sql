-- Survey RLS: allow users with a manage-level page_access_override on 'surveys'
-- to perform the same write operations as role-based admins.
--
-- Run this AFTER:
--   1. add_level_to_page_access_overrides.sql  (adds the 'level' column)
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: is this user a survey manager (by role OR override)?
-- Used in USING and WITH CHECK for all write-capable policies.

-- ── surveys table ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "surveys_admin_all" ON surveys;
CREATE POLICY "surveys_admin_all" ON surveys FOR ALL TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
    OR EXISTS (
      SELECT 1 FROM page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
    OR EXISTS (
      SELECT 1 FROM page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  );

-- ── survey_questions table ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "survey_questions_all" ON survey_questions;
CREATE POLICY "survey_questions_all" ON survey_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM surveys s WHERE s.id = survey_id
        AND (
          s.status = 'active'
          OR s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
          )
          OR EXISTS (
            SELECT 1 FROM page_access_overrides
            WHERE user_id = auth.uid()
              AND page_slug = 'surveys'
              AND is_blocked = false
              AND level = 'manage'
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM surveys s WHERE s.id = survey_id
        AND (
          s.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
          )
          OR EXISTS (
            SELECT 1 FROM page_access_overrides
            WHERE user_id = auth.uid()
              AND page_slug = 'surveys'
              AND is_blocked = false
              AND level = 'manage'
          )
        )
    )
  );

-- ── survey_responses: select + update (review workflow) ───────────────────────

DROP POLICY IF EXISTS "survey_responses_select" ON survey_responses;
CREATE POLICY "survey_responses_select" ON survey_responses FOR SELECT TO authenticated
  USING (
    respondent_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
    OR EXISTS (
      SELECT 1 FROM page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  );

-- Allow manage-override users to update review_status, review_comment, etc.
DROP POLICY IF EXISTS "survey_responses_manage_update" ON survey_responses;
CREATE POLICY "survey_responses_manage_update" ON survey_responses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
    OR EXISTS (
      SELECT 1 FROM page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  );

-- Allow manage-override users to delete responses
DROP POLICY IF EXISTS "survey_responses_manage_delete" ON survey_responses;
CREATE POLICY "survey_responses_manage_delete" ON survey_responses FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
    )
    OR EXISTS (
      SELECT 1 FROM page_access_overrides
      WHERE user_id = auth.uid()
        AND page_slug = 'surveys'
        AND is_blocked = false
        AND level = 'manage'
    )
  );

-- ── survey_answers: select ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "survey_answers_select" ON survey_answers;
CREATE POLICY "survey_answers_select" ON survey_answers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM survey_responses r WHERE r.id = response_id
        AND (
          r.respondent_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid()
              AND role IN ('super_admin','admin','hub_manager','fom','sr_program_officer','country_director')
          )
          OR EXISTS (
            SELECT 1 FROM page_access_overrides
            WHERE user_id = auth.uid()
              AND page_slug = 'surveys'
              AND is_blocked = false
              AND level = 'manage'
          )
        )
    )
  );
