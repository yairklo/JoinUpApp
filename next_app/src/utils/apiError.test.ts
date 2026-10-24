import {
  getErrorStatus,
  getLoadErrorMessage,
  getActionErrorMessage,
  mapFriendRequestError,
  mapJoinError,
  mapLeaveError,
} from "./apiError";

describe("apiError 429 rate limit handling", () => {
  const err429 = Object.assign(new Error("Too many requests"), { status: 429 });

  test("getErrorStatus extracts 429 numeric status", () => {
    expect(getErrorStatus(err429)).toBe(429);
    expect(getErrorStatus({ status: 429 })).toBe(429);
    expect(getErrorStatus(new Error("other"))).toBeUndefined();
  });

  test("getLoadErrorMessage returns user-facing rate-limit copy on 429", () => {
    expect(getLoadErrorMessage(err429)).toBe("יותר מדי בקשות, נסה שוב בעוד רגע");
  });

  test("getActionErrorMessage returns user-facing rate-limit copy on 429", () => {
    expect(getActionErrorMessage(err429)).toBe("יותר מדי בקשות, נסה שוב בעוד רגע");
  });

  test("mapFriendRequestError returns user-facing rate-limit copy on 429", () => {
    expect(mapFriendRequestError(err429)).toBe("יותר מדי בקשות, נסה שוב בעוד רגע");
  });

  test("mapJoinError returns user-facing rate-limit copy on 429", () => {
    expect(mapJoinError(err429)).toBe("יותר מדי בקשות, נסה שוב בעוד רגע");
  });

  test("mapLeaveError returns user-facing rate-limit copy on 429", () => {
    expect(mapLeaveError(err429)).toBe("יותר מדי בקשות, נסה שוב בעוד רגע");
  });
});

describe("mapJoinError guest window", () => {
  test("guest registration not open yet gets its own copy", () => {
    const err = Object.assign(new Error("Registration is not yet open for guests"), { status: 400, code: "GUEST_REGISTRATION_NOT_OPEN" });
    expect(mapJoinError(err)).toBe("ההרשמה לאורחים טרם נפתחה - חברי הקבוצה נרשמים ראשונים");
  });
});

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


describe("mapJoinError server reasons", () => {
  test("shows the server reason for an unmapped 400", () => {
    const e = Object.assign(new Error("Some specific reason"), { status: 400 });
    expect(mapJoinError(e)).toBe("Some specific reason");
  });
  test("keeps generic copy for 5xx", () => {
    const e = Object.assign(new Error("boom"), { status: 500 });
    expect(mapJoinError(e)).toBe("שגיאת שרת זמנית, נסה שוב בעוד רגע");
  });
});
