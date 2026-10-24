import { buildSaveInput, initEditorState, liveWarnings, tennisErrors } from "./resultEditorState";

const roster = [
  { userId: "u1", name: "דני", imageUrl: null, sideId: null },
  { userId: "u2", name: "רון", imageUrl: null, sideId: null },
];
const teams = [
  { id: "t1", name: "האדומים", color: "#f00", playerIds: ["u1"] },
  { id: "t2", name: "הכחולים", color: "#00f", playerIds: ["u2"] },
];

describe("resultEditorState", () => {
  it("seeds sides and players from teams", () => {
    const f = initEditorState("SOCCER", null, roster, teams);
    expect(f.labels).toEqual(["האדומים", "הכחולים"]);
    expect(f.players.u1.sideOrder).toBe(0);
    expect(f.players.u2.sideOrder).toBe(1);
  });

  it("builds a soccer body dropping zero stats", () => {
    const f = initEditorState("SOCCER", null, roster, teams);
    f.scores = [2, 1];
    f.players.u1.values = { goals: 2, assists: 0 };
    const body = buildSaveInput("SOCCER", f);
    expect(body.sides[0]).toMatchObject({ label: "האדומים", teamId: "t1", score: 2 });
    expect(body.stats).toEqual([
      { userId: "u1", sideOrder: 0, values: { goals: 2 } },
      { userId: "u2", sideOrder: 1, values: {} },
    ]);
    expect(body.notes).toBeNull();
  });

  it("sends tennis sets on side 0 only", () => {
    const f = initEditorState("TENNIS", null, [], []);
    f.sets = [[6, 4], [6, 3]];
    const body = buildSaveInput("TENNIS", f);
    expect(body.sides[0].sets).toEqual([[6, 4], [6, 3]]);
    expect(body.sides[0].score).toBeUndefined();
    expect(body.bestOf).toBe(3);
  });

  it("reports tennis errors and winner", () => {
    expect(tennisErrors([[6, 4]]).match).toBe("MATCH_INCOMPLETE");
    expect(tennisErrors([[6, 4], [5, 5]]).rows[1]).toBe("INVALID_SET_SCORE");
    expect(tennisErrors([[6, 4], [6, 3]]).winner).toBe(0);
  });

  it("warns when player goals exceed the side score", () => {
    const f = initEditorState("SOCCER", null, roster, teams);
    f.scores = [1, 0];
    f.players.u1.values = { goals: 2 };
    expect(liveWarnings("SOCCER", f)).toEqual([{ sideOrder: 0, key: "goals", sum: 2, teamScore: 1 }]);
  });
});
