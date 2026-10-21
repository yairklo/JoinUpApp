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
accept/decline answer `404`. Unblocking deletes the pair's pending requests so nothing surfaces
afterwards.

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

Remaining, accepted trade-off: the profile still returns `profileRestricted` and `canMessage`
because the clients need them to render the page (hide age/city/sports, show the "friends only"
notice, hide the message button). Together with the `403`s on request/chat creation, a determined
non-friend who already has a user id can still learn that an account is a friends-only minor.
Closing that fully would need minors to be undiscoverable by id, which is a product decision.
Search and the user list no longer carry any such signal (no `canAddFriend: false`, no city).

## Unread counts

Both the total chat badge and each chat-list row's `unreadCount` ignore messages from users the
viewer blocked, so a row never shows unread messages that cannot be cleared. The pending friend
request badge likewise ignores requests from blocked users.
