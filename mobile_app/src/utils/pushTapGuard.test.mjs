import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldHandlePushTap, notificationDateMs } from './pushTapGuard.ts';

const NOW = 1_800_000_000_000;
const base = { actionIdentifier: 'D', defaultActionIdentifier: 'D', identifier: 'n1', date: NOW / 1000 - 10, lastHandledId: null, now: NOW };

test('fresh default tap is handled', () => assert.equal(shouldHandlePushTap(base), true));
test('already handled id is skipped (relaunch)', () => assert.equal(shouldHandlePushTap({ ...base, lastHandledId: 'n1' }), false));
test('different id after a handled one is handled', () => assert.equal(shouldHandlePushTap({ ...base, lastHandledId: 'n0' }), true));
test('non-default action is ignored', () => assert.equal(shouldHandlePushTap({ ...base, actionIdentifier: 'X' }), false));
test('missing identifier is ignored', () => assert.equal(shouldHandlePushTap({ ...base, identifier: '' }), false));
test('stale notification is ignored (seconds and ms dates)', () => {
  const old = NOW - 3 * 24 * 3600 * 1000;
  assert.equal(shouldHandlePushTap({ ...base, date: old / 1000 }), false);
  assert.equal(shouldHandlePushTap({ ...base, date: old }), false);
  assert.equal(shouldHandlePushTap({ ...base, date: NOW - 1000 }), true);
});
test('unknown date falls back to id guard only', () => {
  assert.equal(shouldHandlePushTap({ ...base, date: null }), true);
  assert.equal(notificationDateMs(NaN), null);
});
