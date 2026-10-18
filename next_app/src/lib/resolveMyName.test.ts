import { resolveMyName } from './resolveMyName';

describe('resolveMyName', () => {
    it('prefers the DB name', () => {
        expect(resolveMyName('Dana', 'Clerk Name')).toBe('Dana');
    });
    it('falls back to Clerk while the DB name is loading (undefined)', () => {
        expect(resolveMyName(undefined, 'Clerk Name')).toBe('Clerk Name');
    });
    it('falls back to Clerk when the DB name is empty or blank', () => {
        expect(resolveMyName(null, 'Clerk Name')).toBe('Clerk Name');
        expect(resolveMyName('  ', 'Clerk Name')).toBe('Clerk Name');
    });
    it('returns empty string when neither exists', () => {
        expect(resolveMyName(null, null)).toBe('');
    });
});
