-- Delete my account (confirmed with an emailed code), for databases created before it
-- (schema.sql already has it). Run once: npx prisma db execute --file database/migrations/2026-10-21-account-deletion.sql
-- Safe to run again.

CREATE TABLE IF NOT EXISTS account_deletions (
    user_id    uuid           PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text           NOT NULL,
    attempts   integer        NOT NULL DEFAULT 0,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
