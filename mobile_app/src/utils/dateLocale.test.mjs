import test from 'node:test';
import assert from 'node:assert/strict';
import { dateLocaleFor, formatDate, formatTimeOfDay } from './dateLocale.ts';

test('Hebrew and unknown languages use he-IL', () => {
  assert.equal(dateLocaleFor('he'), 'he-IL');
  assert.equal(dateLocaleFor(undefined), 'he-IL');
  assert.equal(dateLocaleFor(null), 'he-IL');
  assert.equal(dateLocaleFor('fr'), 'he-IL');
});

test('English variants use en-GB', () => {
  assert.equal(dateLocaleFor('en'), 'en-GB');
  assert.equal(dateLocaleFor('en-US'), 'en-GB');
  assert.equal(dateLocaleFor('EN'), 'en-GB');
});

test('time of day is HH:MM in both languages', () => {
  const d = new Date(2026, 9, 29, 9, 5);
  assert.match(formatTimeOfDay(d, 'he'), /^0?9:05/);
  assert.match(formatTimeOfDay(d, 'en'), /^09:05/);
});

test('formatDate follows the language (day first in both)', () => {
  const d = new Date(2026, 9, 29, 12, 0);
  assert.match(formatDate(d, 'he'), new RegExp('^29[.]10[.]2026'));
  assert.match(formatDate(d, 'en'), new RegExp('^29/10/2026'));
});
