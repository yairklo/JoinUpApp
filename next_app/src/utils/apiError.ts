// Shared helpers for turning a failed apiClient() call into user-facing Hebrew copy.
// apiClient() (see services/api/client.ts) throws a plain Error with an optional
// `.status` property set to the HTTP status code for non-2xx responses.

export function getErrorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

export function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

// Differentiates network/offline failures (no HTTP status at all -- the fetch
// itself rejected) from real HTTP error responses, so callers can render more
// specific Hebrew copy than one generic string for every failure type.
function isNetworkError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message.toLowerCase() : "";
  return raw.includes("failed to fetch") || raw.includes("networkerror") || raw.includes("network request failed");
}

// Generic "failed to load data" copy, distinguishing rate limiting, auth,
// server errors, and offline/network failures. Used by feed/list hooks.
export function getLoadErrorMessage(error: unknown): string {
  const status = getErrorStatus(error);
  if (status === 429) return "יותר מדי בקשות, נסה שוב בעוד רגע";
  if (status === 401 || status === 403) return "יש להתחבר מחדש כדי לצפות בתוכן הזה";
  if (typeof status === "number" && status >= 500) return "שגיאת שרת זמנית, נסה שוב בעוד רגע";
  if (status === undefined && isNetworkError(error)) {
    return "בעיית תקשורת, בדוק את החיבור לאינטרנט ונסה שוב";
  }
  return "אירעה שגיאה בטעינת הנתונים";
}

// Generic "failed to save/submit" copy for mutation-style calls (POST/PUT/DELETE).
export function getActionErrorMessage(error: unknown): string {
  const status = getErrorStatus(error);
  if (status === 429) return "יותר מדי בקשות, נסה שוב בעוד רגע";
  if (status === 401 || status === 403) return "יש להתחבר מחדש כדי לצפות בתוכן הזה";
  if (typeof status === "number" && status >= 500) return "שגיאת שרת זמנית, נסה שוב בעוד רגע";
  if (status === undefined && isNetworkError(error)) {
    return "בעיית תקשורת, בדוק את החיבור לאינטרנט ונסה שוב";
  }
  return "אירעה שגיאה, נסה שוב";
}

// Maps a raw error (status code or English message thrown by the server/browser)
// to Hebrew copy safe to render directly to users. Never render error.message
// from the network directly — always go through this.
export function mapFriendRequestError(error: unknown): string {
  const status = getErrorStatus(error);
  const code = getErrorCode(error);
  if (status === 429) return "יותר מדי בקשות, נסה שוב בעוד רגע";
  // A block must look like any other failed send. A distinct sentence tells the sender they were blocked.
  if (code === "USER_BLOCKED") return "שליחת הבקשה נכשלה, נסה שוב";
  if (code === "PROFILE_FRIENDS_ONLY") return "הפרופיל הזה פתוח לחברים בלבד";
  if (code === "REQUEST_DECLINED_RECENTLY") return "הבקשה הקודמת נדחתה. אפשר לשלוח בקשה חדשה בעוד כמה ימים";
  if (code === "INCOMING_REQUEST_EXISTS") return "המשתמש כבר שלח לך בקשת חברות";
  if (code === "NOTIFICATION_FAILED") return "לא הצלחנו לשלוח התראה. נסה שוב";
  if (status === 401 || code === "SIGN_IN_REQUIRED") return "יש להתחבר כדי לשלוח בקשת חברות";
  if (status === 403) return "אין הרשאה לבצע פעולה זו";

  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("already friends")) return "אתם כבר חברים";
  if (normalized.includes("request already exists")) return "כבר נשלחה בקשת חברות";
  if (normalized.includes("invalid receiver")) return "לא ניתן לשלוח בקשה זו";
  if (normalized.includes("declined")) return "הבקשה הקודמת נדחתה. אפשר לשלוח בקשה חדשה בעוד כמה ימים";
  if (normalized.includes("sign in required")) return "יש להתחבר כדי לשלוח בקשת חברות";
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "בעיית תקשורת, בדוק את החיבור לאינטרנט";
  }

  return "שליחת הבקשה נכשלה, נסה שוב";
}

export function mapJoinError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("already a participant") || normalized.includes("already a confirmed")) {
    return "אתה כבר רשום למשחק זה";
  }
  if (normalized.includes("not yet open") || normalized.includes("registration is not yet open")) {
    return "ההרשמה טרם נפתחה";
  }
  if (normalized.includes("not open for joining")) return "ההרשמה למשחק זה סגורה";
  if (normalized.includes("declined")) return "בקשת ההצטרפות נדחתה";
  if (normalized.includes("spot is already offered")) return "כבר הוצע לך מקום";
  if (normalized.includes("failed to join")) return "ההצטרפות נכשלה, נסה שוב";
  if (normalized.includes("lottery time is not set")) return "מועד ההגרלה טרם נקבע למשחק זה";
  if (normalized.includes("was cancelled")) return "המשחק בוטל";
  // Any other 4xx carries the server's own reason -- show it instead of the generic failure copy.
  const status = getErrorStatus(error);
  if (raw && typeof status === "number" && status >= 400 && status < 500 && ![401, 403, 429].includes(status)) {
    return raw;
  }
  return getActionErrorMessage(error);
}

export function mapLeaveError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("failed to leave")) return "היציאה מהמשחק נכשלה, נסה שוב";
  return getActionErrorMessage(error);
}
