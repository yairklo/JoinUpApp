# Auth & User Profile Pitfalls Guide

## 1. THE CLERK FALLBACK OVERWRITE BUG
### 1.1 The Exact Code Logic
In `server/utils/auth.js`, the verification middleware fetches the profile from Clerk. If the Clerk API call fails (rate limit, network error) or if the profile is sparse right after signup, the middleware falls back to:
```javascript
req.user = { id: userId, name: userId, avatar: null, isAdmin: false };
```
When user actions subsequently trigger a database write (such as joining a game roster or creating a match), the system executes an unsafe upsert:

```javascript
// UNSAFE - DO NOT REPLICATE
await prisma.user.upsert({
  where: { id: req.user.id },
  update: { name: req.user.name, imageUrl: req.user.avatar },
  create: { id: req.user.id, name: req.user.name, imageUrl: req.user.avatar }
});
```
This blindly overwrites the user's real name with their raw Clerk ID string (e.g., "user_2Niz...") and sets their profile picture to null!

### 1.2 Line-by-Line Prevention Rule
All database writes on the User model must use Prisma's undefined property ignore behavior to protect existing data:

```javascript
const isNameFallback = req.user.name === req.user.id;

await prisma.user.upsert({
  where: { id: req.user.id },
  update: {
    name: isNameFallback ? undefined : req.user.name,
    imageUrl: (isNameFallback || !req.user.avatar) ? undefined : req.user.avatar
  },
  create: {
    id: req.user.id,
    name: isNameFallback ? null : req.user.name,
    imageUrl: isNameFallback ? null : req.user.avatar
  }
});
```

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

`req.user.isAdmin` is permanently hardcoded to false across the backend. All admin-gated features are stubs and unreachable in production.
