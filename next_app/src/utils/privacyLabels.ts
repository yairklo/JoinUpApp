import type { PrivacyLevel, PrivacySettings } from "@/services/api/users";

export const PRIVACY_LABEL_EVERYONE = "כולם";
export const PRIVACY_LABEL_FRIENDS_ONLY = "חברים בלבד";
export const PRIVACY_LABEL_DEFAULT_FALLBACK = "ברירת מחדל";

export function privacyLevelLabel(level: PrivacyLevel): string {
    return level === "EVERYONE" ? PRIVACY_LABEL_EVERYONE : PRIVACY_LABEL_FRIENDS_ONLY;
}

/**
 * Label of the "default" option: the age default's own text plus "(ברירת מחדל)", e.g.
 * "כולם (ברירת מחדל)" — without the suffix it reads exactly like the explicit "כולם" option below
 * it. Independent of the stored/edited value. The bare generic label is only for older servers
 * without ageDefaults.
 */
export function defaultOptionLabel(
    ageDefaults: PrivacySettings["ageDefaults"] | null | undefined,
    key: keyof NonNullable<PrivacySettings["ageDefaults"]>
): string {
    const level = ageDefaults?.[key];
    return level ? `${privacyLevelLabel(level)} (${PRIVACY_LABEL_DEFAULT_FALLBACK})` : PRIVACY_LABEL_DEFAULT_FALLBACK;
}
