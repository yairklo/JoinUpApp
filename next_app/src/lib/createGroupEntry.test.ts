import { parseCreateMode, postCreateGamePath } from "./createGroupEntry";

describe("createGroupEntry", () => {
  it("defaults to a single game unless ?mode=group", () => {
    expect(parseCreateMode(null)).toBe("single");
    expect(parseCreateMode("x")).toBe("single");
    expect(parseCreateMode("group")).toBe("group");
  });

  it("opens the group dialog on the new game only in group mode", () => {
    expect(postCreateGamePath("g1", "single")).toBe("/games/g1");
    expect(postCreateGamePath("g1", "group")).toBe("/games/g1?createGroup=1");
  });
});
