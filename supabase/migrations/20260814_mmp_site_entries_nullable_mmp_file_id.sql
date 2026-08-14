-- Fix: mmp_site_entries.mmp_file_id must be nullable for village-campaign entries.
--
-- Village campaigns are not tied to an MMP file, so mmp_file_id is legitimately
-- NULL for rows whose additional_data->>'source' = 'village_campaign'.
-- The column was originally NOT NULL for the standard MMP workflow, but the
-- campaign-dispatch path reuses this table without an MMP file.
--
-- This migration is idempotent: the DROP NOT NULL is a no-op if the column is
-- already nullable.

-- 1. Allow NULL on the column
ALTER TABLE public.mmp_site_entries
  ALTER COLUMN mmp_file_id DROP NOT NULL;

-- 2. Backfill any village-team assignments that failed to get a site_entry_id
--    because the previous run hit the NOT NULL constraint.
DO $$
DECLARE
  rec          RECORD;
  new_entry_id uuid;
BEGIN
  FOR rec IN
    SELECT
      avt.id          AS assignment_id,
      avt.team_id,
      avt.village_id,
      ac.id           AS campaign_id,
      ac.campaign_name,
      ac.mmp_file_id,          -- may legitimately be NULL
      av.village_name,
      av.village_code,
      av.state,
      av.locality,
      at2.team_name
    FROM  public.adhoc_village_teams avt
    JOIN  public.adhoc_campaigns     ac  ON ac.id  = avt.campaign_id
    JOIN  public.adhoc_villages      av  ON av.id  = avt.village_id
    LEFT  JOIN public.adhoc_teams    at2 ON at2.id = avt.team_id
    WHERE avt.site_entry_id IS NULL
      AND ac.deleted_at      IS NULL
  LOOP
    INSERT INTO public.mmp_site_entries (
      mmp_file_id, site_name, site_code, state, locality,
      transport_fee, enumerator_fee, status, additional_data
    ) VALUES (
      rec.mmp_file_id,           -- NULL is now accepted
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
