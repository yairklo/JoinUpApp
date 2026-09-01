import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";

export const metadata = {
  title: "תנאי שימוש — JoinUp",
};

export default function TermsOfServicePage() {
  return (
    <Container maxWidth="md" sx={{ py: 6 }} dir="rtl">
      <Stack spacing={3}>
        <Typography variant="h4" fontWeight={800}>תנאי שימוש</Typography>
        <Alert severity="info">
          זהו מסמך טיוטה לתקופת הבטא (טסטרים). לפני השקה רחבה יש להעביר אותו לבדיקה משפטית.
          עדכון אחרון: 31.08.2026.
        </Alert>

        <Typography>
          השימוש באפליקציית JoinUp ובאתר הנלווה לה (&quot;השירות&quot;) כפוף לתנאים הבאים. יצירת חשבון
          או המשך שימוש בשירות מהווים הסכמה לתנאים אלה.
        </Typography>

        <Divider />

        <Typography variant="h6" fontWeight={700}>1. תקופת בטא</Typography>
        <Typography>
          השירות נמצא בשלב טסטים (&quot;בטא&quot;) עם משתמשים אמיתיים. אנו עשויים לשנות, להסיר, או לאפס
          פיצ&apos;רים ונתונים ללא התראה מראש, ואין התחייבות לזמינות רציפה.
        </Typography>

        <Typography variant="h6" fontWeight={700}>2. חשבון משתמש</Typography>
        <Typography>
          אתה אחראי לשמירה על פרטי הכניסה שלך ולכל פעולה המתבצעת דרך חשבונך. יש למסור פרטים נכונים ועדכניים.
        </Typography>

        <Typography variant="h6" fontWeight={700}>3. התנהגות בקהילה</Typography>
        <Typography component="ul" sx={{ pl: 3 }}>
          <li>אין לפרסם תוכן פוגעני, מטריד, מפלה, או בלתי חוקי בצ&apos;אט או בפרופיל.</li>
          <li>הודעות עוברות בדיקת מודרציה אוטומטית; תוכן שמפר את הכללים עלול להיות מוסר.</li>
          <li>אנו רשאים להשעות או לחסום חשבון שמפר את התנאים, לפי שיקול דעתנו.</li>
        </Typography>

        <Typography variant="h6" fontWeight={700}>4. משחקים ותשלומים</Typography>
        <Typography>
          פרטי מחיר המוצגים למשחק/קבוצה הם למידע בלבד (תשלום מתבצע במגרש עצמו, מחוץ לאפליקציה).
          האפליקציה אינה צד לעסקה בין המשתמשים ואינה אחראית לגבייה, ביטולים, או מחלוקות כספיות בין משתמשים.
        </Typography>

        <Typography variant="h6" fontWeight={700}>5. הגבלת אחריות</Typography>
        <Typography>
          השירות ניתן &quot;כפי שהוא&quot; (AS IS), ללא אחריות מכל סוג, במיוחד בתקופת הבטא. השימוש בשירות,
          לרבות השתתפות במשחקים שתואמו דרכו, הוא באחריותך הבלעדית.
        </Typography>

        <Typography variant="h6" fontWeight={700}>6. שינויים בתנאים</Typography>
        <Typography>
          אנו רשאים לעדכן תנאים אלה מעת לעת. המשך שימוש בשירות לאחר עדכון מהווה הסכמה לתנאים המעודכנים.
        </Typography>

        <Typography variant="h6" fontWeight={700}>7. יצירת קשר</Typography>
        <Typography>
          לשאלות בנוגע לתנאי השימוש ניתן לפנות אלינו דרך פרטי הקשר המופיעים בעמוד הפרופיל/תמיכה באפליקציה.
        </Typography>
      </Stack>
    </Container>
  );
}
