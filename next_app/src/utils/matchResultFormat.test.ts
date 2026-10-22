import { formatStatParts, groupStatsBySide, scoreAriaLabel } from './matchResultFormat';
import type { GameResultData } from '@/types/matchResult';

const side = (order: number, score: number, outcome: 'WIN' | 'LOSS' | 'DRAW') => ({
    id: `s${order}`, order, teamId: null, label: order ? 'הכחולים' : 'האדומים', score, sets: null, outcome,
});

describe('matchResultFormat', () => {
    it('formats singular, plural and binary stats', () => {
        expect(formatStatParts('SOCCER', { goals: 2, assists: 1, cleanSheet: 1, mvp: 1, saves: 0 })).toEqual([
            '2 שערים', '1 בישול', 'רשת נקייה', '⭐ שחקן המשחק',
        ]);
        expect(formatStatParts('SOCCER', {})).toEqual([]);
    });

    it('groups by side then unassigned, dropping empty rows', () => {
        const result = {
            sides: [side(1, 3, 'WIN'), side(0, 2, 'LOSS')],
            stats: [
                { userId: 'a', sideId: 's1', values: { goals: 1 } },
                { userId: 'b', sideId: 's0', values: { goals: 0 } },
                { userId: 'c', sideId: null, values: { goals: 1 } },
            ],
        } as unknown as GameResultData;
        expect(groupStatsBySide(result).map((g) => g.key)).toEqual(['s1', 'none']);
    });

    it('builds the score aria label', () => {
        expect(scoreAriaLabel([side(0, 2, 'LOSS'), side(1, 3, 'WIN')])).toBe('האדומים 2, הכחולים 3. ניצחון להכחולים');
        expect(scoreAriaLabel([side(0, 2, 'DRAW'), side(1, 2, 'DRAW')])).toBe('תיקו 2–2');
    });
});
