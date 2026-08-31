const { stripHtmlTags, capLength, sanitizeFreeText } = require('../utils/sanitize');

describe('stripHtmlTags', () => {
  test('neutralizes the QA-reported XSS payload', () => {
    const payload = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const cleaned = stripHtmlTags(payload);
    expect(cleaned).toBe('alert(1)');
    expect(cleaned).not.toMatch(/[<>]/);
    expect(cleaned.toLowerCase()).not.toContain('<script');
    expect(cleaned.toLowerCase()).not.toContain('onerror');
  });

  test('leaves no unmatched angle brackets on nested/malformed markup', () => {
    // Regardless of how tags are nested or malformed, the fixed-point loop guarantees no
    // "<...>" construct survives -- this guards against any future tweak to the regex that
    // might otherwise leave a single pass incomplete.
    const cleaned = stripHtmlTags('<scr<script>ipt>alert(1)</scr</script>ipt>');
    expect(cleaned).not.toMatch(/<[^<]*>/);
  });

  test('leaves ordinary plain text untouched', () => {
    expect(stripHtmlTags('כדורגל שישי בערב')).toBe('כדורגל שישי בערב');
    expect(stripHtmlTags('Friday 5pm, bring your own ball!')).toBe('Friday 5pm, bring your own ball!');
  });

  test('known limitation: a bare "<" followed later by ">" reads as a tag', () => {
    // This is the documented tradeoff of a regex tag-stripper vs. a real HTML parser -- it's
    // an acceptable cost for fields where no markup is ever legitimate (titles/descriptions),
    // and it fails safe (over-strips) rather than failing open (misses a real payload).
    expect(stripHtmlTags('5 < 10 and 10 > 5')).toBe('5  5');
  });

  test('passes through non-string input unchanged', () => {
    expect(stripHtmlTags(undefined)).toBeUndefined();
    expect(stripHtmlTags(null)).toBeNull();
    expect(stripHtmlTags(42)).toBe(42);
  });
});

describe('capLength', () => {
  test('truncates strings longer than the limit', () => {
    expect(capLength('a'.repeat(10), 5)).toBe('aaaaa');
  });

  test('leaves shorter strings and non-strings untouched', () => {
    expect(capLength('short', 200)).toBe('short');
    expect(capLength(undefined, 200)).toBeUndefined();
  });
});

describe('sanitizeFreeText', () => {
  test('strips tags then enforces the length cap', () => {
    const payload = `<script>alert(1)</script>${'x'.repeat(300)}`;
    const result = sanitizeFreeText(payload, 200);
    expect(result).not.toMatch(/[<>]/);
    expect(result.length).toBe(200);
  });

  test('is safe to call on undefined/null for partial-update code paths', () => {
    // gameService.updateGame uses `typeof title !== 'undefined'` to decide whether a field
    // was provided at all; sanitizeFreeText must not turn "not provided" into an empty string.
    expect(sanitizeFreeText(undefined, 200)).toBeUndefined();
    expect(sanitizeFreeText(null, 200)).toBeNull();
  });
});
