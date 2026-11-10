import NextLink from "next/link";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";

const PATH = "/accessibility";

// TODO(owner): replace the placeholder contact details below before relying on this page publicly.
const PLACEHOLDER = {
  he: "[להשלים: שם רכז/ת הנגישות]",
  en: "[TO BE FILLED: accessibility coordinator name]",
};

const COPY = {
  he: {
    title: "הצהרת נגישות",
    switchLabel: "English",
    intro:
      "JoinUp רואה חשיבות בהנגשת האתר והאפליקציה לאנשים עם מוגבלות, ופועלת לשיפור מתמיד של השימוש בהם.",
    levelHeading: "רמת ההתאמה",
    level:
      "האתר והאפליקציה עומדים בהתאמה חלקית (partial conformance) לתקן הישראלי ת\"י 5568, המבוסס על הנחיות WCAG 2.0 ברמה AA. אנו ממשיכים לבצע בדיקות ותיקונים, וההצהרה תעודכן עם התקדמות העבודה.",
    doneHeading: "מה כבר קיים",
    done: [
      "תמיכה בעברית (כתיבה מימין לשמאל) ובאנגלית.",
      "ניווט במקלדת ומחוונים נראים של מיקוד ברכיבים נפוצים.",
      "מצב כהה ומצב בהיר.",
      "תמיכה בקוראי מסך ברכיבי ניווט ובחלק גדול מהכפתורים והטפסים.",
      "כיבוד הגדרת מערכת ההפעלה להפחתת תנועה.",
    ],
    limitsHeading: "מגבלות ידועות",
    limits: [
      "חלק מכפתורי האייקונים והשדות בטפסים עדיין חסרים תוויות לקוראי מסך, ואנו מתקנים אותם.",
      "המפה (באתר ובאפליקציה) אינה נגישה במלואה לקוראי מסך. רשימת המגרשים מציגה את אותו מידע בצורה נגישה יותר.",
      "ייתכנו אזורים שבהם ניגודיות הצבעים או סדר הכותרות עדיין אינם עומדים בדרישות.",
      "בחלק ממסכי האפליקציה, שטחי המגע קטנים מ-44x44 פיקסלים.",
      "תוכן שמועלה על ידי משתמשים (שמות, תמונות, הודעות) אינו תמיד נגיש, למשל תמונות ללא תיאור טקסטואלי.",
    ],
    dateHeading: "תאריך עדכון",
    date: "הצהרה זו נכתבה ב-10 בנובמבר 2026 והיא תעודכן מעת לעת.",
    contactHeading: "פניות בנושא נגישות",
    contactIntro:
      "נתקלתם בבעיית נגישות או שיש לכם הצעה לשיפור? נשמח לשמוע ולטפל בהקדם.",
    coordinator: "רכז/ת נגישות",
    name: "שם",
    email: "דוא\"ל",
    phone: "טלפון",
    placeholderName: PLACEHOLDER.he,
    placeholderEmail: "[להשלים: כתובת דוא\"ל]",
    placeholderPhone: "[להשלים: מספר טלפון]",
    backLabel: "חזרה לדף הבית",
  },
  en: {
    title: "Accessibility Statement",
    switchLabel: "עברית",
    intro:
      "JoinUp is committed to making its website and app usable by people with disabilities, and continues to improve them.",
    levelHeading: "Conformance level",
    level:
      "The website and app are in partial conformance with Israeli Standard IS 5568, which is based on WCAG 2.0 level AA. Testing and fixes are ongoing, and this statement will be updated as work progresses.",
    doneHeading: "What is already in place",
    done: [
      "Hebrew (right-to-left) and English support.",
      "Keyboard navigation and visible focus indicators on common components.",
      "Light and dark modes.",
      "Screen reader support in navigation and in many buttons and forms.",
      "Respect for the operating system's reduce-motion setting.",
    ],
    limitsHeading: "Known limitations",
    limits: [
      "Some icon-only buttons and form fields still lack labels for screen readers, and we are fixing them.",
      "The map (web and app) is not fully accessible to screen readers. The fields list presents the same information in a more accessible form.",
      "Some areas may still fall short on color contrast or heading structure.",
      "On some app screens, touch targets are smaller than 44x44 pixels.",
      "User-generated content (names, images, messages) is not always accessible, for example images without a text description.",
    ],
    dateHeading: "Last updated",
    date: "This statement was written on 10 November 2026 and will be updated from time to time.",
    contactHeading: "Accessibility feedback",
    contactIntro:
      "Ran into an accessibility problem or have a suggestion? We would like to hear from you and will respond promptly.",
    coordinator: "Accessibility coordinator",
    name: "Name",
    email: "Email",
    phone: "Phone",
    placeholderName: PLACEHOLDER.en,
    placeholderEmail: "[TO BE FILLED: email address]",
    placeholderPhone: "[TO BE FILLED: phone number]",
    backLabel: "Back to home",
  },
} as const;

export const metadata = {
  title: "הצהרת נגישות — JoinUp",
};

/** Public (guest-accessible) accessibility statement, Hebrew by default, English via ?lang=en. */
export default async function AccessibilityStatementPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { lang } = await props.searchParams;
  const isEn = lang === "en";
  const t = isEn ? COPY.en : COPY.he;
  const listSx = { paddingInlineStart: 3, my: 0, "& li": { mb: 0.75 } };
  // Placeholders are shown in a highlighted, clearly-marked style so they cannot be missed.
  const placeholderSx = { bgcolor: "warning.light", color: "warning.contrastText", px: 0.5, borderRadius: 0.5 };

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
          <Typography variant="h6" component="h2" fontWeight={700}>{t.levelHeading}</Typography>
          <Typography>{t.level}</Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.doneHeading}</Typography>
          <Typography component="ul" sx={listSx}>
            {t.done.map((item) => <li key={item}>{item}</li>)}
          </Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.limitsHeading}</Typography>
          <Typography component="ul" sx={listSx}>
            {t.limits.map((item) => <li key={item}>{item}</li>)}
          </Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.dateHeading}</Typography>
          <Typography>{t.date}</Typography>
        </Stack>

        <Stack spacing={1.25} component="section">
          <Typography variant="h6" component="h2" fontWeight={700}>{t.contactHeading}</Typography>
          <Typography>{t.contactIntro}</Typography>
          <Typography component="ul" sx={listSx}>
            <li>{t.coordinator}: <Typography component="span" sx={placeholderSx}>{t.placeholderName}</Typography></li>
            <li>{t.email}: <Typography component="span" sx={placeholderSx} dir="ltr">{t.placeholderEmail}</Typography></li>
            <li>{t.phone}: <Typography component="span" sx={placeholderSx} dir="ltr">{t.placeholderPhone}</Typography></li>
          </Typography>
        </Stack>

        <Link component={NextLink} href="/" underline="hover">{t.backLabel}</Link>
      </Stack>
    </Container>
  );
}
