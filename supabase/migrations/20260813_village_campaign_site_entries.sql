-- Village Campaign → mmp_site_entries bridge
-- Each adhoc_village_teams row is linked to an mmp_site_entries row so the
-- full fee / dispatch / payment-tracking flow applies to campaign assignments.
--
-- This migration is safe to run multiple times (uses IF NOT EXISTS / DO blocks).

-- 1. Ensure adhoc_village_teams.site_entry_id column exists
--    (the column was defined in the original 20260812_village_campaigns.sql but
--     may have been skipped on earlier envs — make it idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'adhoc_village_teams'
      AND column_name  = 'site_entry_id'
  ) THEN
    ALTER TABLE public.adhoc_village_teams
      ADD COLUMN site_entry_id uuid REFERENCES public.mmp_site_entries(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 2. Create an index on mmp_site_entries(additional_data->>'campaign_id') so
--    filtering by campaign is fast without a full-table jsonb scan
CREATE INDEX IF NOT EXISTS idx_mmp_site_entries_campaign_id
  ON public.mmp_site_entries
  USING btree ((additional_data->>'campaign_id'));

-- 3. Backfill: for any existing village_team assignment that has no site_entry_id,
--    create an mmp_site_entries row now.
--    This uses a PL/pgSQL block so it's safe to re-run (no duplication).
DO $$
DECLARE
  rec RECORD;
  new_entry_id uuid;
BEGIN
  FOR rec IN
    SELECT
      avt.id          AS assignment_id,
      avt.team_id,
      avt.village_id,
      ac.id           AS campaign_id,
      ac.campaign_name,
      ac.mmp_file_id,
      av.village_name,
      av.village_code,
      av.state,
      av.locality,
      at2.team_name
    FROM public.adhoc_village_teams avt
    JOIN public.adhoc_campaigns      ac  ON ac.id  = avt.campaign_id
    JOIN public.adhoc_villages        av  ON av.id  = avt.village_id
    LEFT JOIN public.adhoc_teams      at2 ON at2.id = avt.team_id
    WHERE avt.site_entry_id IS NULL
      AND ac.deleted_at IS NULL
  LOOP
    INSERT INTO public.mmp_site_entries (
      mmp_file_id, site_name, site_code, state, locality,
      transport_fee, enumerator_fee, status, additional_data
    ) VALUES (
      rec.mmp_file_id,
      rec.village_name,
      rec.village_code,
      rec.state,
      rec.locality,
      0, 0,
      'pending',
      jsonb_build_object(
        'source',        'village_campaign',
        'campaign_id',   rec.campaign_id::text,
        'campaign_name', rec.campaign_name,
        'village_id',    rec.village_id::text,
        'team_id',       rec.team_id::text,
        'team_name',     rec.team_name,
        'assignment_id', rec.assignment_id::text
      )
    )
    RETURNING id INTO new_entry_id;

    UPDATE public.adhoc_village_teams
       SET site_entry_id = new_entry_id
     WHERE id = rec.assignment_id;
  END LOOP;
END$$;
