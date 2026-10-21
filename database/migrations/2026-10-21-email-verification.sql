-- Email verification on sign-up, for databases created before it (schema.sql already has it).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-email-verification.sql
-- then npm run db:pull

-- Safe to run again: everything is guarded, and the backfill runs only when the column is new
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email_verified_at'
    ) THEN
        ALTER TABLE users ADD COLUMN email_verified_at timestamptz(6);
        -- Accounts that existed before verification are trusted as they are
        UPDATE users SET email_verified_at = created_at;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS email_verifications (
    user_id    uuid           PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text           NOT NULL,
    attempts   integer        NOT NULL DEFAULT 0,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
