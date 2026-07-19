-- Add hub_id to user_roles so additional role assignments can be hub-scoped
-- e.g. a FOM can also be Hub Supervisor for "Blue Nile" hub specifically

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS hub_id TEXT DEFAULT NULL;

-- Index for fast lookups by hub
CREATE INDEX IF NOT EXISTS idx_user_roles_hub_id ON user_roles(hub_id);

COMMENT ON COLUMN user_roles.hub_id IS
  'Optional hub scope for this role assignment. NULL = system-wide role, non-null = role applies only within this hub.';
