import type { PrivacyLevel, PrivacySettings } from "@/services/api/users";

export const PRIVACY_LABEL_EVERYONE = "כולם";
export const PRIVACY_LABEL_FRIENDS_ONLY = "חברים בלבד";
export const PRIVACY_LABEL_DEFAULT_FALLBACK = "ברירת מחדל";

export function privacyLevelLabel(level: PrivacyLevel): string {
    return level === "EVERYONE" ? PRIVACY_LABEL_EVERYONE : PRIVACY_LABEL_FRIENDS_ONLY;
}

/**
 * Label of the "default" option: always the age default's own text, independent of the
 * stored/edited value. The generic fallback is only for older servers without ageDefaults.
 */
export function defaultOptionLabel(
    ageDefaults: PrivacySettings["ageDefaults"] | null | undefined,
    key: keyof NonNullable<PrivacySettings["ageDefaults"]>
): string {
    const level = ageDefaults?.[key];
    return level ? privacyLevelLabel(level) : PRIVACY_LABEL_DEFAULT_FALLBACK;
}
