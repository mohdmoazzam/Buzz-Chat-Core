-- Delete for me, for databases created before it (schema.sql already has it).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-delete-for-me.sql
-- Safe to run again.

-- Messages a user removed only for themselves; everyone else still sees them
CREATE TABLE IF NOT EXISTS message_hidden (
    message_id uuid           NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_hidden_user_id_idx ON message_hidden (user_id);
