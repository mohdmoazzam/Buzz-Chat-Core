# BuzzChat features

Everything BuzzChat does today, what the user sees and how it works on the server.
All REST routes are under `/api/v1`. Interactive API docs are at `/api/docs` (Swagger; on by default outside production).

- [Accounts and authentication](#accounts-and-authentication)
- [Profiles](#profiles)
- [Friends](#friends)
- [Chats](#chats)
- [Group chats](#group-chats)
- [Messages](#messages)
- [Files and attachments](#files-and-attachments)
- [Real-time (Socket.IO)](#real-time-socketio)
- [Notifications](#notifications)
- [Admin panel](#admin-panel)
- [Security and limits](#security-and-limits)
- [Operations](#operations)

---

## Accounts and authentication

| Feature | Details |
|---|---|
| **Sign up** | Email, first/last name, username, bio, password and a required profile photo. The photo is uploaded first (`POST /assets`, works logged out), then its id is sent with the form. |
| **Welcome email** | Queued after sign-up (template `welcome`). A queue outage never fails sign-up. |
| **Log in** | Username + password. Returns a session token as an httpOnly cookie *and* in the body (for the `Authorization: Bearer` header). Sessions last 15 days. |
| **Log out** | Clears the cookie; works even with an expired session. |
| **Forgot password** | Enter your email → a 6-digit code is emailed (template `password-reset`) → enter the code and a new password. |
| **Case-insensitive identity** | Usernames and emails are `citext`: `John` and `john` are the same account. |

**Forgot password rules**

- Codes are stored only as a bcrypt hash (`password_resets` table), one pending code per user; a new request replaces the old code.
- A code expires after **10 minutes** and stops working after **5 wrong guesses**. Wrong guesses report how many attempts are left.
- A new code can be requested once a **minute**.
- The response is the same whether or not the email has an account.

| Route | Purpose |
|---|---|
| `POST /user/register` | Create an account |
| `POST /user/login` | Log in |
| `POST /user/logout` | Log out (ends this device's session) |
| `GET /user/sessions` | Logged-in devices; this one has `current: true` |
| `DELETE /user/sessions/:id` | Log out one device |
| `DELETE /user/sessions/others` | Log out every device except this one |
| `DELETE /user/sessions` | Log out everywhere, this device included |
| `POST /user/forgot-password` | `{ email }`: send a reset code |
| `POST /user/reset-password` | `{ email, otp, password }`: set a new password |

**Development only:** with `NODE_ENV=development` and `DEV_MASTER_PASSWORD` (12+ characters) set, requests from the local machine can log in as any user with that password. It never works on a deployed server.

## Profiles

| Feature | Details |
|---|---|
| **View my profile** | `GET /user/me` |
| **Edit profile** | `PUT /user/me`: first/last name, bio, username, gender, phone, profile photo. The old photo is deleted from storage when replaced. |
| **Username availability** | `GET /user/check-username?username=` checks live while typing. |

Rules: usernames are 3–20 characters (letters, numbers, `_`, `.`); passwords are 8–72 characters; names up to 50 and bio up to 160 characters; phone is 7–15 digits with an optional `+`.

## Friends

| Feature | Details |
|---|---|
| **Find people** | `GET /user/search?search=&page=&take=`: paginated search by name or username. Each result shows the relationship: `friend` (with its chat id), `sent`, `received` or none. |
| **Send a friend request** | `POST /user/friend-requests` `{ user_id }`. The receiver gets a live `NEW_REQUEST` event and a badge on the bell. |
| **Accept / decline** | `PUT /user/friend-requests/:id` `{ accept }`. Accepting creates the 1:1 chat and notifies the sender in-app ("accepted your friend request"). |
| **Pending requests** | `GET /user/friend-requests` (shown in the bell dropdown). |
| **Friends list** | `GET /user/friends?chat_id=`. With `chat_id`, leaves out people already in that group (for "Add members"). |

A pair of users can only ever have one 1:1 chat, enforced by a unique `direct_key`.

## Chats

| Feature | Details |
|---|---|
| **Chat list** | `GET /chat?page=&take=&search=&order_by=&order=`: infinite scroll, newest activity first, with a last-message preview. Searching matches the group name or the other person's name. |
| **Live chat list** | New messages move a chat to the top and update its preview without a reload. |
| **Unread badges** | Each chat in the list has `unread_count`, counted on the server, so it's right on every device, after a reload and for messages that arrived while offline. Live updates come from `NEW_MESSAGE_ALERT` / `MESSAGES_READ`. |
| **Unread total** | `GET /chat/unread-count` across all chats; shown in the browser tab title, e.g. "(3) BuzzChat". |
| **Read receipts** | On your own messages: ✓ sent, ✓✓ seen. In groups ✓✓ means everyone who was in the group when you sent it has seen it, and the tooltip says "Seen by 2 of 4". Updates live. |
| **Marking as read** | A chat counts as read while it's open and the tab is visible (on open, as messages arrive, and when you come back to the tab). Sending a message also marks the chat read. Reading on one device clears the badge on all of them. |
| **Chat details** | `GET /chat/:id?populate=true` with members. |
| **Mark read (REST)** | `POST /chat/:id/read`: same as the `CHAT_READ` socket event; returns the new `read_at` or `null` if nothing was new. |
| **Delete chat** | `DELETE /chat/:id`: any member can delete a 1:1 chat; only the admin can delete a group. Messages and their files are removed too. |
| **Online status** | Contacts see who is online; a user with several tabs or devices stays online until the last one closes. |
| **Typing indicator** | "is typing…" shown to the other members. |

## Group chats

| Feature | Details |
|---|---|
| **Create a group** | `POST /chat/groups`: name, description, optional picture, 3–15 members (including you). Only friends can be added. Each added member gets an in-app notification. |
| **My groups** | `GET /chat/groups`: groups you created and manage (Manage groups page). |
| **Edit group** | `PUT /chat/:id`: name, description, picture (admin only). |
| **Add members** | `POST /chat/:id/members` (admin only, friends only, max 15). New members get an in-app notification. |
| **Remove a member** | `DELETE /chat/:id/members/:userId` (admin only). |
| **Leave a group** | `DELETE /chat/:id/members/me`. |
| **System alerts** | "Welcome to …", "X was added", "X left the group" appear live in the chat (`ALERT`). |

The group creator is the admin.

## Messages

| Feature | Details |
|---|---|
| **Send text** | Over the socket (`NEW_MESSAGE`), up to 4,000 characters. The server checks membership and acknowledges with the saved message id. |
| **History** | `GET /chat/:id/messages?page=`: 20 per page, loaded upward as you scroll. Also returns `read_receipts` (`user_id`, `last_read_at`, `joined_at` for the other members). |
| **Edit** | `PATCH /chat/:id/messages/:messageId`: your own messages, within **15 minutes** of sending. Shown as "edited". |
| **Delete for everyone** | `DELETE /chat/:id/messages/:messageId`: the message becomes a "deleted" placeholder; files no other message uses are removed. |
| **Forward** | `POST /chat/:id/messages/:messageId/forward` `{ chat_ids }`: up to 5 chats at once, with text and files. Shown as "Forwarded"; files are shared, not uploaded again. |
| **Copy** | From the message menu (client side). |

Live updates: `NEW_MESSAGE`, `MESSAGE_UPDATED` and `MESSAGE_DELETED` keep open chats and chat previews in sync.

**How read state is stored:** one column, `chat_members.last_read_at` ("read everything up to here"). Unread = messages from others after it, not deleted. Seen = a message's `created_at` ≤ the member's `last_read_at`. It is always set to a message's own `created_at`, never the clock, so the comparisons can't drift. New members start at their join time, so they don't inherit a group's backlog as unread.

## Files and attachments

| Feature | Details |
|---|---|
| **Upload** | `POST /assets` (multipart field `files`): up to **5 files, 5 MB each**, stored on Cloudinary. Returns asset ids. |
| **Send attachments** | `POST /chat/:id/messages` `{ attachment_ids }`: images, video, audio and documents, previewed in the chat. |
| **Ownership checks** | An asset can only be used by the person who uploaded it, and only once (a sign-up avatar is claimed by the new account). |
| **Cleanup** | Files are removed from Cloudinary when their message, chat or old avatar is deleted, or when saving the upload fails. |

## Real-time (Socket.IO)

The client connects with the session token (handshake `auth.token` or the session cookie). Every socket joins a per-user room, so all of a user's tabs and devices get every event.

| Event | Direction | Meaning |
|---|---|---|
| `NEW_MESSAGE` | client → server | Send a text message (with acknowledgement) |
| `NEW_MESSAGE` | server → client | A new message in one of your chats |
| `NEW_MESSAGE_ALERT` | server → client | Increment a chat's unread badge |
| `MESSAGE_UPDATED` / `MESSAGE_DELETED` | server → client | A message was edited / deleted for everyone |
| `CHAT_READ` | client → server | `{ chat_id }`: I've seen this chat |
| `MESSAGES_READ` | server → client | `{ chat_id, user_id, read_at }`: a member read up to `read_at` (ticks; your own reads clear badges on your other devices) |
| `START_TYPING` / `STOP_TYPING` | both | Typing indicator |
| `ONLINE_USERS` | server → client | Which of your contacts are online |
| `CHAT_JOINED` | client → server | Refresh your view of who is online |
| `REFETCH_CHATS` | server → client | Your chat list changed (new friend, group changes) |
| `ALERT` | server → client | System message in a group |
| `NEW_REQUEST` | server → client | You received a friend request |
| `NEW_NOTIFICATION` | server → client | A new in-app notification (payload is the notification) |

## Notifications

A queue-based system with two channels, **email** and **in-app**, on Redis with BullMQ.

```
Any service ──> NotificationService ──────> Redis queues ──> workers
                .queueNotification()        "email"          EmailProcessor: EJS template → Brevo
                                            "in-app"         InAppProcessor: save row → socket push
```

`queueNotification(type, { to, data, actorId })` looks up the type's channels in `NOTIFICATION_CHANNELS`, loads the recipients and actor in one query, builds each channel's payload (email template data, or in-app title/body) and queues one job per recipient per channel.

**What sends notifications**

| Event | Channel |
|---|---|
| Forgot password code | Email |
| Sign up | Email (welcome) |
| Friend request accepted | In-app, to the person who sent the request |
| Added to a group (new group or added later) | In-app |

**Delivery**

- Email jobs retry 5 times with exponential backoff (from 5 s) and are sent at most 10 per second. A job is deleted once sent, because it may contain a one-time code. Failed jobs are kept for 24 hours.
- In-app jobs retry 3 times. Each carries its row id, so a retry never creates a duplicate.
- Queuing has a 5-second timeout, so a Redis outage can't hang a request. `queueNotification` throws a 503 when it can't queue; callers where it's best effort (welcome, friend and group notifications) catch it.
- `NOTIFICATION_WORKERS=false` turns the workers off in a process, so they can run in a separate worker process.

**Email templates** live in `templates/email/`:

```
templates/email/
  layout.ejs                  shared HTML frame (header, footer)
  password-reset/subject.ejs
  password-reset/html.ejs
  password-reset/text.ejs
  welcome/...
```

Each template also gets `app` (`name`, `url`, `year`). In `html.ejs` use `<%= %>` (escaped); in `subject.ejs` and `text.ejs` use `<%- %>`. Templates are cached in production and re-read on every send in development.

**Adding a notification**

1. Add the type to `NotificationData` (what the caller passes) and its channels to `NOTIFICATION_CHANNELS`, both in `src/modules/notification/notification.types.ts`.
2. For each channel, add a builder in `notification.templates.ts`. The compiler requires one for every channel the type is on. A builder gets the recipient, the actor's name and the caller's data.
   - *Email:* `EMAIL_BUILDERS` picks the template and its data. A new template also needs a folder `templates/email/<name>/` with the three files and an entry in `EmailTemplateData`.
   - *In-app:* `IN_APP_BUILDERS` returns the title and body. The caller's data is stored in `notifications.data`.

**In-app inbox (frontend)**: the bell badge counts pending friend requests plus unread notifications. The dropdown shows requests, then recent activity. Opening it marks the activity read, and clicking an item opens its chat.

| Route | Purpose |
|---|---|
| `GET /notifications?page=&take=&unread=true` | Inbox with `unread_count` |
| `GET /notifications/unread-count` | Badge count only |
| `PATCH /notifications/read-all` | Mark everything read |
| `PATCH /notifications/:id/read` | Mark one read |
| `DELETE /notifications/:id` | Delete one |

## Admin panel

At `/admin` on the frontend. Unlocked with `ADMIN_SECRET_KEY`; the admin session lasts 15 minutes.

| Page | Route | Shows |
|---|---|---|
| Login | `POST /admin/verify`, `GET /admin/logout` | Secret-key login |
| Dashboard | `GET /admin/stats` | Totals for users, chats, groups and messages, plus messages per day over the last 7 days |
| Users | `GET /admin/users` | Every user with their friend and group counts |
| Chats | `GET /admin/chats` | Every chat with its members and message count |
| Messages | `GET /admin/messages` | The latest 1,000 messages with sender, chat type and attachments |

## Security and limits

| Area | Protection |
|---|---|
| **Rate limits** | 300 requests/min per IP overall. Stricter limits: sign-up 10/hour, login 20/15 min, forgot password 5/15 min, reset password 10/15 min, uploads 60/15 min, admin login 10/15 min. |
| **Passwords** | bcrypt. Login takes the same time whether or not the username exists. |
| **Access checks** | Every chat, message and socket action checks membership on the server. Ids and member lists sent by the client are never trusted. |
| **Input** | All request bodies are validated, with readable error messages; JSON bodies are capped at 100 KB. |
| **Headers and cookies** | Helmet security headers; CORS allowlist; httpOnly, secure, `SameSite=None` session cookies. |
| **Emails** | User text in email HTML is escaped by EJS. |

## Operations

| Item | Details |
|---|---|
| **Health check** | `GET /health` returns `{ status, uptime }`, with 503 if the database is unreachable. `GET /` returns a plain "Server is running". |
| **Database** | PostgreSQL (Neon), DB-first: `database/schema.sql` is the source of truth; `npm run db:pull` regenerates `prisma/schema.prisma`. |
| **Startup warnings** | The server logs a warning when Cloudinary or Brevo isn't configured, or when the dev master password is on. |
| **Graceful shutdown** | On SIGTERM, in-flight work and queue workers finish and the DB pool closes. |

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | Pooled Postgres URL (app) |
| `DIRECT_URL` | For Prisma CLI | Direct Postgres URL (`db:pull`, `db execute`) |
| `JWT_SECRET` | Yes in production | Signs session tokens |
| `REDIS_URL` | Yes | Notification queues |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | For email | Brevo API key and a verified sender |
| `BREVO_SENDER_NAME` | No | Default `BuzzChat` |
| `APP_URL` | No | Links in emails; default `https://buzzchatapp.vercel.app` |
| `NOTIFICATION_WORKERS` | No | `false` to only queue jobs in this process |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | For uploads | File storage |
| `ADMIN_SECRET_KEY` | For admin | Admin panel login |
| `CLIENT_URL` | No | Extra allowed CORS origins (comma separated) |
| `SWAGGER_ENABLED` | No | `true` to serve `/api/docs` in production |
| `PORT`, `NODE_ENV` | No | Defaults `3000`, `production` |
| `DEV_MASTER_PASSWORD` | Never in production | Local-only master login |
