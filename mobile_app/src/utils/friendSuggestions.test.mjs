import test from 'node:test';
import assert from 'node:assert/strict';
import { friendSuggestions, mergeFriendsFirst } from './friendSuggestions.ts';

const f = (id, name) => ({ id, name });

test('friendSuggestions: excludes members, dedupes, sorts by name', () => {
    const out = friendSuggestions([f('3', 'תמר'), f('1', 'אבי'), f('2', 'בני'), f('1', 'אבי')], new Set(['2']));
    assert.deepEqual(out.map((x) => x.id), ['1', '3']);
});

test('friendSuggestions: empty when all friends are excluded', () => {
    assert.deepEqual(friendSuggestions([f('1', 'אבי')], new Set(['1'])), []);
});

test('mergeFriendsFirst: friend matches first and flagged, no duplicates, exclusions kept', () => {
    const friends = [f('1', 'דני כהן'), f('2', 'דנה לוי')];
    const results = [f('9', 'דניאל'), f('2', 'דנה לוי'), f('8', 'דנית')];
    const out = mergeFriendsFirst(results, friends, 'דנ', new Set(['8']));
    assert.deepEqual(out.map((x) => [x.id, x.isFriend]), [['2', true], ['1', true], ['9', false]]);
});

test('mergeFriendsFirst: trusts friendshipStatus from search', () => {
    const out = mergeFriendsFirst([f('5', 'x'), { id: '6', name: 'y', friendshipStatus: 'friends' }], [], 'zz', new Set());
    assert.deepEqual(out.map((x) => [x.id, x.isFriend]), [['6', true], ['5', false]]);
});
