import NextLink from "next/link";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Link from "@mui/material/Link";
import { OPERATOR } from "@joinup/shared/legal";

export const metadata = {
  title: "מחיקת חשבון — JoinUp",
};

const PATH = "/account-deletion";

// Wording mirrors the account-deletion handler (server/routes/users.js, DELETE /api/users/me) and
// the Privacy Policy (shared/legal.js, sections 8 and 10). Keep them in sync; do not add retention
// periods that the policy does not state.
const COPY = {
  he: {
    title: "מחיקת חשבון JoinUp",
    intro: "בעמוד זה מוסבר כיצד למחוק את חשבון JoinUp והמידע האישי הקשור אליו, מה נמחק ומה נשמר, וכיצד לבקש מחיקה גם ללא גישה לאפליקציה.",
    howHeading: "איך מוחקים את החשבון",
    howIntro: "אפשר למחוק את החשבון בעצמך בכל עת:",
    how: [
      "באפליקציה לנייד: הגדרות ← מחיקת חשבון, ואז אישור המחיקה.",
      "באתר: פרופיל ← הגדרות (/profile/settings) ← מחיקת חשבון ← \"מחק את החשבון שלי\", והקלדת המילה \"מחק\" לאישור.",
    ],
    howNote: "המחיקה מתבצעת מיד ולא ניתן לשחזר אותה.",
    deletedHeading: "מה נמחק",
    deleted: [
      "חשבון ההתחברות שלך (Clerk).",
      "שמך, כתובת הדוא\"ל, הטלפון, התמונה, העיר, תאריך הלידה והמגדר.",
      "הדירוגים, החברויות, החסימות והפניות לתמיכה.",
      "תוכן ההודעות שלך בצ'אטים.",
      "תגובות על מגרשים יימחקו או ירוקנו מתוכן.",
      "הרשמות למשחקים, התראות והגדרות ההתראות.",
    ],
    keptHeading: "מה נשמר",
    kept: [
      "החשבון יישמר כרשומה אנונימית (\"משתמש שנמחק\"), ללא פרטים אישיים, כדי לשמור על שלמות המשחקים וההיסטוריה של משתמשים אחרים.",
      "עותקי גיבוי ויומני מערכת עשויים להישמר לתקופה מוגבלת של עד 30 יום, ומידע מסוים עשוי להישמר זמן ארוך יותר אם הדבר נדרש על פי דין או לצורך בירור תלונה או מחלוקת.",
    ],
    noAppHeading: "בקשת מחיקה ללא גישה לאפליקציה",
    noApp: `אם אין לך גישה לאפליקציה או לאתר, אפשר לבקש מחיקה בדוא"ל אל ${OPERATOR.email}. נשיב בהתאם למועדים הקבועים בדין.`,
    guardianHeading: "הורים ואפוטרופוסים של קטינים",
    guardian: `הורה או אפוטרופוס רשאי לפנות אלינו בדוא"ל אל ${OPERATOR.email} כדי לבקש את מחיקת חשבון הקטין שבאחריותו.`,
    policyPrefix: "למידע נוסף ראו את",
    policyLink: "מדיניות הפרטיות",
    switchLabel: "English",
  },
  en: {
    title: "Delete your JoinUp account",
    intro: "This page explains how to delete your JoinUp account and the personal data linked to it, what is deleted and what is kept, and how to request deletion without access to the app.",
    howHeading: "How to delete your account",
    howIntro: "You can delete your account yourself at any time:",
    how: [
      "In the mobile app: Settings → Delete account, then confirm the deletion.",
      "On the website: Profile → Settings (/profile/settings) → Delete account → \"Delete my account\" (the confirmation field asks you to type the Hebrew word \"מחק\").",
    ],
    howNote: "Deletion takes effect immediately and cannot be undone.",
    deletedHeading: "What is deleted",
    deleted: [
      "Your sign-in account (Clerk).",
      "Your name, email address, phone number, picture, city, date of birth and gender.",
      "Your ratings, friendships, blocks and support inquiries.",
      "The content of your chat messages.",
      "Pitch comments are deleted or emptied of content.",
      "Your game sign-ups, notifications and notification settings.",
    ],
    keptHeading: "What is kept",
    kept: [
      "The account is retained as an anonymous record (\"Deleted User\"), without personal details, to preserve the integrity of other users' matches and history.",
      "Backups and system log copies may be retained for a limited period of up to 30 days, and certain information may be retained longer if required by law or for investigating a complaint or dispute.",
    ],
    noAppHeading: "Requesting deletion without app access",
    noApp: `If you cannot access the app or website, you can request deletion by email at ${OPERATOR.email}. We will respond within the timeframes prescribed by law.`,
    guardianHeading: "Parents and guardians of minors",
    guardian: `A parent or legal guardian may email ${OPERATOR.email} to request deletion of the account of a minor under their responsibility.`,
    policyPrefix: "For more information see the",
    policyLink: "Privacy Policy",
    switchLabel: "עברית",
  },
} as const;

/** Public (guest-accessible) account-deletion page, linked from the Google Play data-safety form. */
export default async function AccountDeletionPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await props.searchParams;
  const isEn = lang === "en";
  const t = isEn ? COPY.en : COPY.he;
  const listSx = { paddingInlineStart: 3, my: 0, "& li": { mb: 0.75 } };

  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir={isEn ? "ltr" : "rtl"} lang={isEn ? "en" : "he"}>
      <Stack spacing={2.5}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" gap={2} flexWrap="wrap">
          <Typography variant="h4" component="h1" fontWeight={800}>{t.title}</Typography>
          <Link component={NextLink} href={isEn ? PATH : `${PATH}?lang=en`} underline="hover" lang={isEn ? "he" : "en"}>
            {t.switchLabel}
          </Link>
        </Stack>
        <Typography>{t.intro}</Typography>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.howHeading}</Typography>
          <Typography>{t.howIntro}</Typography>
          <Typography component="ul" sx={listSx}>
            {t.how.map((item) => <li key={item}>{item}</li>)}
          </Typography>
          <Typography>{t.howNote}</Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.deletedHeading}</Typography>
          <Typography component="ul" sx={listSx}>
            {t.deleted.map((item) => <li key={item}>{item}</li>)}
          </Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.keptHeading}</Typography>
          <Typography component="ul" sx={listSx}>
            {t.kept.map((item) => <li key={item}>{item}</li>)}
          </Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.noAppHeading}</Typography>
          <Typography>{t.noApp}</Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.guardianHeading}</Typography>
          <Typography>{t.guardian}</Typography>
        </Stack>

        <Typography>
          {t.policyPrefix}{" "}
          <Link component={NextLink} href={isEn ? "/legal/privacy?lang=en" : "/legal/privacy"} underline="hover">
            {t.policyLink}
          </Link>
          .
        </Typography>
      </Stack>
    </Container>
  );
}
