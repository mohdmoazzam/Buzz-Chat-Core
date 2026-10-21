-- Link previews, for databases created before them (schema.sql already has it).
-- Run once: npx prisma db execute --file database/migrations/2026-10-21-link-previews.sql
-- Safe to run again.

-- { url, title, description, image, site_name } for the first link in the text,
-- filled in by the link-preview queue job a moment after sending; null when there's none
ALTER TABLE messages ADD COLUMN IF NOT EXISTS link_preview jsonb;
