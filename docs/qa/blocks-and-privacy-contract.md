# Blocks, friend requests and directory privacy: contract (PR #375)

Older store builds of the apps are still in use, so the wire contract matters. Nothing below
introduces a block-specific code or copy: a blocked user must not be able to tell.

## Chat send (socket `message` and `POST /api/messages`)

| Sender | Result |
| --- | --- |
| Blocker (sends to someone they blocked) | Socket: `messageFailed` `{ code: 'SEND_FAILED', retryable: false }` plus `error 'Could not send message'`. REST: `403 { error: 'Could not send message', code: 'SEND_FAILED' }`. **Not retryable**, so old builds cannot loop. Nothing is stored. |
| Blocked party | Normal-looking ack (`status: 'sent'`, cuid-shaped id) to the sender's own sockets only. Validation, rate limiting, age gate and moderation run exactly as for anyone else (a flagged adult-to-minor message is recorded and answered like any moderation block). Not stored or delivered, so it is gone after a reload. |
| Lookup error | Fails closed (`SEND_FAILED`, retryable) and stores nothing. |

`USER_BLOCKED` no longer exists on any path.

Typing, reactions, edits and read receipts across a blocked private pair are dropped (the
blocked party only sees their own echo). `markAsRead` for a blocked pair does not touch receipts
and sends nothing to the other side, but refreshes the reader's own badge: unread counts ignore
messages from users the viewer blocked.

## Friend requests (`POST /api/users/requests`)

Every gate (friends-only minor 403, already friends, incoming request, declined cooldown) answers
a blocked sender exactly like an unblocked one. For a blocked pair the request is stored as a
normal pending row (so a retry gets the same `400 Request already exists` an unblocked sender
gets, and it shows in the sender's outgoing list and can be cancelled), but it is invisible to the
receiver: no notification or bell, not listed in incoming requests, not counted in the badge, and
accept/decline answer `404`. Unblocking deletes the pair's pending requests in the same transaction
as the unblock (kept, still hidden, if the other side also blocks), so nothing surfaces afterwards.
A concurrent double-send (unique-key race) is guarded the same way: no bell, push or counter
broadcast for a blocked pair, and a block that appears mid-request also suppresses the bell.

A duplicate pending request from the same sender is again `400 { error: 'Request already exists' }`
(now also with `code: 'REQUEST_ALREADY_PENDING'`), the response older builds know. The server still
repairs a missing bell for the receiver as a side effect.

## Directory endpoints

`GET /api/users/search` and `GET /api/users` return `id, name, imageUrl, city` (search also
friendship fields). No `email`; search matches the display name only. Names go through
`publicDisplayName`. A known minor's `city` is `null` unless the viewer is a confirmed friend (or
the minor themself). `canAddFriend` is `true` for everyone else, so it never reveals a minor's
privacy choice; the send endpoint enforces the rule (`403 PROFILE_FRIENDS_ONLY`).

## Migration `20261020140000_scrub_notification_emails`

Rewrites notification titles/bodies/JSON string values, value by value, replacing email-shaped
tokens with `משתמש`. Idempotent, and non-destructive apart from the email tokens.

- Back up first: `pg_dump --table='"Notification"' --data-only "$DIRECT_URL" > notification-backup.sql`
- Verify on a throwaway Postgres: `bash server/scripts/test-scrub-notification-migration.sh`

## Profile and directory trade-offs (non-friend viewers)

`GET /api/users/:id` always returns `canAddFriend: true` (the exact answer would let someone
enumerate friends-only minors id by id). The real rule lives in `POST /api/users/requests`, which
answers `403 PROFILE_FRIENDS_ONLY`.

Decision on what stays: `profileRestricted` and `canMessage` are kept on the profile response.

- Clients need them to render the page (hide age/city/sports, show the "friends only" notice, hide
  the message button). Removing them would not hide anything anyway: a restricted profile has no
  age, city, gender or sports, so a non-friend can already tell it is restricted from the missing
  fields, and `POST /requests` and `POST /chats/private` answer `403` for the same accounts.
- What was reducible is already reduced: search and the user list carry no signal (no
  `canAddFriend: false`, no minor city), and the profile's `canAddFriend` is a constant.
- What remains: someone who already holds a user id can learn that the account is a friends-only
  minor. Ids come from search and lists, which show minors by name and photo only. Closing this
  fully means making minors undiscoverable by id (or returning identical shapes for everyone and
  moving the restricted rendering to the client), which is a product decision, not a patch here.

## Unread counts

Both the total chat badge and each chat-list row's `unreadCount` ignore messages from users the
viewer blocked, so a row never shows unread messages that cannot be cleared. The pending friend
request badge likewise ignores requests from blocked users.
