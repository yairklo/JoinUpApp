const {
  LOADING_MOTIFS,
  LOADING_MOTIF_IDS,
  LOADING_MOTIF_FAMILY_LABELS,
  isLoadingMotifId,
} = require("./loadingMotifs");

test("motif ids are unique, complete, and include the live game-page loader", () => {
  expect(LOADING_MOTIF_IDS).toHaveLength(LOADING_MOTIFS.length);
  expect(new Set(LOADING_MOTIF_IDS).size).toBe(LOADING_MOTIFS.length);
  expect(LOADING_MOTIF_IDS).toContain("bouncing-ball");
  expect(isLoadingMotifId("bouncing-ball")).toBe(true);
  expect(isLoadingMotifId("not-a-motif")).toBe(false);
});

test("every family has a Hebrew/English label", () => {
  for (const motif of LOADING_MOTIFS) {
    const labels = LOADING_MOTIF_FAMILY_LABELS[motif.family];
    expect(labels?.he).toBeTruthy();
    expect(labels?.en).toBeTruthy();
    expect(motif.labelHe).toBeTruthy();
    expect(motif.suggestedHe).toBeTruthy();
  }
});
