import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberDeepLink, consumeDeepLink } from './pendingDeepLink.ts';

test('remembers once, then clears', () => {
    rememberDeepLink('/games/42');
    assert.equal(consumeDeepLink(), '/games/42');
    assert.equal(consumeDeepLink(), null);
});
test('ignores root, auth and unsafe paths', () => {
    for (const p of ['/', '/sign-in', '/sign-up', '//evil.com', 'https://x.y', '', null, undefined]) rememberDeepLink(p);
    assert.equal(consumeDeepLink(), null);
});
