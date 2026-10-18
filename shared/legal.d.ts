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

export declare const LEGAL_VERSION: string;
export declare const LEGAL_IS_DRAFT: boolean;
export declare const LEGAL_LAST_UPDATED: string;
export declare const OPERATOR: {
  name: string;
  registrationId: string;
  address: string;
  email: string;
  jurisdiction: string;
};
export declare const TERMS: LegalDocument;
export declare const PRIVACY: LegalDocument;
export declare const TERMS_ACCEPT_LABEL: string;
export declare const GUARDIAN_DECLARATION_LABEL: string;
