import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";

export const metadata = {
  title: "מדיניות פרטיות — JoinUp",
};

export default function PrivacyPolicyPage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir="rtl">
      <Stack spacing={3}>
        <Typography variant="h4" fontWeight={800}>מדיניות פרטיות</Typography>
        <Alert severity="info">
          זהו מסמך טיוטה לתקופת הבטא (טסטרים). לפני השקה רחבה יש להעביר אותו לבדיקה משפטית.
          עדכון אחרון: 31.08.2026.
        </Alert>

        <Typography>
          JoinUp (&quot;האפליקציה&quot;, &quot;אנחנו&quot;) מפעילה קהילת ספורט לתיאום משחקים בין משתמשים.
          מסמך זה מסביר אילו נתונים אנו אוספים, כיצד אנו משתמשים בהם, וכיצד ניתן לפנות אלינו.
        </Typography>

        <Divider />

        <Typography variant="h6" fontWeight={700}>אילו מידע אנו אוספים</Typography>
        <Typography component="ul" sx={{ pl: 3 }}>
          <li>פרטי חשבון: שם, כתובת אימייל, תמונת פרופיל, טלפון (אופציונלי) — מנוהלים דרך ספק האימות שלנו, Clerk.</li>
          <li>תוכן שנוצר בשימוש: משחקים שיצרת/הצטרפת אליהם, הודעות צ&apos;אט, דירוגים בין שחקנים.</li>
          <li>מיקום: עיר/מגרש שבחרת עבור משחק, לצורך הצגתו למשתמשים אחרים.</li>
          <li>טוקן התראות Push (אם אישרת התראות במכשיר), לצורך שליחת עדכונים על משחקים והודעות.</li>
          <li>נתוני שימוש טכניים לצורך תפעול ואבחון תקלות (כתובת IP, סוג מכשיר, יומני שגיאות).</li>
        </Typography>

        <Typography variant="h6" fontWeight={700}>כיצד אנו משתמשים במידע</Typography>
        <Typography component="ul" sx={{ pl: 3 }}>
          <li>הפעלת הפיצ&apos;רים המרכזיים: יצירה/הצטרפות למשחקים, צ&apos;אט קבוצתי, התראות.</li>
          <li>שמירה על קהילה בטוחה: הודעות עוברות בדיקת מודרציה אוטומטית, וצוות האפליקציה יכול לפעול על תוכן שסומן כפוגעני (כולל הסרת הודעה או השעיית חשבון).</li>
          <li>שיפור המוצר וזיהוי תקלות בתקופת הבטא.</li>
        </Typography>

        <Typography variant="h6" fontWeight={700}>שיתוף עם צדדים שלישיים</Typography>
        <Typography>
          אנו משתמשים בספקים חיצוניים לתפעול השירות בלבד: Clerk (אימות משתמשים), Expo/Firebase
          (שליחת התראות Push), וספקי אחסון/ענן (שרתים ומסד נתונים). אנו לא מוכרים מידע אישי לצדדים שלישיים.
        </Typography>

        <Typography variant="h6" fontWeight={700}>הזכויות שלך</Typography>
        <Typography>
          ניתן לפנות אלינו בכל עת בבקשה לעיין במידע שלך, לתקן אותו, או למחוק את החשבון ואת המידע הנלווה אליו.
        </Typography>

        <Typography variant="h6" fontWeight={700}>תקופת בטא</Typography>
        <Typography>
          האפליקציה נמצאת בשלב טסטים עם משתמשים אמיתיים. ייתכנו שינויים בפיצ&apos;רים, איפוסי נתונים, או הפסקות שירות זמניות ללא התראה מראש.
        </Typography>

        <Typography variant="h6" fontWeight={700}>יצירת קשר</Typography>
        <Typography>
          לשאלות, בקשות מחיקת מידע, או תלונות בנוגע לפרטיות — ניתן לפנות אלינו דרך פרטי הקשר המופיעים בעמוד הפרופיל/תמיכה באפליקציה.
        </Typography>
      </Stack>
    </Container>
  );
}
