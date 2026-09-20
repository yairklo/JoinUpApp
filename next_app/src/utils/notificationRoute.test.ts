import { resolveNotificationRoute } from "./notificationRoute";

describe("resolveNotificationRoute", () => {
  test("a friend request opens the friends page (the old /friends link is a 404 on the web)", () => {
    expect(resolveNotificationRoute({ type: "FRIEND_REQUEST", data: { link: "/friends", requesterId: "u1" } })).toBe(
      "/profile/friends"
    );
  });

  test("an accepted request opens the new friend's profile, including notifications stored with /profile/:id", () => {
    expect(resolveNotificationRoute({ type: "FRIEND_ACCEPTED", data: { userId: "u2", link: "/profile/u2" } })).toBe("/users/u2");
    expect(resolveNotificationRoute({ type: "FRIEND_ACCEPTED", data: { link: "/user/u2" } })).toBe("/profile/friends");
  });

  test("game notifications use the plural web route", () => {
    expect(resolveNotificationRoute({ type: "GAME_CANCELLED", data: { gameId: "g1", link: "/game/g1" } })).toBe("/games/g1");
    expect(resolveNotificationRoute({ type: "X", data: { link: "/game/g2" } })).toBe("/games/g2");
    expect(resolveNotificationRoute({ type: "X", data: { link: "/games/g3" } })).toBe("/games/g3");
  });

  test("mobile-style user links are mapped, /profile sub-routes are left alone", () => {
    expect(resolveNotificationRoute({ type: "X", data: { link: "/user/u9" } })).toBe("/users/u9");
    expect(resolveNotificationRoute({ type: "X", data: { link: "/profile/settings" } })).toBe("/profile/settings");
    expect(resolveNotificationRoute({ type: "X", data: { link: "/profile/friends" } })).toBe("/profile/friends");
  });

  test("chat links and unknown links pass through; no data gives no route", () => {
    expect(resolveNotificationRoute({ type: "NEW_MESSAGE", data: { link: "/chat/c1" } })).toBe("/chat/c1");
    expect(resolveNotificationRoute({ type: "X", data: null })).toBeNull();
    expect(resolveNotificationRoute({ type: "X" })).toBeNull();
  });
});
