-- BuzzChat database schema. This file is the source of truth (DB-first):
--   1. change this file (or the database directly)
--   2. npm run db:apply   -- runs this file against DIRECT_URL (fresh database)
--   3. npm run db:pull    -- introspects into prisma/schema.prisma and regenerates the client

-- Ids are UUID v7 (time-ordered; uuidv7() is built into Postgres 18+)

-- Case-insensitive usernames and emails ("John" and "john" are the same)
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE gender AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');
CREATE TYPE request_status AS ENUM ('pending', 'accepted', 'rejected');

-- Keeps updated_at current on every UPDATE
CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Every uploaded file (POST /api/v1/assets). Other tables point here by id.
CREATE TABLE assets (
    id            uuid           PRIMARY KEY DEFAULT uuidv7(),
    -- Cloudinary's id, used to delete the file
    public_id     text           NOT NULL UNIQUE,
    url           text           NOT NULL,
    -- Cloudinary resource type: image, video or raw
    resource_type text           NOT NULL,
    mime_type     text           NOT NULL,
    size_bytes    integer        NOT NULL,
    original_name text           NOT NULL,
    -- Voice messages only: length, and the bar heights (0-100) the player draws; other files have null and {}
    duration_ms   integer,
    waveform      smallint[]     NOT NULL DEFAULT '{}',
    -- null for uploads made before signing up (the register avatar)
    uploaded_by   uuid,
    created_at    timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id               uuid           PRIMARY KEY DEFAULT uuidv7(),
    email            citext         NOT NULL UNIQUE,
    first_name       text           NOT NULL,
    last_name        text           NOT NULL DEFAULT '',
    bio              text           NOT NULL,
    username         citext         NOT NULL UNIQUE,
    gender           gender,
    phone            text,
    password         text           NOT NULL,
    -- RESTRICT: an asset can't be deleted while it is someone's profile photo
    avatar_id        uuid           NOT NULL REFERENCES assets (id) ON DELETE RESTRICT,
    -- Optional banner behind the profile photo
    cover_id         uuid           REFERENCES assets (id) ON DELETE SET NULL,
    -- null until the sign-up code is entered; unverified accounts can only verify or log out
    email_verified_at timestamptz(6),
    -- Google's account id ("sub") once the user signs in with Google; null otherwise
    google_id        text           UNIQUE,
    created_at       timestamptz(6) NOT NULL DEFAULT now(),
    updated_at       timestamptz(6) NOT NULL DEFAULT now()
);

-- assets and users point at each other, so this key is added after both exist
ALTER TABLE assets
    ADD CONSTRAINT assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL;
CREATE INDEX assets_uploaded_by_idx ON assets (uploaded_by);

