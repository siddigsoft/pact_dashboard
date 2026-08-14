-- ============================================================
-- Village Campaign Excel Import: constraints + atomic RPC
-- ============================================================
-- Adds canonical uniqueness for cluster/village names within a
-- campaign so ON CONFLICT upserts work correctly, then defines
-- import_village_campaign_row() which handles one import row
-- atomically: cluster upsert → village upsert → assignment
-- insert → site-entry insert → back-link update, all in a
-- single transaction.  If any step fails the whole row rolls
-- back, so a retry is always safe.
-- ============================================================

-- 1. Canonical uniqueness: one cluster name per campaign
--    (cluster_code is already unique per campaign by convention;
--     this index anchors the ON CONFLICT upsert in the RPC)
CREATE UNIQUE INDEX IF NOT EXISTS adhoc_clusters_campaign_name_idx
  ON adhoc_clusters (campaign_id, cluster_name);

-- 2. Canonical uniqueness: one village name per campaign
--    Allows the import to upsert by name without creating duplicates
CREATE UNIQUE INDEX IF NOT EXISTS adhoc_villages_campaign_name_idx
  ON adhoc_villages (campaign_id, village_name);


-- 3. Atomic per-row import RPC
--
-- Caller passes all fields for one spreadsheet row.  The function:
--   a) Upserts the cluster (if cluster_name provided)
--   b) Upserts the village (linked to cluster)
--   c) Inserts the team assignment with ON CONFLICT DO NOTHING
--   d) If new assignment: inserts mmp_site_entries and links it
--   e) If existing assignment with null site_entry_id: creates the missing entry
--   f) If fully duplicate: optionally updates fees if DB still has zeros
-- Returns jsonb with { action, assignment_id?, site_entry_id?, village_id, cluster_id? }
--
-- SECURITY DEFINER runs as the function owner (bypasses RLS on mmp_site_entries)
-- while still enforcing that the caller is authenticated via auth.uid() checks
-- inside is_village_campaign_admin() wherever we need it.

DROP FUNCTION IF EXISTS import_village_campaign_row(uuid,text,uuid,text,text,text,text,text,text,integer,text,text,uuid,text,text,numeric,numeric);

