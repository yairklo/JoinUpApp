import { canMarkRead } from "./chatRead";

describe("canMarkRead", () => {
  test("only when not suspended and tab visible", () => {
    expect(canMarkRead(false, "visible")).toBe(true);
    expect(canMarkRead(true, "visible")).toBe(false);
    expect(canMarkRead(false, "hidden")).toBe(false);
    expect(canMarkRead(false, undefined)).toBe(false);
  });
});