CREATE TABLE chats (
    id               uuid           PRIMARY KEY DEFAULT uuidv7(),
    name             text           NOT NULL,
    description      text           NOT NULL DEFAULT '',
    -- Group picture (1:1 chats show the other person's photo)
    avatar_id        uuid           REFERENCES assets (id) ON DELETE SET NULL,
    group_chat       boolean        NOT NULL DEFAULT false,
    -- "<smallerUserId>:<largerUserId>" for 1:1 chats, so a pair can only ever have one chat
    direct_key       text           UNIQUE,
    -- Disappearing messages: new messages expire this many seconds after sending (null = off)
    disappearing_seconds integer,
    -- Group admin; for 1:1 chats, the person who sent the friend request
    creator_id       uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at       timestamptz(6) NOT NULL DEFAULT now(),
    -- Bumped on every new message, so chat lists sort by latest activity
    updated_at       timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE chat_members (
    chat_id   uuid           NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    user_id   uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    joined_at timestamptz(6) NOT NULL DEFAULT now(),
    -- Read everything up to here (a message's created_at): unread counts and read receipts.
    -- Starts at join time, so new members don't inherit the backlog as unread.
    last_read_at timestamptz(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (chat_id, user_id)
);
-- Listing a user's chats
CREATE INDEX chat_members_user_id_idx ON chat_members (user_id);

-- Group invite links: at most one active link per group; resetting it replaces the row (and the code)
CREATE TABLE group_invites (
    chat_id    uuid           PRIMARY KEY REFERENCES chats (id) ON DELETE CASCADE,
    -- Random, URL-safe; the link is <client>/join/<code>
    code       text           NOT NULL UNIQUE,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

CREATE TABLE messages (
    id          uuid           PRIMARY KEY DEFAULT uuidv7(),
    chat_id     uuid           NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
    sender_id   uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    content     text           NOT NULL DEFAULT '',
    -- Copied from another chat (shows a "Forwarded" label)
    forwarded   boolean        NOT NULL DEFAULT false,
    -- The message this one replies to (same chat); SET NULL keeps the reply if that row goes
    reply_to_id uuid           REFERENCES messages (id) ON DELETE SET NULL,
    -- { url, title, description, image, site_name } of the first link, filled in by a queue job
    link_preview jsonb,
    -- Set when the chat has disappearing messages on; the cleanup job deletes the row after it
    expires_at  timestamptz(6),
    -- Set when the sender edits the text
    edited_at   timestamptz(6),
    -- Set when the sender deletes it for everyone; the row stays as a placeholder
    deleted_at  timestamptz(6),
    created_at  timestamptz(6) NOT NULL DEFAULT now(),
    updated_at  timestamptz(6) NOT NULL DEFAULT now()
);
-- Paginating a chat's history newest-first, and the last-message preview
CREATE INDEX messages_chat_id_created_at_idx ON messages (chat_id, created_at DESC);
-- Admin stats and message list
CREATE INDEX messages_created_at_idx ON messages (created_at);
-- A message's replies (for the SET NULL above)
CREATE INDEX messages_reply_to_id_idx ON messages (reply_to_id);
-- Disappearing messages: the cleanup job's lookup
CREATE INDEX messages_expires_at_idx ON messages (expires_at);

-- Files attached to a message, in the order they were sent
CREATE TABLE message_attachments (
    message_id uuid    NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    asset_id   uuid    NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
    position   integer NOT NULL,
    PRIMARY KEY (message_id, asset_id)
);
CREATE INDEX message_attachments_asset_id_idx ON message_attachments (asset_id);

-- Emoji reactions: one per person per message (a new emoji replaces theirs)
CREATE TABLE message_reactions (
    message_id uuid           NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    emoji      text           NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_reactions_user_id_idx ON message_reactions (user_id);

-- Delete for me: messages a user removed only for themselves
CREATE TABLE message_hidden (
    message_id uuid           NOT NULL REFERENCES messages (id) ON DELETE CASCADE,
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz(6) NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);
CREATE INDEX message_hidden_user_id_idx ON message_hidden (user_id);

CREATE TABLE friend_requests (
    id          uuid           PRIMARY KEY DEFAULT uuidv7(),
    sender_id   uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    receiver_id uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status      request_status NOT NULL DEFAULT 'pending',
    created_at  timestamptz(6) NOT NULL DEFAULT now(),
    updated_at  timestamptz(6) NOT NULL DEFAULT now(),
    -- One request per direction
    UNIQUE (sender_id, receiver_id)
);
-- Notifications: requests sent to a user, newest first
CREATE INDEX friend_requests_receiver_id_created_at_idx ON friend_requests (receiver_id, created_at DESC);

-- Forgot password: at most one pending code per user; a new request replaces it
CREATE TABLE password_resets (
    user_id    uuid           PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    -- bcrypt hash of the 6-digit code (the code itself is only in the email)
    code_hash  text           NOT NULL,
    -- Wrong guesses so far; the code stops working after OTP_MAX_ATTEMPTS
    attempts   integer        NOT NULL DEFAULT 0,
    expires_at timestamptz(6) NOT NULL,
    -- When the code was sent (resend cooldown)
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- Email verification on sign-up: same shape as password_resets, one pending code per user
CREATE TABLE email_verifications (
    user_id    uuid           PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text           NOT NULL,
    attempts   integer        NOT NULL DEFAULT 0,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- Delete my account: the emailed confirmation code, same shape as password_resets
CREATE TABLE account_deletions (
    user_id    uuid           PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    code_hash  text           NOT NULL,
    attempts   integer        NOT NULL DEFAULT 0,
    expires_at timestamptz(6) NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);

-- Logged-in devices: one row per login. The session JWT carries the row id (sid),
-- so deleting a row logs that device out (core/session.service.ts)
CREATE TABLE sessions (
    id           uuid           PRIMARY KEY DEFAULT uuidv7(),
    user_id      uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Parsed from the User-Agent at login, e.g. "Chrome", "Windows 11", "mobile"
    browser      text,
    os           text,
    device_type  text,
    user_agent   text           NOT NULL DEFAULT '',
    ip           text,
    created_at   timestamptz(6) NOT NULL DEFAULT now(),
    -- Refreshed at most every SESSION_TOUCH_INTERVAL_MS, not on every request
    last_seen_at timestamptz(6) NOT NULL DEFAULT now(),
    expires_at   timestamptz(6) NOT NULL
);
CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- Web push: one row per browser that turned on push notifications (the browser's PushSubscription).
-- Goes with the login session, so logging a device out stops its pushes.
CREATE TABLE push_subscriptions (
    id         uuid           PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_id uuid           NOT NULL REFERENCES sessions (id) ON DELETE CASCADE,
    -- The browser vendor's push service URL for this device
    endpoint   text           NOT NULL UNIQUE,
    -- Keys the payload is encrypted with
    p256dh     text           NOT NULL,
    auth       text           NOT NULL,
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
-- Sending to a user's devices
CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions (user_id);
-- Deleting a session (the cascade above)
CREATE INDEX push_subscriptions_session_id_idx ON push_subscriptions (session_id);

-- In-app notifications, written by the in-app queue worker (modules/notification)
CREATE TABLE notifications (
    id         uuid           PRIMARY KEY DEFAULT uuidv7(),
    user_id    uuid           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    -- Who caused it (e.g. the friend who accepted); null for system notifications
    actor_id   uuid           REFERENCES users (id) ON DELETE SET NULL,
    -- friend_request_accepted, group_added, ... (InAppTemplateData in notification.types.ts)
    type       text           NOT NULL,
    title      text           NOT NULL,
    body       text           NOT NULL DEFAULT '',
    -- Type-specific extras, e.g. { "chat_id": "..." }
    data       jsonb          NOT NULL DEFAULT '{}',
    read_at    timestamptz(6),
    created_at timestamptz(6) NOT NULL DEFAULT now()
);
-- A user's inbox, newest first (also serves the unread count)
CREATE INDEX notifications_user_id_created_at_idx ON notifications (user_id, created_at DESC);

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER chats_set_updated_at BEFORE UPDATE ON chats
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER messages_set_updated_at BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER friend_requests_set_updated_at BEFORE UPDATE ON friend_requests
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