CREATE OR REPLACE FUNCTION import_village_campaign_row(
  p_campaign_id      uuid,
  p_campaign_name    text,
  p_mmp_file_id      uuid,
  -- Cluster
  p_cluster_name     text,
  p_cluster_code     text,   -- client must always supply a non-null code (see runVillageImport)
  p_cluster_state    text,
  p_cluster_locality text,
  -- Village
  p_village_name     text,
  p_village_code     text,
  p_hh_target        integer,
  p_village_state    text,
  p_village_locality text,
  -- Assignment
  p_team_id          uuid,
  p_activity_name    text,
  p_activity_type    text,
  -- Fees
  p_transport_fee    numeric,
  p_enumerator_fee   numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cluster_id  uuid   := NULL;
  v_village_id  uuid;
  v_assign_id   uuid   := NULL;
  v_site_id     uuid   := NULL;
  v_existing_se uuid   := NULL;
  v_act_name    text   := NULLIF(trim(COALESCE(p_activity_name,'')), '');
  v_act_type    text   := NULLIF(trim(COALESCE(p_activity_type,'')), '');
  v_site_name   text;
  v_tFee        numeric := COALESCE(p_transport_fee,  0);
  v_eFee        numeric := COALESCE(p_enumerator_fee, 0);
  v_auto_code   text;
  v_seq         int;
BEGIN
  -- ── 0. Permission check ──────────────────────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS; we enforce the same role check explicitly so
  -- non-admin authenticated users cannot call this function directly.
  IF NOT is_village_campaign_admin() THEN
    RAISE EXCEPTION 'permission denied: only campaign administrators can import village data'
      USING ERRCODE = '42501';
  END IF;

  -- ── 1. Upsert cluster ────────────────────────────────────────────────────────
  IF p_cluster_name IS NOT NULL AND trim(p_cluster_name) <> '' THEN
    -- Determine the cluster code to use.
    -- The client pre-generates a unique code for each new cluster before calling
    -- the RPC (see runVillageImport). As a safety net, generate one here if the
    -- caller somehow passed NULL/empty.  We use a loop to avoid collisions with
    -- any cluster_code already in this campaign.
    IF p_cluster_code IS NULL OR trim(p_cluster_code) = '' THEN
      SELECT COALESCE(MAX(
        CASE WHEN cluster_code ~ '^CLU-[0-9]+$'
             THEN CAST(substr(cluster_code, 5) AS integer)
             ELSE 0
        END
      ), 0) + 1
      INTO v_seq
      FROM adhoc_clusters WHERE campaign_id = p_campaign_id;

      v_auto_code := 'CLU-' || LPAD(v_seq::text, 2, '0');

      -- Guard against the rare collision when non-standard codes exist
      WHILE EXISTS (
        SELECT 1 FROM adhoc_clusters
        WHERE campaign_id = p_campaign_id AND cluster_code = v_auto_code
          AND cluster_name <> trim(p_cluster_name)
      ) LOOP
        v_seq := v_seq + 1;
        v_auto_code := 'CLU-' || LPAD(v_seq::text, 2, '0');
      END LOOP;
    ELSE
      v_auto_code := trim(p_cluster_code);
    END IF;

    INSERT INTO adhoc_clusters (campaign_id, cluster_name, cluster_code, state, locality)
    VALUES (
      p_campaign_id,
      trim(p_cluster_name),
      v_auto_code,
      NULLIF(trim(COALESCE(p_cluster_state,'')),    ''),
      NULLIF(trim(COALESCE(p_cluster_locality,'')), '')
    )
    ON CONFLICT (campaign_id, cluster_name) DO UPDATE
      -- Only overwrite the code if the import provides a non-auto-generated one
      SET cluster_code = CASE
            WHEN p_cluster_code IS NOT NULL AND trim(p_cluster_code) <> ''
            THEN EXCLUDED.cluster_code
            ELSE adhoc_clusters.cluster_code
          END
    RETURNING id INTO v_cluster_id;

    -- ON CONFLICT DO UPDATE always fires RETURNING; NULL guard for safety.
    IF v_cluster_id IS NULL THEN
      SELECT id INTO v_cluster_id FROM adhoc_clusters
      WHERE campaign_id = p_campaign_id AND cluster_name = trim(p_cluster_name);
    END IF;
  END IF;

  -- ── 2. Upsert village ────────────────────────────────────────────────────────
  INSERT INTO adhoc_villages (campaign_id, village_name, village_code, hh_target, state, locality, cluster_id)
  VALUES (
    p_campaign_id,
    trim(p_village_name),
    COALESCE(NULLIF(trim(COALESCE(p_village_code,'')), ''), 'VLG'),
    COALESCE(p_hh_target, 0),
    NULLIF(trim(COALESCE(p_village_state,'')),    ''),
    NULLIF(trim(COALESCE(p_village_locality,'')), ''),
    v_cluster_id
  )
  ON CONFLICT (campaign_id, village_name) DO UPDATE SET
    -- Preserve cluster linkage: only overwrite if import provides one
    cluster_id = COALESCE(EXCLUDED.cluster_id, adhoc_villages.cluster_id),
    updated_at = now()
  RETURNING id INTO v_village_id;

  -- ── 3. Short-circuit: no team code → cluster/village only ────────────────────
  IF p_team_id IS NULL THEN
    RETURN jsonb_build_object(
      'action',     'village_only',
      'village_id', v_village_id,
      'cluster_id', v_cluster_id
    );
  END IF;

  -- ── 4. Insert assignment (ON CONFLICT DO NOTHING handles both partial indexes) ──
  v_site_name := CASE WHEN v_act_name IS NOT NULL
    THEN trim(p_village_name) || ' — ' || v_act_name
    ELSE trim(p_village_name)
  END;

  INSERT INTO adhoc_village_teams
    (campaign_id, village_id, team_id, activity_name, activity_type, hh_target_for_team)
  VALUES
    (p_campaign_id, v_village_id, p_team_id, v_act_name, v_act_type, NULL)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_assign_id;

  IF v_assign_id IS NULL THEN
    -- Conflict: assignment already exists — find the existing row
    IF v_act_name IS NOT NULL THEN
      SELECT id, site_entry_id INTO v_assign_id, v_existing_se
      FROM adhoc_village_teams
      WHERE campaign_id   = p_campaign_id
        AND village_id    = v_village_id
        AND team_id       = p_team_id
        AND activity_name = v_act_name;
    ELSE
      SELECT id, site_entry_id INTO v_assign_id, v_existing_se
      FROM adhoc_village_teams
      WHERE campaign_id   = p_campaign_id
        AND village_id    = v_village_id
        AND team_id       = p_team_id
        AND activity_name IS NULL;
    END IF;

    IF v_existing_se IS NULL THEN
      -- ── Case A: assignment exists but site entry is missing (partial previous import) ──
      -- Create + link in this transaction so a retry is clean
      INSERT INTO mmp_site_entries
        (mmp_file_id, site_name, site_code, state, locality, transport_fee, enumerator_fee, status, additional_data)
      VALUES (
        p_mmp_file_id, v_site_name,
        NULLIF(trim(COALESCE(p_village_code,'')),     ''),
        NULLIF(trim(COALESCE(p_village_state,'')),    ''),
        NULLIF(trim(COALESCE(p_village_locality,'')), ''),
        v_tFee, v_eFee, 'pending',
        jsonb_build_object(
          'source',        'village_campaign',
          'campaign_id',   p_campaign_id,   'campaign_name', p_campaign_name,
          'village_id',    v_village_id,    'village_name',  trim(p_village_name),
          'team_id',       p_team_id,       'assignment_id', v_assign_id,
          'activity_name', v_act_name,      'activity_type', v_act_type,
          'cluster_id',    v_cluster_id,    'cluster_name',  NULLIF(trim(COALESCE(p_cluster_name,'')), '')
        )
      )
      RETURNING id INTO v_site_id;

      UPDATE adhoc_village_teams SET site_entry_id = v_site_id WHERE id = v_assign_id;

      RETURN jsonb_build_object(
        'action',        'repaired',
        'assignment_id', v_assign_id,
        'site_entry_id', v_site_id
      );
    ELSE
      -- ── Case B: fully duplicate row — update fees if DB still has zeros ──
      UPDATE mmp_site_entries
         SET transport_fee  = v_tFee,
             enumerator_fee = v_eFee
       WHERE id             = v_existing_se
         AND transport_fee  = 0
         AND enumerator_fee = 0
         AND (v_tFee > 0 OR v_eFee > 0);

      RETURN jsonb_build_object(
        'action',        'skipped',
        'assignment_id', v_assign_id,
        'site_entry_id', v_existing_se
      );
    END IF;
  END IF;

  -- ── 5. New assignment: insert site entry and link, all in same transaction ────
  INSERT INTO mmp_site_entries
    (mmp_file_id, site_name, site_code, state, locality, transport_fee, enumerator_fee, status, additional_data)
  VALUES (
    p_mmp_file_id, v_site_name,
    NULLIF(trim(COALESCE(p_village_code,'')),     ''),
    NULLIF(trim(COALESCE(p_village_state,'')),    ''),
    NULLIF(trim(COALESCE(p_village_locality,'')), ''),
    v_tFee, v_eFee, 'pending',
    jsonb_build_object(
      'source',        'village_campaign',
      'campaign_id',   p_campaign_id,   'campaign_name', p_campaign_name,
      'village_id',    v_village_id,    'village_name',  trim(p_village_name),
      'team_id',       p_team_id,       'assignment_id', v_assign_id,
      'activity_name', v_act_name,      'activity_type', v_act_type,
      'cluster_id',    v_cluster_id,    'cluster_name',  NULLIF(trim(COALESCE(p_cluster_name,'')), '')
    )
  )
  RETURNING id INTO v_site_id;

  -- Link site entry back to assignment — same transaction, cannot be orphaned
  UPDATE adhoc_village_teams SET site_entry_id = v_site_id WHERE id = v_assign_id;

  RETURN jsonb_build_object(
    'action',        'created',
    'assignment_id', v_assign_id,
    'site_entry_id', v_site_id,
    'village_id',    v_village_id,
    'cluster_id',    v_cluster_id
  );
END;
$$;

-- Allow authenticated users to call the function.
-- RLS on underlying tables is bypassed (SECURITY DEFINER) so the function
-- can write to mmp_site_entries without the caller needing that table's policies.
GRANT EXECUTE ON FUNCTION import_village_campaign_row TO authenticated;
