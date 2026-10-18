import { formatHebrewDateRelative } from "./hebrewDate";

describe("formatHebrewDateRelative", () => {
  const today = "2026-10-18"; // a Sunday

  it("labels today and tomorrow", () => {
    expect(formatHebrewDateRelative("2026-10-18", today)).toBe("היום");
    expect(formatHebrewDateRelative("19/10/2026", today)).toBe("מחר");
  });

  it("uses short weekday + day.month further out, from ISO or DD/MM/YYYY", () => {
    const iso = formatHebrewDateRelative("2026-10-23", today);
    expect(iso).toMatch(/· 23\.10$/);
    expect(formatHebrewDateRelative("23/10/2026", today)).toBe(iso);
  });

  it("does not call past dates today/tomorrow", () => {
    expect(formatHebrewDateRelative("2026-10-17", today)).toMatch(/· 17\.10$/);
  });

  it("returns unparseable input unchanged", () => {
    expect(formatHebrewDateRelative("not a date", today)).toBe("not a date");
    expect(formatHebrewDateRelative(undefined, today)).toBe("");
  });
});
