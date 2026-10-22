# Auth & User Profile Pitfalls Guide

## 1. THE CLERK FALLBACK OVERWRITE BUG
### 1.1 History
`req.user` can be the sparse fallback `{ id, name: userId, avatar: null }` (Clerk API failure), and `displayName()` falls back to username/email. Older code upserted `name`/`imageUrl` from `req.user` on every write, clobbering real profile data with the Clerk id, an email, or a stale Clerk name. Never do that.

### 1.3 Current policy (server/utils/userSync.js)
Our DB is the source of truth for `User.name` and `imageUrl` once the row exists. Use `safeUpsertUserFromAuth(prisma, req.user)`; its upsert `update` is empty, so Clerk data is only copied on **create**. The one exception: if the stored name is null/empty, a guarded `updateMany` fills it from Clerk Stored names that are email-shaped (contain `@`) or equal the stored email count as missing. Clerk names that are the id, contain `@`, or equal the Clerk email/username are never written (create or fill). Never write `name` from `req.user` anywhere else, or profile-name edits silently revert.

## 2. FRIENDSHIP ORDERING CONSTRAINTS
The Friendship model enforces a strict @@unique([userAId, userBId]) constraint. To avoid reciprocal duplication (A→B and B→A coexisting) and constraint crashes:

Rule: You MUST sort user IDs alphabetically before any query or write operation using the established pairing logic:

```javascript
function orderPair(a, b) {
  return a < b ? [a, b] : [b, a];
}
```

## 3. DEAD CODE WARNING
`server/routes/auth.js` and `server/utils/dataManager.js` belong to a legacy, file-based JSON store. They are completely disconnected from Clerk and Prisma. NEVER extend or reference them.

`req.user.isAdmin` is resolved in `server/utils/admin.js` — never hardcode it to false.

Grant admin in **one** of these ways (do not add a parallel `User.isAdmin` column):
1. Clerk `publicMetadata` / `privateMetadata`: `{ "isAdmin": true }` or `{ "role": "admin" }`.
2. Coolify env `ADMIN_USER_IDS` — comma-separated Clerk user ids (works even if the Clerk profile fetch fails).

Field create/update/delete and other admin-gated routes stay 403 until one of those is set.

`GET /api/users/me` returns `{ isAdmin }` for the signed-in viewer (never expose this flag on `GET /api/users/:id`). The web admin surface is `/admin/fields`, linked from privacy settings when `isAdmin` is true.
