# WebSockets, Push Notifications & Background Workers

## 1. FIREBASE PRIVATE KEY DOUBLE-ESCAPING
- **The Pitfall**: Environments like Coolify re-escape PEM strings, turning `\n` into double-escaped `\\n` sequences in server memory, crashing Firebase signature checks.
- **Actionable Rule**: Always normalize incoming environment keys with the following load-bearing regex quantifier to strip out cascading backslashes:
```javascript
privateKey: process.env.FIREBASE_PRIVATE_KEY 
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\+n/g, '\n') 
  : undefined
```

## 2. CHAT PARTICIPANT CONSTRAINTS & CATCH-AND-IGNORE
- **The Pitfall**: Concurrent operations or double-taps attempting to register a user into a chat room can violate the @@unique([userId, chatId]) constraint and throw a P2002 exception.
- **Actionable Rule**: Every direct `prisma.chatParticipant.create()` operation must be wrapped in a localized try/catch block that silently treats a P2002 error as a success state (since the user is already successfully in the room):
```javascript
try {
  await prisma.chatParticipant.create({ data: { userId, chatId } });
} catch (e) {
  if (e.code !== 'P2002') throw e; // Re-throw real structural issues
}
```

## 3. CLIENT-SIDE REFRESH LOOPS & SOCKET CLEANUP (React / React Native)
- **Unsubscribe Rule**: Every invocation of `SocketManager.on(...)` inside a component or hook must capture and execute the returned un-subscription cleanup function when the effect unmounts:
```javascript
useEffect(() => {
  const unsub = SocketManager.on('chat:sync', handleIncoming);
  return () => unsub(); // Compulsory cleanup to prevent severe memory leaks
}, [user?.id]);
```
- **Clerk Ref-Freezing Pattern**: To prevent infinite data-fetching and re-rendering loops caused by unstable function identities (such as Clerk's `getToken`), freeze the function reference inside a mutable `useRef` and rely on stable primitive states (`isLoaded`, `userId`) in effect dependency arrays:
```javascript
const getTokenRef = useRef(getToken);
useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

// Trigger effects ONLY on primitive changes
useEffect(() => {
  if (isLoaded && userId) fetchNotifications();
}, [isLoaded, userId]);
```
