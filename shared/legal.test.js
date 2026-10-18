const legal = require('./legal');

describe('legal texts', () => {
  test.each([
    ['terms', legal.TERMS, legal.TERMS_EN],
    ['privacy', legal.PRIVACY, legal.PRIVACY_EN],
  ])('%s: Hebrew and English have the same structure', (_name, he, en) => {
    expect(en.intro).toHaveLength(he.intro.length);
    expect(en.sections.map((s) => s.blocks.map((b) => ('ul' in b ? `ul${b.ul.length}` : 'p'))))
      .toEqual(he.sections.map((s) => s.blocks.map((b) => ('ul' in b ? `ul${b.ul.length}` : 'p'))));
  });

  test('no unfilled [placeholders] remain', () => {
    const strings = (d) => [d.title, ...d.intro, ...d.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b) => ('ul' in b ? b.ul : [b.p]))])];
    const all = [legal.TERMS, legal.PRIVACY, legal.TERMS_EN, legal.PRIVACY_EN].flatMap(strings).join('\n');
    expect(all).not.toMatch(/\[[^\]]*\]/);
  });

  test('getLegalTexts picks English only for "en"', () => {
    expect(legal.getLegalTexts('en')).toMatchObject({ lang: 'en', dir: 'ltr', terms: legal.TERMS_EN });
    expect(legal.getLegalTexts('he')).toMatchObject({ lang: 'he', dir: 'rtl', terms: legal.TERMS });
    expect(legal.getLegalTexts(undefined).lang).toBe('he');
  });
});
