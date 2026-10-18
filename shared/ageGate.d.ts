export declare const MIN_AGE: number;
export declare const ADULT_AGE: number;
export declare const LEGAL_VERSION: string;

export declare const AGE_GATE_STATUS: {
  readonly OK: 'OK';
  readonly NEEDS_BIRTHDATE: 'NEEDS_BIRTHDATE';
  readonly UNDER_MIN_AGE: 'UNDER_MIN_AGE';
  readonly NEEDS_TERMS: 'NEEDS_TERMS';
  readonly NEEDS_GUARDIAN_CONSENT: 'NEEDS_GUARDIAN_CONSENT';
};
export type AgeGateStatus = (typeof AGE_GATE_STATUS)[keyof typeof AGE_GATE_STATUS];

export interface AgeGateUser {
  birthDate?: Date | string | null;
  termsAcceptedAt?: Date | string | null;
  termsVersion?: string | null;
  guardianConsentAt?: Date | string | null;
}

/** Shape returned by GET /api/users/me as `ageGate`. */
export interface AgeGateInfo {
  status: AgeGateStatus;
  age: number | null;
  minAge: number;
  adultAge: number;
  legalVersion: string;
}

export declare function getAgeInJerusalem(birthDate: Date | string | null | undefined, now?: Date): number | null;
export declare function getAgeGateStatus(user: AgeGateUser | null | undefined, now?: Date): AgeGateStatus;
export declare function isPlausibleBirthDate(birthDate: Date | string, now?: Date): boolean;
