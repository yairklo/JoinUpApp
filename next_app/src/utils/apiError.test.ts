import { mapFriendRequestError } from "./apiError";

describe("mapFriendRequestError", () => {
  test("USER_BLOCKED uses the same copy as a generic failure", () => {
    const blocked = Object.assign(new Error("Cannot send a request to this user"), {
      status: 403,
      code: "USER_BLOCKED",
    });
    const generic = new Error("something else broke");
    expect(mapFriendRequestError(blocked)).toBe("שליחת הבקשה נכשלה, נסה שוב");
    expect(mapFriendRequestError(blocked)).toBe(mapFriendRequestError(generic));
    expect(mapFriendRequestError(blocked)).not.toBe("לא ניתן לשלוח בקשה למשתמש זה");
  });

  test("PROFILE_FRIENDS_ONLY stays a distinct message", () => {
    const err = Object.assign(new Error("friends only"), { status: 403, code: "PROFILE_FRIENDS_ONLY" });
    expect(mapFriendRequestError(err)).toBe("הפרופיל הזה פתוח לחברים בלבד");
  });
});
