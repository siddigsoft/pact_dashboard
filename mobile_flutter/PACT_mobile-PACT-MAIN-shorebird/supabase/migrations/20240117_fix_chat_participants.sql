-- Fix chat participants table and related issues
-- This migration ensures chat functionality works properly

-- Ensure chat_messages table exists with proper structure
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id TEXT NOT NULL,
    sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    message_text TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id ON chat_messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sent_at ON chat_messages(sent_at DESC);

-- Enable RLS for chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS policies for chat_messages
CREATE POLICY "Users can view messages in their chats"
    ON chat_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM chat_contacts
            WHERE chat_contacts.chat_id = chat_messages.chat_id
            AND chat_contacts.user_id = auth.uid()
        )
        OR sender_id = auth.uid()
    );

CREATE POLICY "Users can insert messages to their chats"
    ON chat_messages FOR INSERT
    WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update their own messages"
    ON chat_messages FOR UPDATE
    USING (sender_id = auth.uid());

-- Ensure chat_contacts has proper indexes (added in previous migration)
-- This is just a safety check
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_chat_contacts_user_id'
    ) THEN
        CREATE INDEX idx_chat_contacts_user_id ON chat_contacts(user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_chat_contacts_contact_user_id'
    ) THEN
        CREATE INDEX idx_chat_contacts_contact_user_id ON chat_contacts(contact_user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_chat_contacts_chat_id'
    ) THEN
        CREATE INDEX idx_chat_contacts_chat_id ON chat_contacts(chat_id);
    END IF;
END $$;

-- Add comments
COMMENT ON TABLE chat_messages IS 'Individual chat messages between users';
COMMENT ON COLUMN chat_messages.chat_id IS 'Identifier for the chat conversation';
COMMENT ON COLUMN chat_messages.is_read IS 'Whether the message has been read by recipient';
