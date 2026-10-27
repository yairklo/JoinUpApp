import { friendSuggestions, mergeFriendsFirst } from "./friendSuggestions";

const f = (id: string, name: string) => ({ id, name });

describe("friendSuggestions", () => {
    it("excludes members, dedupes, sorts by name", () => {
        const out = friendSuggestions([f("3", "תמר"), f("1", "אבי"), f("2", "בני"), f("1", "אבי")], new Set(["2"]));
        expect(out.map((x) => x.id)).toEqual(["1", "3"]);
    });
    it("is empty when all friends are excluded", () => {
        expect(friendSuggestions([f("1", "אבי")], new Set(["1"]))).toEqual([]);
    });
});

describe("mergeFriendsFirst", () => {
    it("puts friend matches first, flagged, without duplicates or excluded ids", () => {
        const friends = [f("1", "דני כהן"), f("2", "דנה לוי")];
        const results = [f("9", "דניאל"), f("2", "דנה לוי"), f("8", "דנית")];
        const out = mergeFriendsFirst(results, friends, "דנ", new Set(["8"]));
        expect(out.map((x) => [x.id, x.isFriend])).toEqual([["2", true], ["1", true], ["9", false]]);
    });
    it("trusts friendshipStatus from search", () => {
        const out = mergeFriendsFirst([f("5", "x"), { id: "6", name: "y", friendshipStatus: "friends" }], [], "zz", new Set());
        expect(out.map((x) => [x.id, x.isFriend])).toEqual([["6", true], ["5", false]]);
    });
});
