-- Disappearing messages, for databases created before them (schema.sql already has them).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-disappearing-messages.sql
-- Safe to run again.

-- The chat's timer in seconds; null = off. New messages get expires_at = sent + this
ALTER TABLE chats ADD COLUMN IF NOT EXISTS disappearing_seconds integer;
-- When the message is deleted by the cleanup job; null = kept
ALTER TABLE messages ADD COLUMN IF NOT EXISTS expires_at timestamptz(6);
-- The cleanup job's "what's expired" lookup
CREATE INDEX IF NOT EXISTS messages_expires_at_idx ON messages (expires_at);
