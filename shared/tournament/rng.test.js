const { createRng, shuffle } = require('./rng');

describe('rng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const a = createRng(7);
    const b = createRng(7);
    const seqA = [a(), a(), a()];
    expect(seqA).toEqual([b(), b(), b()]);
    expect(createRng(8)()).not.toBe(createRng(7)());
    expect(createRng('x')()).toBe(createRng('x')());
  });

  it('yields values in [0, 1)', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i += 1) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('shuffles to a permutation without mutating the input', () => {
    const input = Array.from({ length: 20 }, (_, i) => i);
    const copy = input.slice();
    const out = shuffle(input, 42);
    expect(input).toEqual(copy);
    expect(out.slice().sort((x, y) => x - y)).toEqual(copy);
    expect(shuffle(input, 42)).toEqual(out);
    expect(shuffle(input, 43)).not.toEqual(out);
  });
});
