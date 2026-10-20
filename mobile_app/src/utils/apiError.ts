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
  if (code === "USER_BLOCKED") return "לא ניתן לשלוח בקשה למשתמש זה";
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
