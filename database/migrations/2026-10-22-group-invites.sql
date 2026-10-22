-- Group invite links, for databases created before them (schema.sql already has them).
-- Run once: npx prisma db execute --file database/migrations/2026-10-22-group-invites.sql
-- Safe to run again.

-- At most one active link per group; resetting it replaces the row (and the code)
CREATE TABLE IF NOT EXISTS group_invites (
    chat_id    uuid           PRIMARY KEY REFERENCES chats (id) ON DELETE CASCADE,
    code       text           NOT NULL UNIQUE,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
