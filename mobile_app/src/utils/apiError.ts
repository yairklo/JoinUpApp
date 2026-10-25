import { guestRegistrationNotOpenMessage, guestRegistrationOpensAtFromError } from "@joinup/shared/gameViewerCopy";

function getErrorStatus(error: unknown): number | undefined {
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

/** Hebrew copy for a failed friend request. Never render the raw server message. */
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
  if (status === 401) return "יש להתחבר כדי לשלוח בקשת חברות";
  if (status === 403) return "אין הרשאה לבצע פעולה זו";

  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("already friends")) return "אתם כבר חברים";
  if (normalized.includes("request already exists")) return "כבר נשלחה בקשת חברות";
  if (normalized.includes("invalid receiver")) return "לא ניתן לשלוח בקשה זו";
  if (normalized.includes("declined")) return "הבקשה הקודמת נדחתה. אפשר לשלוח בקשה חדשה בעוד כמה ימים";
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror") || normalized.includes("network request failed")) {
    return "בעיית תקשורת, בדוק את החיבור לאינטרנט";
  }
  return "שליחת הבקשה נכשלה, נסה שוב";
}

/** Join-failure copy. Guest-window errors include the opening time when the server sends it. */
export function mapJoinAlert(error: unknown, fallback: string): string {
  const code = getErrorCode(error);
  const raw = error instanceof Error ? error.message : "";
  if (code === "GUEST_REGISTRATION_NOT_OPEN" || raw.toLowerCase().includes("not yet open for guests")) {
    return guestRegistrationNotOpenMessage(guestRegistrationOpensAtFromError(error));
  }
  const legacy = error && typeof error === "object" && "response" in error
    ? (error as { response?: { data?: { error?: unknown } } }).response?.data?.error
    : undefined;
  if (raw) return raw;
  if (typeof legacy === "string" && legacy) return legacy;
  return fallback;
}
