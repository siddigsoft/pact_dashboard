-- Add broadcast_id to whatsapp_logs for deterministic per-broadcast attribution
ALTER TABLE whatsapp_logs ADD COLUMN IF NOT EXISTS broadcast_id TEXT;
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_broadcast_id ON whatsapp_logs (broadcast_id) WHERE broadcast_id IS NOT NULL;
