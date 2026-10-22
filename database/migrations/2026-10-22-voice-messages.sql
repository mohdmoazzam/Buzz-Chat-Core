-- Voice messages, for databases created before them (schema.sql already has them).
-- Run once: npx prisma db execute --file database/migrations/2026-10-22-voice-messages.sql
-- Safe to run again.

-- Voice messages only: length, and the bar heights (0-100) the player draws; other files have null and {}
ALTER TABLE assets ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS waveform smallint[] NOT NULL DEFAULT '{}';
