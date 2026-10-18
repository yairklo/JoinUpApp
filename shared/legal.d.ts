export type LegalBlock = { p: string } | { ul: string[] };

export interface LegalSection {
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  intro: string[];
  sections: LegalSection[];
}

export interface LegalTexts {
  lang: 'he' | 'en';
  dir: 'rtl' | 'ltr';
  terms: LegalDocument;
  privacy: LegalDocument;
  lastUpdated: string;
  lastUpdatedLabel: string;
  termsAcceptLabel: string;
  guardianDeclarationLabel: string;
}

export declare const LEGAL_VERSION: string;
export declare const LEGAL_IS_DRAFT: boolean;
export declare const LEGAL_LAST_UPDATED: string;
export declare const LEGAL_LAST_UPDATED_EN: string;
export declare const OPERATOR: { name: string; nameEn: string; email: string };
export declare const TERMS: LegalDocument;
export declare const PRIVACY: LegalDocument;
export declare const TERMS_EN: LegalDocument;
export declare const PRIVACY_EN: LegalDocument;
export declare const TERMS_ACCEPT_LABEL: string;
export declare const GUARDIAN_DECLARATION_LABEL: string;
export declare const TERMS_ACCEPT_LABEL_EN: string;
export declare const GUARDIAN_DECLARATION_LABEL_EN: string;
/** Legal texts for a UI language; anything but 'en' gets Hebrew. */
export declare function getLegalTexts(lang?: string | null): LegalTexts;
