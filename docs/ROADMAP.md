# BuzzChat roadmap

Features that would fit BuzzChat next, with a rough size and what they'd build on.
None of these exist yet; for what does, see [FEATURES.md](FEATURES.md).

Size: **S** = about a day or less, **M** = a few days, **L** = a week or more.

## Next up (recommended order)

1. **Reply to a message and emoji reactions** (S): expected in any chat app.
2. **Log out everywhere** (S): closes the gap where a password reset leaves other devices logged in.
3. **Web push notifications** (M): reach people when the app is closed.

Done: read receipts and server-side unread counts (see FEATURES.md, Chats); email verification on sign-up (see FEATURES.md, Accounts).

## Messaging

| Feature | Size | Notes |
|---|---|---|
| Delivered state (✓✓ grey) | S | A `last_delivered_at` next to `last_read_at`, set when a recipient's socket receives the message. |
| Hide read receipts (privacy) | S | Per-user setting; skip `MESSAGES_READ` to others and hide their ticks both ways. |
| Reply to a message | S | `reply_to_id` on `messages`, quoted preview in the bubble; add to the existing message menu. |
| Emoji reactions | S | `message_reactions (message_id, user_id, emoji)` and a socket event. |
| Mentions in groups (`@username`) | S | Parse on send; notify mentioned users even if the group is muted. |
| Voice messages | M | Record with `MediaRecorder`, upload through `POST /assets`, waveform player. |
| Link previews | M | A queue job fetches Open Graph tags and stores them on the message. |
| Message search | M | Postgres full-text search (`tsvector` and a GIN index), per chat and across chats. |
| Shared media gallery | M | Per-chat Photos / Files / Links tabs built from `message_attachments`. |
| Scheduled messages | M | Delayed BullMQ jobs, which the queue setup already supports. |
| Disappearing messages | M | Per-chat timer and a repeating cleanup job. |
| Pin messages | S | `pinned_at` on `messages`, a pinned bar at the top of the chat. |

## Chats and people

| Feature | Size | Notes |
|---|---|---|
| Last seen | S | Save the time a user's last socket disconnects; presence is already tracked. |
| Mute a chat | S | `muted_until` on `chat_members`; skip notifications while muted. |
| Pin and archive chats | S | Flags on `chat_members`, sorted first / hidden from the main list. |
| Unfriend and block | S | Unfriend is missing today. Blocking also stops requests and messages from that person. |
| Group roles | M | Several admins, promote / demote, instead of only the creator. |
| Group invite links | M | Expiring links that let a friend-of-a-friend join. |

## Notifications

| Feature | Size | Notes |
|---|---|---|
| Friend request received | S | In-app and optional email, alongside the existing `NEW_REQUEST` event. |
| Notification preferences | S | Per-user toggles per type and channel, checked in `NotificationService` before queuing. |
| Web push | M | A third `push` channel using the Web Push API and a service worker. |
| Missed-message email digest | M | A delayed job: "You have 5 unread messages in X", sent only if the user is still offline. |

## Accounts and security

| Feature | Size | Notes |
|---|---|---|
| Log out everywhere / token versioning | S | `token_version` on `users`, checked on every request, bumped on password reset. |
| Active sessions list | M | A `sessions` table per device, with revoke. |

## Admin and safety

| Feature | Size | Notes |
|---|---|---|
| Report a message or user | M | Report table and a moderation queue in the admin panel. |
| Ban / suspend users | S | `suspended_until` on `users`, checked at login and on socket connect. |
| Socket rate limits | S | Only HTTP routes are rate limited today; limit `NEW_MESSAGE` and typing events too. |
| Admin pagination and search | S | Admin lists load everything (messages: latest 1,000). |
| Admin audit log | S | Record what each admin action did and when. |

## Scale and advanced

| Feature | Size | Notes |
|---|---|---|
| Multiple server instances | M | Socket.IO Redis adapter so live events reach users on any instance; move presence counts to Redis. Needed before running more than one Render instance or a separate worker process. |
| Voice and video calls | L | WebRTC, with Socket.IO for signalling and a TURN service such as Twilio or Metered. |
| End-to-end encryption | L | Signal protocol or libsodium. Affects search, previews and forwarding. |
| AI features | M | Summarise long group chats, smart replies, translate messages. |
