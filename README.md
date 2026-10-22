# JoinUpApp – Monorepo

פרויקט JoinUp: אפליקציה למציאת משחקי ספורט, ניהול קבוצות וצ'אט בזמן אמת.

## מבנה הפרויקט

```
JoinUpApp/
├── mobile_app/     # אפליקציית Expo (React Native)
├── next_app/       # אתר Next.js
└── server/         # שרת Express.js + Socket.io + Prisma
```

---

## חוקים חשובים לסוכן AI

> **קרא את זה לפני כל שינוי קוד!**

- ❌ **לא להשתמש ב-`npm install`** – להשתמש ב-Expo בלבד
- ❌ **לא לעשות `db push`** – להשתמש ב-migrations בלבד
- ❌ **לא להשתמש ב-`FlatList` מקונן (Nested)** – להשתמש ב-`.map()` בתוך `View` רגיל
- ✅ כל שינוי ב-DB דרך `prisma migrate dev`
- ✅ כל Branch עבודה: `Dev`

---

## ארכיטקטורת Socket.io במובייל

### סדר האתחול הנכון

```
_layout.tsx → AuthGuard → SocketManager.connect(token)   [פעם אחת בלבד]
                        ↓
ChatContext.tsx       → SocketManager.emit('setup', { id: user.id })  [על כל connect]
                        ↓
ChatContext.tsx       → SocketManager.emit('joinChats', [chatIds])    [אחרי שהצ'אטים נטענו]
                        ↓
useChatLogic.ts      → SocketManager.emit('joinRoom', roomId)         [בכניסה לצ'אט ספציפי]
```

### Socket Events – מה השרת שולח ולאן

| Event | שולח לאיפה | מי מאזין |
|-------|-----------|---------|
| `message` | `io.to(roomId)` | `useChatLogic` + `ChatContext` |
| `message:received` | `io.to(roomId)` | alias ל-frontend |
| `chat:sync` | `io.to(userId)` (חדר אישי) | `ChatContext.updateChatList` |
| `typing:start` / `typing:stop` | `io.to(roomId)` | `useChatLogic` + `ChatContext` |
| `notification` | `io.to(userId)` | `NotificationContext` |

### Socket Events – מה הלקוח שולח

| Event | מתי |
|-------|-----|
| `setup` | מיד אחרי connect, ובכל reconnect – מצרף את המשתמש לחדר האישי שלו |
| `joinRoom` | בכניסה לצ'אט ספציפי |
| `joinChats` | אחרי טעינת רשימת הצ'אטים |
| `message` | שליחת הודעה |
| `typing` | הקלדה |
| `leaveRoom` | יציאה מצ'אט |

---

## באגים ידועים שתוקנו – לסוכן AI

### 🐛 [FIXED] Socket מתנתק בכל ניווט / לא עובד בזמן אמת

**תסמינים:**
- הצ'אט לא מתעדכן בזמן אמת
- לא רואים הקלדה של הצד השני
- הודעות חדשות מגיעות רק אחרי רענון ידני
- בלוגים: `Connected: xxx` מופיע מספר פעמים ברצף
- בלוגים: `Missed emit: "setup". Socket disconnected.`

**אבחנה:**
ב-`_layout.tsx`, לפונקציה `AuthGuard` היה `useEffect` עם **`return () => SocketManager.disconnect()`**. ב-React, הפונקציה הזו (cleanup) רצה **בכל פעם שה-dependencies משתנים** – לא רק כשהקומפוננטה נהרסת לגמרי. כל ניווט בין מסכים גרם ל-Socket להתנתק ולהתחבר מחדש, מה שיצר לופ של connect/disconnect.

בנוסף, ה-`setup` event (שמצרף את המשתמש לחדר האישי שלו בשרת) נשלח לפני שה-Socket סיים להתחבר, ולכן הלך לאיבוד.

**הפתרון:**
```typescript
// _layout.tsx → AuthGuard
// ❌ לפני התיקון – disconnect על כל re-render!
useEffect(() => {
  if (isSignedIn) {
    SocketManager.connect(token);
  }
  return () => SocketManager.disconnect(); // ← הבעיה!
}, [isLoaded, isSignedIn]);

// ✅ אחרי התיקון – disconnect רק על sign-out אמיתי
useEffect(() => {
  if (!isLoaded) return;
  if (isSignedIn) {
    getToken().then(token => {
      if (token) SocketManager.connect(token);
    });
  } else {
    SocketManager.disconnect(); // רק כשמתנתקים מהמערכת
  }
  // אין return/cleanup! ה-Socket חייב לשרוד re-renders!
}, [isLoaded, isSignedIn]);

// ChatContext.tsx – שולח setup על כל connect ו-reconnect
useEffect(() => {
  const sendSetup = () => {
    if (user?.id) SocketManager.emit('setup', { id: user.id });
  };
  sendSetup(); // גם אם כבר מחובר
  const unsub = SocketManager.on('connect', sendSetup); // גם על reconnect
  return () => unsub();
}, [user?.id]);
```

**קבצים רלוונטיים:**
- `mobile_app/app/_layout.tsx` – AuthGuard
- `mobile_app/src/context/ChatContext.tsx` – setup + joinChats
- `mobile_app/src/services/socketManager.ts` – singleton socket

---

### 🐛 [FIXED] FlatList לא מתעדכן כשמגיעה הודעה חדשה

**תסמינים:** רשימת הצ'אטים לא מתרעננת כשמגיעה הודעה, גם כשה-Socket מקבל אותה

**אבחנה:** `extraData` של ה-`FlatList` הכיל רק `typingStatus`. כשהודעה מגיעה ו-`chats[]` מתעדכן, ה-FlatList לא זיהה שינוי כי ה-reference של המערך לא בהכרח השתנה.

