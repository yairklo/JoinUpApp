import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDeviceLanguage } from './deviceLanguage.ts';

test('legacy Android code iw maps to he', () => {
  assert.equal(resolveDeviceLanguage({ languageCode: 'iw', languageTag: 'he-IL' }), 'he');
  assert.equal(resolveDeviceLanguage({ languageCode: 'iw' }), 'he');
});
test('he code and he-IL / he_IL tags map to he', () => {
  assert.equal(resolveDeviceLanguage({ languageCode: 'he' }), 'he');
  assert.equal(resolveDeviceLanguage({ languageCode: null, languageTag: 'he-IL' }), 'he');
  assert.equal(resolveDeviceLanguage({ languageTag: 'HE_il' }), 'he');
});
test('other or missing locales fall back to en', () => {
  assert.equal(resolveDeviceLanguage({ languageCode: 'en', languageTag: 'en-US' }), 'en');
  assert.equal(resolveDeviceLanguage({ languageCode: 'ar', languageTag: 'ar-EG' }), 'en');
  assert.equal(resolveDeviceLanguage(undefined), 'en');
});
