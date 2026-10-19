import { canMarkRead, syncReadState } from "./chatRead";

describe("canMarkRead", () => {
  test("only when not suspended and tab visible", () => {
    expect(canMarkRead(false, "visible")).toBe(true);
    expect(canMarkRead(true, "visible")).toBe(false);
    expect(canMarkRead(false, "hidden")).toBe(false);
    expect(canMarkRead(false, undefined)).toBe(false);
  });
});

describe("syncReadState", () => {
  const make = () => {
    const events: Array<[string, unknown]> = [];
    return { events, socket: { emit: (e: string, p: unknown) => { events.push([e, p]); } } };
  };

  test("minimized/hidden chat reports hidden and never emits markAsRead", () => {
    const { events, socket } = make();
    syncReadState(socket, "r1", "u1", canMarkRead(true, "visible"));
    expect(events).toEqual([["chatView", { roomId: "r1", visible: false }]]);
  });

  test("un-minimizing reports visible, then marks read", () => {
    const { events, socket } = make();
    syncReadState(socket, "r1", "u1", canMarkRead(false, "visible"));
    expect(events).toEqual([
      ["chatView", { roomId: "r1", visible: true }],
      ["markAsRead", { roomId: "r1", userId: "u1" }],
    ]);
  });
});
