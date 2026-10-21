-- Reply to a message, for databases created before it (schema.sql already has it).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-message-replies.sql
-- Safe to run again.

-- The message this one replies to; SET NULL keeps the reply if the original row ever goes
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES messages (id) ON DELETE SET NULL;
-- Lets Postgres find a message's replies (the SET NULL) without scanning every message
CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx ON messages (reply_to_id);
