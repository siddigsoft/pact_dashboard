-- Fix foreign key constraints on notifications table to use ON DELETE SET NULL
-- This prevents "violates foreign key constraint" errors when updating/deleting profiles

-- Drop and re-add triggered_by FK with SET NULL on delete/update
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_triggered_by_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_triggered_by_fkey
  FOREIGN KEY (triggered_by)
  REFERENCES profiles(id)
  ON DELETE SET NULL
  ON UPDATE SET NULL;

-- Also fix user_id FK on notifications if it exists without cascade
ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES profiles(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
