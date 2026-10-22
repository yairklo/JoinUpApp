import { formatStatText, orderedStatKeys, parseScore, winRatePct } from './matchStatsFormat';

describe('matchStatsFormat', () => {
    it('parses "mine-theirs" scores', () => {
        expect(parseScore('3-2')).toEqual([3, 2]);
        expect(parseScore(null)).toBeNull();
        expect(parseScore('abc')).toBeNull();
    });

    it('computes a rounded win rate and hides it with no sided games', () => {
        expect(winRatePct(7, 2, 3)).toBe(58);
        expect(winRatePct(0, 0, 0)).toBeNull();
    });

    it('orders non-zero keys and formats singular/binary values', () => {
        expect(orderedStatKeys('SOCCER', { goals: 0, assists: 0 })).toEqual([]);
        const keys = orderedStatKeys('SOCCER', { goals: 2, mvp: 1 });
        expect(keys[0]).toBe('goals');
        expect(formatStatText('SOCCER', 'goals', 2)).toMatch(/^2 /);
        expect(formatStatText('SOCCER', 'goals', 1)).toBe('1 שער');
        expect(formatStatText('TENNIS', 'aces', 1)).toMatch(/^1 /);
        expect(formatStatText('SOCCER', 'mvp', 1)).toMatch(/^⭐/);
    });
});
