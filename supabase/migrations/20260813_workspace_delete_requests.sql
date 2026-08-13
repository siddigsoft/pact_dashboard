-- Migration: workspace delete request queue
-- Instead of direct deletion, users submit a request.
-- The folder owner (or super admin) approves or rejects.
-- Idempotent — safe to run more than once.

CREATE TABLE IF NOT EXISTS workspace_delete_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  type            text        NOT NULL CHECK (type IN ('file', 'folder')),
  target_id       uuid        NOT NULL,
  target_name     text        NOT NULL,
  -- folder_id = the folder that contains the item (parent of a deleted folder, or file's folder_id).
  -- NULL means the item lives at the root level; super admin is the implicit owner.
  folder_id       uuid        REFERENCES workspace_folders(id) ON DELETE CASCADE,
  folder_name     text,
  -- folder_owner_id is denormalised at request time so the query "show me requests I need to review"
  -- doesn't require a join on workspace_folders.
  folder_owner_id uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  requested_by    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_at    timestamptz NOT NULL DEFAULT now(),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by     uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at     timestamptz,
  review_notes    text
);

-- Index: folder owners quickly find their pending queue
CREATE INDEX IF NOT EXISTS idx_wdr_owner_pending
  ON workspace_delete_requests (folder_owner_id, status)
  WHERE status = 'pending';

-- RLS
ALTER TABLE workspace_delete_requests ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can INSERT a new request
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspace_delete_requests' AND policyname='wdr_insert_auth') THEN
    EXECUTE $p$
      CREATE POLICY wdr_insert_auth ON workspace_delete_requests
        FOR INSERT TO authenticated WITH CHECK (true)
    $p$;
  END IF;
END $$;

-- The requester, the folder owner, and super admins can SELECT
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspace_delete_requests' AND policyname='wdr_select') THEN
    EXECUTE $p$
      CREATE POLICY wdr_select ON workspace_delete_requests
        FOR SELECT TO authenticated
        USING (
          requested_by = auth.uid()
          OR folder_owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin','SuperAdmin')
          )
        )
    $p$;
  END IF;
END $$;

-- Folder owner and super admins can UPDATE (approve/reject)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspace_delete_requests' AND policyname='wdr_update_owner') THEN
    EXECUTE $p$
      CREATE POLICY wdr_update_owner ON workspace_delete_requests
        FOR UPDATE TO authenticated
        USING (
          folder_owner_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles p WHERE p.id = auth.uid()
            AND p.role IN ('super_admin','SuperAdmin')
          )
        )
        WITH CHECK (true)
    $p$;
  END IF;
END $$;
