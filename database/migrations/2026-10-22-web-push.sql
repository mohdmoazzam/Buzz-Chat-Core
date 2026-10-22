-- Web push subscriptions, for databases created before them (schema.sql already has them).
-- Run once: npx prisma db execute --file database/migrations/2026-10-22-web-push.sql
-- Safe to run again.

-- One row per browser that turned on push; goes with the login session, so logging a device out stops its pushes
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         uuid           PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id uuid           NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    endpoint   text           NOT NULL UNIQUE,
    p256dh     text           NOT NULL,
    auth       text           NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_session_id_idx ON push_subscriptions (session_id);
