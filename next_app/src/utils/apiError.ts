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

// Generic "failed to load data" copy, distinguishing 429 (rate limited) from
// everything else (500s, network errors, etc). Used by feed/list hooks.
export function getLoadErrorMessage(error: unknown): string {
  if (getErrorStatus(error) === 429) {
    return "יותר מדי בקשות, נסה שוב בעוד רגע";
  }
  return "אירעה שגיאה בטעינת הנתונים";
}

// Generic "failed to save/submit" copy for mutation-style calls (POST/PUT/DELETE).
export function getActionErrorMessage(error: unknown): string {
  if (getErrorStatus(error) === 429) {
    return "יותר מדי בקשות, נסה שוב בעוד רגע";
  }
  return "אירעה שגיאה, נסה שוב";
}

// Maps a raw error (status code or English message thrown by the server/browser)
// to Hebrew copy safe to render directly to users. Never render error.message
// from the network directly — always go through this.
export function mapFriendRequestError(error: unknown): string {
  const status = getErrorStatus(error);
  if (status === 429) return "יותר מדי בקשות, נסה שוב בעוד רגע";
  if (status === 401 || status === 403) return "יש להתחבר מחדש";

  const raw = error instanceof Error ? error.message : "";
  const normalized = raw.toLowerCase();
  if (normalized.includes("already friends")) return "אתם כבר חברים";
  if (normalized.includes("request already exists")) return "כבר נשלחה בקשת חברות";
  if (normalized.includes("invalid receiver")) return "לא ניתן לשלוח בקשה זו";
  if (normalized.includes("sign in required")) return "יש להתחבר כדי לשלוח בקשת חברות";
  if (normalized.includes("failed to fetch") || normalized.includes("networkerror")) {
    return "בעיית תקשורת, בדוק את החיבור לאינטרנט";
  }

  return "שליחת הבקשה נכשלה, נסה שוב";
}
