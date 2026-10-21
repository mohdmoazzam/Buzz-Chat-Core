-- Profile cover photo, for databases created before it (schema.sql already has it).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-cover-photo.sql
-- Safe to run again.

-- Optional banner behind the profile photo; SET NULL keeps the user if the file is removed
ALTER TABLE users ADD COLUMN IF NOT EXISTS cover_id uuid REFERENCES assets (id) ON DELETE SET NULL;
