const {
  MIN_AGE,
  ADULT_AGE,
  LEGAL_VERSION,
  AGE_GATE_STATUS: S,
  getAgeInJerusalem,
  getAgeGateStatus,
  isPlausibleBirthDate,
} = require('./ageGate');

const NOW = new Date('2026-10-18T12:00:00Z');
const born = (age) => `${2026 - age}-06-01`; // birthday already passed in 2026 by Oct
const accepted = { termsAcceptedAt: NOW, termsVersion: LEGAL_VERSION };

describe('getAgeInJerusalem', () => {
  test('counts whole years, birthday boundary in Jerusalem time', () => {
    expect(getAgeInJerusalem('2010-10-18', NOW)).toBe(16);
    expect(getAgeInJerusalem('2010-10-19', NOW)).toBe(15);
  });
  test('null for missing / invalid', () => {
    expect(getAgeInJerusalem(null, NOW)).toBeNull();
    expect(getAgeInJerusalem('not-a-date', NOW)).toBeNull();
  });
});

describe('getAgeGateStatus', () => {
  test('no user or birth date -> NEEDS_BIRTHDATE', () => {
    expect(getAgeGateStatus(null, NOW)).toBe(S.NEEDS_BIRTHDATE);
    expect(getAgeGateStatus({ ...accepted }, NOW)).toBe(S.NEEDS_BIRTHDATE);
  });
  test('under the minimum age is blocked even with terms accepted', () => {
    expect(getAgeGateStatus({ birthDate: born(MIN_AGE - 1), ...accepted }, NOW)).toBe(S.UNDER_MIN_AGE);
  });
  test('terms missing or for an older version -> NEEDS_TERMS', () => {
    expect(getAgeGateStatus({ birthDate: born(30) }, NOW)).toBe(S.NEEDS_TERMS);
    expect(getAgeGateStatus({ birthDate: born(30), termsAcceptedAt: NOW, termsVersion: 'old' }, NOW)).toBe(S.NEEDS_TERMS);
  });
  test('minor needs guardian consent; adult does not', () => {
    expect(getAgeGateStatus({ birthDate: born(MIN_AGE), ...accepted }, NOW)).toBe(S.NEEDS_GUARDIAN_CONSENT);
    expect(getAgeGateStatus({ birthDate: born(ADULT_AGE - 1), ...accepted, guardianConsentAt: NOW }, NOW)).toBe(S.OK);
    expect(getAgeGateStatus({ birthDate: born(ADULT_AGE), ...accepted }, NOW)).toBe(S.OK);
  });
});

describe('isPlausibleBirthDate', () => {
  test('rejects future and absurd dates', () => {
    expect(isPlausibleBirthDate('2027-01-01', NOW)).toBe(false);
    expect(isPlausibleBirthDate('1890-01-01', NOW)).toBe(false);
    expect(isPlausibleBirthDate('2000-01-01', NOW)).toBe(true);
  });
});
