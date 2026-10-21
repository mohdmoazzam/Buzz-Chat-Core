-- Emoji reactions, for databases created before them (schema.sql already has them).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-message-reactions.sql
-- Safe to run again.

-- One reaction per person per message (a new emoji replaces theirs); go with the message or the user
CREATE TABLE IF NOT EXISTS message_reactions (
    message_id uuid           NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emoji      text           NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
-- Deleting a user removes their reactions (the primary key only helps by message)
CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx ON message_reactions (user_id);
