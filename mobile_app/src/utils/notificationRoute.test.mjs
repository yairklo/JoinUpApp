import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNotificationRoute as r, normalizeNotificationLink } from './notificationRoute.ts';

test('chat, game, series, tournament ids win over link', () => {
  assert.equal(r({ type: 'NEW_MESSAGE', data: { chatId: 'c1', link: '/game/x' } }), '/chat/c1');
  assert.equal(r({ type: 'GAME_UPDATED', data: { gameId: 'g1' } }), '/game/g1');
  assert.equal(r({ type: 'NEW_SERIES_GAME', data: { seriesId: 's1' } }), '/series/s1');
  assert.equal(r({ type: 'TOURNAMENT_MATCH_SCHEDULED', data: { tournamentId: 't1', matchId: 'm1' } }), '/tournaments/t1');
});

test('game wins over series when both present', () => {
  assert.equal(r({ data: { gameId: 'g1', seriesId: 's1' } }), '/game/g1');
});

test('tournament invite and friend types', () => {
  assert.equal(r({ type: 'TOURNAMENT_TEAM_INVITE', data: { tournamentId: 't1' } }), '/tournaments/invites');
  assert.equal(r({ type: 'FRIEND_REQUEST', data: { link: '/friends' } }), '/friends');
  assert.equal(r({ type: 'FRIEND_ACCEPTED', data: { userId: 'u1' } }), '/user/u1');
});

test('type can come from payload data (push)', () => {
  assert.equal(r({ data: { type: 'FRIEND_REQUEST' } }), '/friends');
});

test('link normalization', () => {
  assert.equal(normalizeNotificationLink('/games/g9'), '/game/g9');
  assert.equal(normalizeNotificationLink('/profile/u2'), '/user/u2');
  assert.equal(normalizeNotificationLink('/profile/settings'), null);
  assert.equal(normalizeNotificationLink('https://evil.example'), null);
  assert.equal(normalizeNotificationLink('//evil.example'), null);
  assert.equal(normalizeNotificationLink('/'), null);
});

test('unknown payload returns null', () => {
  assert.equal(r({ type: 'GENERIC', data: {} }), null);
  assert.equal(r({}), null);
  assert.equal(r({ data: { link: '/' } }), null);
});
