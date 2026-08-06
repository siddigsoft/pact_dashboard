-- PostgREST ON CONFLICT (user_id, role_id) cannot use the existing
-- partial unique index (WHERE role_id IS NOT NULL). Add a full unique
-- constraint so custom-role upserts succeed.
-- Multiple (user_id, NULL role_id) rows remain allowed under Postgres NULL semantics.
ALTER TABLE public.user_roles
  ADD CONSTRAINT uq_user_roles_user_role_id UNIQUE (user_id, role_id);
