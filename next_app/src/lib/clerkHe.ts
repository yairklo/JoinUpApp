import { heIL } from "@clerk/localizations";

/** Hebrew Clerk copy plus leftover English placeholders the stock `heIL` pack still misses. */
export const clerkHe = {
  ...heIL,
  formFieldInputPlaceholder__emailAddress: "כתובת אימייל",
  formFieldInputPlaceholder__emailAddress_username: "אימייל או שם משתמש",
  formFieldInputPlaceholder__password: "סיסמה",
  formFieldInputPlaceholder__confirmPassword: "אימות סיסמה",
  formFieldInputPlaceholder__phoneNumber: "מספר טלפון",
  formFieldInputPlaceholder__firstName: "שם פרטי",
  formFieldInputPlaceholder__lastName: "שם משפחה",
  formFieldHintText__optional: "אופציונלי",
  formFieldInputPlaceholder__identifier: "אימייל או טלפון",
} as typeof heIL;

export const clerkAppearance = {
  layout: {
    shimmer: false,
  },
  elements: {
    // Display data (name, avatar, username) lives in our DB and is edited on /profile. Clerk's
    // "manage account" modal is for credentials only, so hide its name/image/username sections.
    profileSection__profile: { display: "none" },
    profileSection__username: { display: "none" },
    footerAction__clerk: { display: "none" },
    footerPages: { display: "none" },
    footer: {
      "& a[href*='clerk.com'], & a[href*='clerk.dev']": { display: "none" },
    },
  },
} as const;
