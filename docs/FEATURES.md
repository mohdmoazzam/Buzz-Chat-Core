# BuzzChat features

Everything BuzzChat does today, what the user sees and how it works on the server.
All REST routes are under `/api/v1`. Interactive API docs are at `/api/docs` (Swagger; on by default outside production).

- [Accounts and authentication](#accounts-and-authentication)
- [Profiles](#profiles)
- [Friends](#friends)
- [Chats](#chats)
- [Pagination](#pagination)
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
| **Email verification** | Sign-up logs you in and emails a 6-digit code (template `email-verification`). Until it's entered the account can only load `GET /user/me`, verify, resend or log out: other routes answer 403 and sockets are refused. The app shows `/verify-email` meanwhile. When Brevo isn't configured (local development), accounts start verified. |
| **Welcome email** | Queued once the email is verified (template `welcome`). A queue outage never fails sign-up or verification. |
| **Log in** | Username + password. Returns a session token as an httpOnly cookie *and* in the body (for the `Authorization: Bearer` header). Sessions last 15 days. |
| **Log out** | Clears the cookie; works even with an expired session. |
| **Forgot password** | Enter your email → a 6-digit code is emailed (template `password-reset`) → enter the code and a new password. |
| **Sign in with Google** | Google's button on the login and sign-up screens (Google Identity Services). The backend verifies the ID token for `GOOGLE_CLIENT_ID`, then logs in the account with that Google id, or links Google to the account with the same (Google-verified) email, or creates one: name from Google, username from the email (made unique), Google photo copied to Cloudinary, email already verified. Turned off when `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` are empty. |
| **Change password** | Settings → Password while logged in: current password, then a new one (8–72 characters, different from the current). Every other device is logged out; this one stays logged in. |
| **Delete my account** | Settings → Delete account: a 6-digit code is emailed (template `account-deletion`, same rules as other codes), entering it deletes the account. 1:1 chats are deleted whole; groups the user admins pass to the longest-standing member (deleted if fewer than 2 would remain); their messages, requests, notifications and sessions go too, and files nothing else uses are removed from storage. Every device is logged out and contacts' chat lists refresh. |
| **Case-insensitive identity** | Usernames and emails are `citext`: `John` and `john` are the same account. |

**Code rules (forgot password and email verification)**

- Codes are stored only as a bcrypt hash (`password_resets` and `email_verifications` tables), one pending code per user; a new request replaces the old code.
- A code expires after **10 minutes** and stops working after **5 wrong guesses**. Wrong guesses report how many attempts are left.
- A new code can be requested once a **minute**.
- Forgot password answers the same whether or not the email has an account.

| Route | Purpose |
|---|---|
| `POST /user/register` | Create an account |
| `POST /user/login` | Log in |
| `POST /user/google` | `{ credential }` (Google ID token): log in or sign up with Google |
| `POST /user/logout` | Log out (ends this device's session) |
| `GET /user/sessions` | Logged-in devices; this one has `current: true` |
| `DELETE /user/sessions/:id` | Log out one device |
| `DELETE /user/sessions/others` | Log out every device except this one |
| `DELETE /user/sessions` | Log out everywhere, this device included |
| `POST /user/forgot-password` | `{ email }`: send a reset code |
| `POST /user/reset-password` | `{ email, otp, password }`: set a new password |
| `POST /user/delete-account/code` | Email the account deletion code |
| `POST /user/delete-account` | `{ otp }`: delete the account for good |
| `PUT /user/password` | `{ current_password, new_password }`: change it while logged in; logs out other devices |
| `POST /user/verify-email` | `{ otp }`: verify the signed-in account's email; returns the updated user |
| `POST /user/verify-email/resend` | Email a new verification code |

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
| **Find people** | `GET /user/search?search=&cursor=&take=`: cursor-paginated search (with `pagination.total` for "12 results") by name or username. Each result shows the relationship: `friend` (with its chat id), `sent`, `received` or none. |
| **Send a friend request** | `POST /user/friend-requests` `{ user_id }`. The receiver gets a live `NEW_REQUEST` event and a badge on the bell. |
| **Accept / decline** | `PUT /user/friend-requests/:id` `{ accept }`. Accepting creates the 1:1 chat and notifies the sender in-app ("accepted your friend request"). |
| **Pending requests** | `GET /user/friend-requests` (shown in the bell dropdown). |
| **Friends list** | `GET /user/friends?chat_id=`. With `chat_id`, leaves out people already in that group (for "Add members"). |

A pair of users can only ever have one 1:1 chat, enforced by a unique `direct_key`.

## Chats

| Feature | Details |
|---|---|
| **Chat list** | `GET /chat?cursor=&take=&search=&order_by=&order=`: cursor-paginated infinite scroll, newest activity first, with a last-message preview. Searching matches the group name or the other person's name. |
| **Live chat list** | New messages move a chat to the top and update its preview without a reload. |
| **Unread badges** | Each chat in the list has `unread_count`, counted on the server, so it's right on every device, after a reload and for messages that arrived while offline. Live updates come from `NEW_MESSAGE_ALERT` / `MESSAGES_READ`. |
| **Unread total** | `GET /chat/unread-count` across all chats; shown in the browser tab title, e.g. "(3) BuzzChat". |
| **Read receipts** | On your own messages: ✓ sent, ✓✓ seen. In groups ✓✓ means everyone who was in the group when you sent it has seen it, and the tooltip says "Seen by 2 of 4". Updates live. |
| **Marking as read** | A chat counts as read while it's open and the tab is visible (on open, as messages arrive, and when you come back to the tab). Sending a message also marks the chat read. Reading on one device clears the badge on all of them. |
| **Chat details** | `GET /chat/:id?populate=true` with members. |
| **Members** | `GET /chat/:id/members?cursor=&take=`: cursor-paginated (20 per page, max 50) in join order (the order admin is handed over in), each with `is_admin`, plus `pagination.total`. |
| **Mark read (REST)** | `POST /chat/:id/read`: same as the `CHAT_READ` socket event; returns the new `read_at` or `null` if nothing was new. |
| **Delete chat** | `DELETE /chat/:id`: any member can delete a 1:1 chat; only the admin can delete a group. Messages and their files are removed too. |
| **Online status** | Contacts see who is online; a user with several tabs or devices stays online until the last one closes. |
| **Typing indicator** | "typing…" in 1:1 chats; in groups the name of who is typing ("Ravi is typing…", "Ravi and Amit are typing…"). `START_TYPING` / `STOP_TYPING` carry `{ chat_id, user_id, first_name }`. |

## Pagination

Every list API is cursor-paginated through one class, `CursorPagination` (`src/common/utils/pagination.ts`).

- Request: `?take=20` for the first page, then `?take=20&cursor=<pagination.next_cursor>` for the next one. Lists that can be sorted also take `order_by` and `order`.
- Response: the items plus `pagination: { take, next_cursor, has_more }` (and `total` on people search and group members). `next_cursor` is `null` on the last page.
- The cursor is the opaque id of the last row. The next page is read with Prisma's `cursor`, so the database compares against that row's stored values. That stays exact although timestamps have microseconds and a JS `Date` only milliseconds, works for any sort order (names included), and doesn't slow down deep into a list like `OFFSET` does.
- Lists that get re-sorted (a chat moves up on a new message) can repeat a row across pages; clients de-duplicate by id. If the cursor row was deleted, the next page comes back empty and the client starts over from the first page on its next refresh.
- An invalid `cursor`, `take` or `order_by` is a 400 that says what is allowed.

Using it in a service:

```ts
const page = CursorPagination.parse(query, { orderFields: { updated_at: ["updated_at"] }, defaultOrderBy: "updated_at" });
const rows = await prisma.chats.findMany({ where, orderBy: page.orderBy, ...page.args((id) => ({ id })) });
const { rows: chats, pagination } = page.result(rows, (chat) => chat.id);
```

## Group chats

| Feature | Details |
|---|---|
| **Create a group** | `POST /chat/groups`: name, description, optional picture, 3–15 members (including you). Only friends can be added. Each added member gets an in-app notification. |
| **My groups** | `GET /chat/groups`: groups you created and manage (Manage groups page). |
| **Edit group** | `PUT /chat/:id`: name, description, picture (admin only). |
| **Add members** | `POST /chat/:id/members` (admin only, friends only, max 15). New members get an in-app notification. |
| **Remove a member** | `DELETE /chat/:id/members/:userId` (admin only). |
| **Group info** | From the group name or the ⋮ menu in a chat: a side panel (full screen on phones) with the picture, name, member count, description, members (green dot when online, "Admin" label, "Show more" for the next page), "Manage group" for the admin, and Leave / Delete group. When leaving isn't allowed the panel says why up front. |
| **Leave a group** | `DELETE /chat/:id/members/me`. Not allowed when fewer than 3 members would remain (delete it instead). An admin who leaves hands admin to the longest-standing member. |
| **System alerts** | "Welcome to …", "X was added", "X left the group" appear live in the chat (`ALERT`). |

The group creator is the admin.

## Messages

| Feature | Details |
|---|---|
| **Send text** | Over the socket (`NEW_MESSAGE`), up to 4,000 characters. The server checks membership and acknowledges with the saved message id. |
| **Delete for me** | `DELETE /chat/:chatId/messages/:id/for-me`: hides any message (anyone's, or a deleted placeholder) for you only (`message_hidden`). It leaves your history, chat list preview and unread counts, and your other devices drop it (`MESSAGE_HIDDEN`). Delete in the app asks: Delete for everyone (your own messages) / Delete for me / Cancel. |
| **Hold a message (phones)** | WhatsApp-style: the bubble is outlined, only the emoji bar floats above it, and the header turns into Reply / Copy / Edit / Forward / Delete. Tap outside, scroll, Esc or ✕ to cancel. Desktop keeps the ⋮ / right-click menu. |
| **Emoji reactions** | `PUT /chat/:chatId/messages/:id/reaction` `{ emoji }` (a single emoji), `DELETE …/reaction` to remove. One per person per message (`message_reactions`): a new emoji replaces yours. Everyone gets the message again (`MESSAGE_UPDATED`) with `reactions: [{ emoji, user }]`. In the app: 6 quick reactions at the top of the message menu, chips under the bubble (tap to add/remove, hover for who), and a short vibration on phones that support it. Deleting a message (or a disappearing one expiring) removes its reactions. |
| **Disappearing messages** | `PUT /chat/:id/disappearing` `{ seconds }`: 24 hours, 7 days, 90 days or `null` (off); any member of a 1:1 chat, the admin of a group. New messages get `expires_at` (messages already sent are kept); a notice is posted and clients get `DISAPPEARING_UPDATED`. A repeating `message-cleanup` job (every minute) deletes expired messages and their unused files and sends `MESSAGES_EXPIRED` `{ chat_id, message_ids }`; clients also hide them at the exact time. In the app: ⋮ → Disappearing messages, a timer in the header, and a banner at the top of the chat. |
| **Link previews** | Links in text are clickable. For the first link, a `link-preview` queue job fetches the page's Open Graph tags (falling back to `<title>` / meta description), saves `messages.link_preview` (`url, title, description, image, site_name`) and pushes the message again (`MESSAGE_UPDATED`), so a card appears a moment later. Editing the link refetches it; deleting the message clears it. The fetch only reaches public http(s) addresses on default ports: every hop, redirects included, is resolved and checked (no localhost, private networks or cloud metadata), with a 5 s timeout, HTML only, first 512 KB. |
| **History** | `GET /chat/:id/messages?cursor=&take=`: newest first, 20 per page (max 50), loaded upward as you scroll; each page is oldest first. Also returns `read_receipts` (`user_id`, `last_read_at`, `joined_at` for the other members). |
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
| Sign up | Email (verification code) |
| Email verified | Email (welcome) |
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
  email-verification/...
  welcome/...
```

Each template also gets `app` (`name`, `url`, `year`). In `html.ejs` use `<%= %>` (escaped); in `subject.ejs` and `text.ejs` use `<%- %>`. Templates are cached in production and re-read on every send in development.

**Adding a notification**

1. Add the type to `NotificationData` (what the caller passes) and its channels to `NOTIFICATION_CHANNELS`, both in `src/modules/notification/notification.types.ts`.
2. For each channel, add a builder in `notification.templates.ts`. The compiler requires one for every channel the type is on. A builder gets the recipient, the actor's name and the caller's data.
   - *Email:* `EMAIL_BUILDERS` picks the template and its data. A new template also needs a folder `templates/email/<name>/` with the three files and an entry in `EmailTemplateData`.
   - *In-app:* `IN_APP_BUILDERS` returns the title and body. The caller's data is stored in `notifications.data`.

**In-app inbox (frontend)**: the bell badge counts pending friend requests plus unread notifications. The bell opens the Notifications page (`/notifications`, full screen on phones): friend requests, then activity split into New (unread when opened) and Earlier, with "Show more" for older pages. Opening it marks the activity read, clicking an item opens its chat, ✕ deletes one notification and Clear all deletes them all.

| Route | Purpose |
|---|---|
| `GET /notifications?cursor=&take=&unread=true` | Inbox with `unread_count` |
| `GET /notifications/unread-count` | Badge count only |
| `PATCH /notifications/read-all` | Mark everything read |
| `PATCH /notifications/:id/read` | Mark one read |
| `DELETE /notifications/:id` | Delete one |
| `DELETE /notifications` | Delete all (Clear all) |

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
| **Rate limits** | 300 requests/min per IP overall. Stricter limits: sign-up 10/hour, login 20/15 min, Google sign-in 20/15 min, change password 10/15 min, forgot password 5/15 min, reset password 10/15 min, verify email 10/15 min, resend verification code 5/15 min, uploads 60/15 min, admin login 10/15 min. |
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
| `GOOGLE_CLIENT_ID` | For Google sign-in | OAuth "Web application" client id; the frontend needs the same value as `VITE_GOOGLE_CLIENT_ID` |
| `BREVO_SENDER_NAME` | No | Default `BuzzChat` |
| `APP_URL` | No | Links in emails; default `https://buzzchatapp.vercel.app` |
| `NOTIFICATION_WORKERS` | No | `false` to only queue jobs in this process |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | For uploads | File storage |
| `ADMIN_SECRET_KEY` | For admin | Admin panel login |
| `CLIENT_URL` | No | Extra allowed CORS origins (comma separated) |
| `SWAGGER_ENABLED` | No | `true` to serve `/api/docs` in production |
| `PORT`, `NODE_ENV` | No | Defaults `3000`, `production` |
| `DEV_MASTER_PASSWORD` | Never in production | Local-only master login |