**הפתרון:**
```typescript
// chats.tsx – extraData עם signal משולב
const extraData = useMemo(() => ({
  typing: typingStatus,
  // signal שמשתנה כשיש הודעה חדשה או שינוי בסדר
  msgKey: filteredChats.map(c =>
    `${c.id}:${c.lastMessage?.createdAt ?? ''}:${c.unreadCount}`
  ).join('|'),
}), [typingStatus, filteredChats]);

<FlatList extraData={extraData} ... />
```

---

### 🐛 [FIXED] Socket נכשל עם `transports: ['websocket']` ב-Expo Go

**תסמינים:** `xhr poll error` בלוגים, Socket לא מתחבר בכלל

**אבחנה:** כשמגדירים `transports: ['websocket']` בלקוח אבל השרת מוגדר גם הוא עם `transports: ['websocket']` בלבד – זה תקין. אבל אם הלקוח מוגדר **בלי** הגבלת transport, הוא מנסה polling קודם, והשרת שדורש websocket בלבד מחזיר שגיאה.

**הכלל:** **שני הצדדים** (client + server) חייבים להיות **מסונכרנים** על `transports: ['websocket']`, או ששניהם מאפשרים polling.

**הגדרה נוכחית:**
```typescript
// socketManager.ts (mobile)
socket = io(API_BASE, {
  path: '/api/socket',
  transports: ['websocket'], // ← חייב להתאים לשרת
  auth: { token },
});

// server/index.js
const io = new Server(server, {
  path: '/api/socket',
  transports: ['websocket'], // ← שרת מקבל websocket בלבד
});
```

---

## Sports Mapping – מפת הספורטים

קובץ ה-source of truth: `mobile_app/src/utils/sports.ts`

כל מסך מובייל **חייב** לייבא את `SPORT_MAPPING` מהקובץ הזה. אין להגדיר שמות ספורט ישירות בקומפוננטות.

```typescript
import { SPORT_MAPPING, getSportName, getSportKey } from '@/utils/sports';
```

---

## סביבות

| סביבה | כתובת |
|--------|--------|
| שרת Production | `https://joinup-api.duckdns.org` |
| שרת Dev (Coolify) | `https://joinup-dev-api.duckdns.org` — ראו `docs/dev-environment.md` |
| Web Production | Vercel |
| Mobile Dev | Expo Go + `.env` עם `EXPO_PUBLIC_API_URL` |

## עדכוני OTA למובייל (EAS Update)

אפשר לשלוח תיקוני JS לאפליקציה בלי לעבור דרך החנות:

```bash
cd mobile_app
npm run update:production -- --message "תיאור קצר של התיקון"
```

- **תמיד דרך הסקריפט, לא `eas update` ישירות:** `eas update` לא קורא את ה-`env` של פרופילי ה-build ב-`eas.json`. בלי הסקריפט, העדכון ייקח ערכים מקובץ `.env` מקומי של המפתח, או ייצא בלי כתובת שרת, בלי מפתח Clerk ובלי Sentry. הסקריפט `scripts/eas-update.mjs`:
  - לוקח את ה-env מהפרופיל, ולא נותן לשום `EXPO_PUBLIC_*` מקומי (מ-`.env` או מהטרמינל) להיכנס לבאנדל;
  - מנקה את ה-cache של Metro, כי בלי זה עדכון יכול לצאת עם הערכים של הרצה קודמת;
  - מפרסם לערוץ ולסביבת ה-EAS של הפרופיל, בגרסה נעולה של `eas-cli`;
  - מסרב לפרסם כשיש שינויים שלא נעשה להם קומיט (אפשר לעקוף עם `--allow-dirty`).
- **`runtimeVersion` הוא `fingerprint`:** עדכון מגיע רק לבילדים עם אותו קוד native. שינוי בתלות native, ב-plugin או בשדות native של `app.json` דורש בילד חדש לחנות, ו-OTA לא יגיע לבילדים הישנים. זה בכוונה, כדי שעדכון לא יקריס בילד שלא מתאים לו.
  - `eas.json`, `.easignore`, `.gitignore` וה-npm scripts לא נכנסים ל-fingerprint (ראו `fingerprint.config.js`). לכן שינוי כתובת שרת ב-`eas.json` כן יכול להגיע לבילדים קיימים ב-OTA. מצד שני, שינוי native ב-`eas.json` (למשל `buildType`) לא מחייב בילד חדש לבד, אז צריך לזכור לשחרר בילד.
  - `google-services.json` נשמר תמיד עם סופי שורה LF (`.gitattributes`), כדי שבילד מ-Windows ועדכון מ-Linux/CI יחשבו אותו fingerprint.
- **Source maps:** כש-`SENTRY_AUTH_TOKEN` מוגדר בסביבה המקומית, הסקריפט מעלה את ה-source maps של העדכון ל-Sentry. ב-EAS הטוקן זמין רק לשרתי ה-build, אז לעדכון מקומי צריך להגדיר אותו בטרמינל.
- **בדיקה לפני פרודקשן:** `npm run update:preview -- --message "..."` שולח לבילדים של פרופיל `preview`.
- **פרופילים `development` ו-`preview` מצביעים על סביבת ה-Dev** (`https://joinup-dev-api.duckdns.org` + מפתח Clerk מסוג `pk_test_`); רק `production` מצביע על הפרודקשן (`pk_live_`). הסקריפט מסרב לפרסם `production` אם כתובת ה-API אינה של הפרודקשן או שהמפתח אינו `pk_live_`, ומסרב לפרסם `preview`/`development` עם מפתח `pk_live_` או עם כתובת הפרודקשן. בילד שכבר מותקן שומר את הערכים שנאפו בו עד שיקבל עדכון בערוץ שלו או שיותקן בילד חדש.
