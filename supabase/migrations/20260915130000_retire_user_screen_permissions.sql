-- Phase 2 item 4: retire legacy user_screen_permissions from authorization.
-- 1) Migrate useful screen rows into typed page_access_overrides (no overwrite).
-- 2) Make user_screen_permissions read-only for authenticated clients.
-- Runtime evaluators must not read this table after this migration.

-- ── Migrate blocked / explicit screen grants into page_access_overrides ─────
DO $$
DECLARE
  rec record;
  screen jsonb;
  slug text;
  is_visible boolean;
  perms jsonb;
  notes_text text;
  is_blocked boolean;
  migrated int := 0;
BEGIN
  IF to_regclass('public.user_screen_permissions') IS NULL THEN
    RAISE NOTICE 'user_screen_permissions missing — skip migrate';
    RETURN;
  END IF;

  FOR rec IN
    SELECT user_id, screens, updated_by
    FROM public.user_screen_permissions
  LOOP
    IF rec.screens IS NULL THEN
      CONTINUE;
    END IF;

    FOR screen IN
      SELECT * FROM jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(rec.screens::jsonb) = 'array' THEN rec.screens::jsonb
          ELSE '[]'::jsonb
        END
      )
    LOOP
      slug := nullif(trim(coalesce(screen->>'screenId', '')), '');
      IF slug IS NULL THEN
        CONTINUE;
      END IF;

      -- Skip if typed override already exists for this user+slug.
      IF EXISTS (
        SELECT 1 FROM public.page_access_overrides pao
        WHERE pao.user_id = rec.user_id AND pao.page_slug = slug
      ) THEN
        CONTINUE;
      END IF;

      is_visible := coalesce((screen->>'isVisible')::boolean, true);
      perms := coalesce(screen->'permissions', '{}'::jsonb);
      is_blocked := (NOT is_visible) OR (coalesce((perms->>'read')::boolean, false) = false
        AND coalesce((perms->>'write')::boolean, false) = false
        AND coalesce((perms->>'create')::boolean, false) = false
        AND coalesce((perms->>'delete')::boolean, false) = false
        AND coalesce((perms->>'open')::boolean, false) = false);

      -- Only migrate rows that encode an explicit decision (block or any grant).
      IF is_visible AND NOT (
        coalesce((perms->>'read')::boolean, false)
        OR coalesce((perms->>'write')::boolean, false)
        OR coalesce((perms->>'create')::boolean, false)
        OR coalesce((perms->>'delete')::boolean, false)
        OR coalesce((perms->>'open')::boolean, false)
      ) THEN
        CONTINUE;
      END IF;

      IF is_blocked THEN
        notes_text := '{"r":false,"w":false,"c":false,"d":false,"migrated_from":"user_screen_permissions"}';
      ELSE
        notes_text := json_build_object(
          'r', coalesce((perms->>'read')::boolean, false) OR coalesce((perms->>'open')::boolean, false),
          'w', coalesce((perms->>'write')::boolean, false),
          'c', coalesce((perms->>'create')::boolean, false),
          'd', coalesce((perms->>'delete')::boolean, false),
          'migrated_from', 'user_screen_permissions'
        )::text;
      END IF;

      INSERT INTO public.page_access_overrides (
        user_id, page_slug, is_blocked, notes, granted_by, level
      ) VALUES (
        rec.user_id,
        slug,
        is_blocked,
        notes_text,
        rec.updated_by,
        CASE
          WHEN is_blocked THEN 'view'
          WHEN coalesce((perms->>'write')::boolean, false)
            OR coalesce((perms->>'create')::boolean, false)
            OR coalesce((perms->>'delete')::boolean, false)
            THEN 'manage'
          ELSE 'view'
        END
      );
      migrated := migrated + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Migrated % user_screen_permissions entries into page_access_overrides', migrated;
END $$;

-- ── Lock table to read-only for authenticated (select policies only) ────────
DO $$
BEGIN
  IF to_regclass('public.user_screen_permissions') IS NULL THEN
    RETURN;
  END IF;

  -- Drop write-capable all-command policy; keep/add select-only policies.
  DROP POLICY IF EXISTS "Super admins can manage all permissions" ON public.user_screen_permissions;
  DROP POLICY IF EXISTS user_screen_permissions_select_own ON public.user_screen_permissions;
  DROP POLICY IF EXISTS user_screen_permissions_select_admin ON public.user_screen_permissions;
  DROP POLICY IF EXISTS "Users can read own permissions" ON public.user_screen_permissions;

  CREATE POLICY user_screen_permissions_select_own ON public.user_screen_permissions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

  CREATE POLICY user_screen_permissions_select_admin ON public.user_screen_permissions
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
          AND lower(replace(coalesce(p.role, ''), ' ', '')) IN ('superadmin', 'super_admin', 'admin', 'ict')
      )
      OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
    );

  COMMENT ON TABLE public.user_screen_permissions IS
    'LEGACY READ-ONLY. Migrated into page_access_overrides. Do not use for runtime authorization.';
END $$;
