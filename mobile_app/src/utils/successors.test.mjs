import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleSuccessors } from './successors.ts';

test('excludes the leaver and anyone not confirmed', () => {
    const out = eligibleSuccessors([
        { id: 'me' },
        { id: 'a', status: 'CONFIRMED' },
        { id: 'b', status: 'WAITLISTED' },
        { id: 'c' },
    ], 'me');
    assert.deepEqual(out.map((p) => p.id), ['a', 'c']);
});

test('no eligible successor yields an empty list', () => {
    assert.deepEqual(eligibleSuccessors([{ id: 'me' }, { id: 'w', status: 'WAITLISTED' }], 'me'), []);
    assert.deepEqual(eligibleSuccessors(undefined, 'me'), []);
});
