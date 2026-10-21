-- Sign in with Google, for databases created before it (schema.sql already has it).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-google-sign-in.sql
-- Safe to run again.

-- Google's stable account id ("sub"); null for accounts that never used Google
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id text;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users (google_id);
