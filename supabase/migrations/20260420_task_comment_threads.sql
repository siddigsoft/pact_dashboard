-- Phase 1.4: Task Comments with @Mentions & Threading
-- Enables collaborative task discussions with mentions and nested replies
-- Run date: 2026-04-20

-- Task comment threads table
CREATE TABLE IF NOT EXISTS task_comment_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES task_comment_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  mentions UUID[] DEFAULT '{}', -- Array of mentioned user IDs
  is_pinned BOOLEAN DEFAULT false,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comment_threads(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_parent_id ON task_comment_threads(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_user_id ON task_comment_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comment_threads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_comments_mentions ON task_comment_threads USING GIN (mentions);
CREATE INDEX IF NOT EXISTS idx_task_comments_not_deleted ON task_comment_threads(task_id) WHERE deleted_at IS NULL;

-- Enable RLS for data privacy
ALTER TABLE task_comment_threads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view comments on tasks they're involved with
CREATE POLICY task_comments_select ON task_comment_threads
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = task_comment_threads.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

-- RLS Policy: Users can create comments on tasks they have access to
CREATE POLICY task_comments_insert ON task_comment_threads
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM personal_tasks pt
    WHERE pt.id = task_comment_threads.task_id
    AND (pt.user_id = auth.uid() OR pt.assigned_to = auth.uid())
  )
);

-- RLS Policy: Users can update their own comments
CREATE POLICY task_comments_update ON task_comment_threads
FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can soft-delete their own comments (or admins any)
CREATE POLICY task_comments_delete ON task_comment_threads
FOR UPDATE USING (
  auth.uid() = user_id OR
  EXISTS (
    SELECT 1 FROM auth.users au
    WHERE au.id = auth.uid()
    AND (au.raw_app_meta_data->>'role' IN ('admin', 'superadmin'))
  )
);

-- Table for tracking comment mentions and notifications
CREATE TABLE IF NOT EXISTS comment_mention_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES task_comment_threads(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_by_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES personal_tasks(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for mention notifications
CREATE INDEX IF NOT EXISTS idx_mention_notifs_mentioned_user ON comment_mention_notifications(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_mention_notifs_is_read ON comment_mention_notifications(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_mention_notifs_created_at ON comment_mention_notifications(created_at DESC);

-- Enable RLS on mention notifications
ALTER TABLE comment_mention_notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own mention notifications
CREATE POLICY mention_notifs_select ON comment_mention_notifications
FOR SELECT USING (mentioned_user_id = auth.uid());

-- RLS Policy: Only system can insert
CREATE POLICY mention_notifs_insert ON comment_mention_notifications
FOR INSERT WITH CHECK (true);

-- Function to extract @mentions from comment content
CREATE OR REPLACE FUNCTION extract_mentions_from_content(p_content TEXT)
RETURNS TEXT[] AS $$
DECLARE
  v_mentions TEXT[];
  v_pattern TEXT := '@\[([^\]]+)\]\(([a-f0-9\-]+)\)';
  v_match RECORD;
BEGIN
  FOR v_match IN
    SELECT (regexp_matches(p_content, v_pattern, 'g'))[2] AS user_id
  LOOP
    v_mentions := array_append(v_mentions, v_match.user_id::UUID);
  END LOOP;
  RETURN v_mentions;
END;
$$ LANGUAGE plpgsql;

-- Function to log comment mentions
CREATE OR REPLACE FUNCTION handle_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
  v_mentioned_user UUID;
  v_task_id UUID;
BEGIN
  IF NEW.mentions IS NOT NULL AND array_length(NEW.mentions, 1) > 0 THEN
    -- Get the task_id
    v_task_id := NEW.task_id;
    
    -- Create mention notifications for each mentioned user
    FOREACH v_mentioned_user IN ARRAY NEW.mentions
    LOOP
      INSERT INTO comment_mention_notifications (
        comment_id,
        mentioned_user_id,
        mentioned_by_id,
        task_id
      ) VALUES (
        NEW.id,
        v_mentioned_user,
        NEW.user_id,
        v_task_id
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to handle mentions
DROP TRIGGER IF EXISTS task_comment_mentions_trigger ON task_comment_threads;
CREATE TRIGGER task_comment_mentions_trigger
AFTER INSERT ON task_comment_threads
FOR EACH ROW
EXECUTE FUNCTION handle_comment_mentions();

-- Function to mark mention as read
CREATE OR REPLACE FUNCTION mark_mention_read(p_mention_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE comment_mention_notifications
  SET is_read = true
  WHERE id = p_mention_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get unread mentions for a user
CREATE OR REPLACE FUNCTION get_unread_mentions(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  comment_id UUID,
  mentioned_by_id UUID,
  task_id UUID,
  comment_content TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cmn.id,
    cmn.comment_id,
    cmn.mentioned_by_id,
    cmn.task_id,
    tct.content,
    cmn.created_at
  FROM comment_mention_notifications cmn
  JOIN task_comment_threads tct ON tct.id = cmn.comment_id
  WHERE cmn.mentioned_user_id = p_user_id
    AND cmn.is_read = false
  ORDER BY cmn.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON task_comment_threads TO authenticated;
GRANT SELECT, INSERT ON comment_mention_notifications TO authenticated;
GRANT EXECUTE ON FUNCTION extract_mentions_from_content TO authenticated;
GRANT EXECUTE ON FUNCTION mark_mention_read TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_mentions TO authenticated;
