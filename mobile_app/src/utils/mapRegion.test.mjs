import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveInitialMapRegion } from './mapRegion.ts';

const FALLBACK = { latitude: 32.0853, longitude: 34.7818, latitudeDelta: 0.1, longitudeDelta: 0.1 };

test('uses the selected field when it has coordinates, even with a cached location', () => {
  const r = resolveInitialMapRegion({ lat: 31.5, lng: 34.9 }, { latitude: 1, longitude: 2 }, FALLBACK);
  assert.equal(r.latitude, 31.5);
  assert.equal(r.longitude, 34.9);
});

test('falls back to the cached user location when the field has no coordinates', () => {
  const r = resolveInitialMapRegion({ lat: null, lng: null }, { latitude: 1, longitude: 2 }, FALLBACK);
  assert.deepEqual([r.latitude, r.longitude], [1, 2]);
});

test('treats a 0 coordinate as valid', () => {
  const r = resolveInitialMapRegion({ lat: 0, lng: 0 }, null, FALLBACK);
  assert.deepEqual([r.latitude, r.longitude], [0, 0]);
});

test('falls back to the default region when nothing is known', () => {
  assert.equal(resolveInitialMapRegion(null, null, FALLBACK), FALLBACK);
});
