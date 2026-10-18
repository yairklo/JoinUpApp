// Terms of Use + Privacy Policy — single source of truth for web (/legal/*) and mobile
// (app/legal/*), in Hebrew (primary) and English. A material change needs LEGAL_VERSION
// bumped in ageGate.js (every user re-accepts) and LEGAL_LAST_UPDATED updated here.
//
// Blocks: { p: string } for a paragraph, { ul: string[] } for a bullet list.

const { MIN_AGE, ADULT_AGE, LEGAL_VERSION } = require('./ageGate');

/** Shows an "under legal review" note on the legal pages while true. */
const LEGAL_IS_DRAFT = false;
const LEGAL_LAST_UPDATED = '18.10.2026';
const LEGAL_LAST_UPDATED_EN = 'October 18, 2026';

const OPERATOR = {
  name: 'יאיר קלאוזנר',
  nameEn: 'Yair Klausner',
  email: 'joinupapp.support@gmail.com',
};

const TERMS_ACCEPT_LABEL = 'קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות';
const GUARDIAN_DECLARATION_LABEL =
  'אני מצהיר/ה שהוריי או האפוטרופוס החוקי שלי קראו את תנאי השימוש ואת מדיניות הפרטיות, ומסכימים שאשתמש ב-JoinUp';
const TERMS_ACCEPT_LABEL_EN = 'I have read and agree to the Terms of Service and Privacy Policy';
const GUARDIAN_DECLARATION_LABEL_EN =
  'I declare that my parents or legal guardian have read the Terms of Service and Privacy Policy and consent to my use of JoinUp';

const TERMS = {
  title: 'תנאי שימוש',
  intro: [
    `ברוכים הבאים ל-JoinUp. תנאי שימוש אלה ("התנאים") מסדירים את השימוש באפליקציית JoinUp ובאתר הנלווה לה (יחד: "השירות"), המופעלים על ידי ${OPERATOR.name} ("המפעיל", "אנחנו").`,
    'יצירת חשבון, סימון הסכמה לתנאים או כל שימוש בשירות מהווים הסכמה מלאה לתנאים אלה ולמדיניות הפרטיות, המהווה חלק בלתי נפרד מהם. אם אינך מסכים לתנאים, אין להשתמש בשירות.',
    'התנאים מנוסחים בלשון זכר מטעמי נוחות בלבד, והם מתייחסים לכל המגדרים באופן שווה. כותרות הסעיפים נועדו לנוחות הקריאה ואין להשתמש בהן לפרשנות.',
  ],
  sections: [
    {
      heading: '1. השירות',
      blocks: [
        { p: 'JoinUp היא פלטפורמה קהילתית לתיאום משחקי ספורט חובבניים: פרסום משחקים וקבוצות קבועות, הצטרפות למשחקים, צ\'אט בין משתתפים, מידע על מגרשים ודירוג שחקנים.' },
        { p: 'המפעיל מספק את הפלטפורמה הטכנולוגית בלבד. המפעיל אינו מארגן את המשחקים, אינו מפקח עליהם, אינו מעסיק את המארגנים או את השחקנים ואינו צד לכל הסכמה ביניהם. מידע על מגרשים ועל משחקים מוזן ברובו על ידי משתמשים ועשוי להיות חלקי או לא מדויק.' },
      ],
    },
    {
      heading: '2. גיל וכשירות',
      blocks: [
        { p: `השימוש בשירות מותר מגיל ${MIN_AGE} בלבד. אין להירשם לשירות או להשתמש בו מתחת לגיל זה.` },
        { p: `משתמש שטרם מלאו לו ${ADULT_AGE} ("קטין") רשאי להשתמש בשירות רק בהסכמת הורהו או האפוטרופוס החוקי שלו. בעת ההרשמה הקטין נדרש להצהיר שהוריו או האפוטרופוס שלו קראו את התנאים ואת מדיניות הפרטיות והסכימו לשימושו בשירות. הורה או אפוטרופוס של קטין אחראי להשגחה על השימוש שהקטין עושה בשירות.` },
        { p: 'בעת ההרשמה יש למסור תאריך לידה נכון. תאריך הלידה משמש להחלת הגנות על קטינים, ולכן אין אפשרות לשנות אותו באופן עצמאי לאחר שנמסר. לתיקון טעות יש לפנות לתמיכה.' },
        { p: 'מסירת פרטים כוזבים, ובפרט גיל כוזב, מהווה הפרה של התנאים. המפעיל רשאי לבקש אימות פרטים, להגביל חשבון או לסגור אותו אם יש לו יסוד להניח שהפרטים שנמסרו אינם נכונים.' },
      ],
    },
    {
      heading: '3. החשבון שלך',
      blocks: [
        { ul: [
          'ההרשמה והכניסה לשירות מתבצעות באמצעות ספק אימות חיצוני (Clerk).',
          'מותר לפתוח חשבון אחד בלבד לכל אדם. אסור להתחזות לאדם אחר או לפתוח חשבון בשם אחר.',
          'עליך לשמור על סודיות פרטי הכניסה שלך. אתה אחראי לכל פעולה שמתבצעת בחשבונך.',
          'אם נודע לך על שימוש בלתי מורשה בחשבונך, עליך להודיע לנו מיד.',
        ] },
      ],
    },
    {
      heading: '4. בטיחות, בריאות ומפגשים פיזיים',
      blocks: [
        { p: 'השירות נועד לתאם מפגשים פיזיים לפעילות ספורטיבית בין אנשים שבחלקם אינם מכירים זה את זה. פעילות גופנית כרוכה בסיכון לפציעה. ההשתתפות במשחק כלשהו היא החלטתך ובאחריותך הבלעדית.' },
        { ul: [
          'באחריותך לוודא שמצבך הבריאותי מאפשר את הפעילות. במקרה של ספק, יש להתייעץ עם רופא.',
          'מומלץ להיפגש במקומות ציבוריים ומוכרים, ולעדכן אדם קרוב היכן ומתי אתה משחק.',
          'המפעיל אינו בודק את זהותם, את עברם או את התאמתם של משתמשים, מארגנים או מגרשים, ואינו אחראי לבטיחות המגרשים או לתקינות הציוד.',
          'אנו ממליצים בחום שקטינים יעדכנו את הוריהם לפני כל השתתפות במשחק, ושהורים ילוו קטינים למשחקים עם אנשים שאינם מכירים.',
          'במקרה חירום יש לפנות לגורמי החירום (מד"א 101, משטרה 100) ולא לשירות.',
        ] },
      ],
    },
    {
      heading: '5. כללי התנהגות',
      blocks: [
        { p: 'בשימוש בשירות, לרבות בצ\'אט, בפרופיל, בתגובות על מגרשים ובדיווחים, אסור:' },
        { ul: [
          'להטריד, לאיים, להשפיל, להציק או להפעיל לחץ על משתמש אחר.',
          'לפרסם תוכן מיני, תוכן בוטה או תוכן אלים. כל פנייה בעלת אופי מיני לקטין, או ניסיון לשדל קטין למפגש שאינו קשור לפעילות הספורטיבית, אסורים בהחלט. מקרים כאלה יביאו לסגירת החשבון לאלתר, ועשויים להיות מדווחים לרשויות.',
          'לפרסם תוכן גזעני, מסית או מפלה על רקע דת, מוצא, מגדר, נטייה מינית, מוגבלות או גיל.',
          'לפרסם פרטים אישיים של אדם אחר ללא הסכמתו.',
          'לשלוח דואר זבל, פרסומות או הצעות מסחריות שלא התבקשו.',
          'להתחזות לאדם או לגוף אחר.',
          'לפרסם תוכן המפר זכויות יוצרים, סימני מסחר או פרטיות של אחרים, או תוכן בלתי חוקי מכל סוג.',
          'לאסוף מידע מהשירות באופן אוטומטי (scraping), לעקוף מנגנוני אבטחה או הגבלה, או לשבש את פעולת השירות.',
        ] },
      ],
    },
    {
      heading: '6. תוכן שמשתמשים מפרסמים',
      blocks: [
        { p: 'התוכן שאתה מפרסם בשירות (הודעות, תמונות, תגובות, דירוגים ודיווחים) נשאר שלך. אתה אחראי לו באופן בלעדי.' },
        { p: 'בפרסום תוכן אתה מעניק למפעיל רישיון לא בלעדי, כלל עולמי וללא תמלוגים לאחסן, להציג, להעתיק ולעבד את התוכן, במידה הדרושה להפעלת השירות, לשיפורו ולאכיפת התנאים. הרישיון מסתיים עם מחיקת התוכן או מחיקת החשבון, למעט עותקים שנשמרים כנדרש על פי דין או בגיבויים לתקופה מוגבלת.' },
      ],
    },
    {
      heading: '7. מודרציה, דיווח ואכיפה',
      blocks: [
        { ul: [
          'כדי להגן על קטינים, הודעות צ\'אט הנשלחות לשיחה שמשתתף בה קטין נבדקות באופן אוטומטי, בין היתר באמצעות שירותי בינה מלאכותית של צדדים שלישיים. הודעה שנמצאה פוגענית עלולה שלא להישלח. אם הבדיקה האוטומטית אינה זמינה, הודעה לקטין שאינו חבר מאושר של השולח עלולה שלא להישלח.',
          'הודעות שסומנו עשויות להיבדק על ידי צוות המפעיל.',
          'אפשר לדווח על הודעה או על משתמש ולחסום משתמש מתוך השירות.',
          'המפעיל רשאי, לפי שיקול דעתו ובלי חובת הודעה מוקדמת, להסיר תוכן, להגביל פעולות, להשעות חשבון או לסגור אותו כאשר יש חשד להפרת התנאים או לסיכון למשתמשים.',
          'המפעיל ישתף פעולה עם רשויות אכיפת החוק כאשר הדבר נדרש על פי דין, או כאשר הדבר דרוש לדעתו כדי למנוע פגיעה בגוף, ובפרט פגיעה בקטינים.',
        ] },
      ],
    },
    {
      heading: '8. משחקים, מחירים ותשלומים',
      blocks: [
        { p: 'מחיר שמוצג למשחק או לקבוצה נקבע על ידי המארגן ומוצג למידע בלבד. התשלום, אם יש, מתבצע ישירות בין המשתתפים או מול המגרש, מחוץ לשירות. המפעיל אינו צד לעסקאות אלה, אינו גובה תשלום ואינו אחראי לגבייה, להחזרים, לביטולים או למחלוקות בין משתמשים. השירות עצמו ניתן ללא תשלום.' },
      ],
    },
    {
      heading: '9. קניין רוחני',
      blocks: [
        { p: 'כל הזכויות בשירות, לרבות בקוד, בעיצוב, בשם JoinUp, בסימנים ובלוגו, שייכות למפעיל או לבעלי הרישיון שלו. אין להעתיק, להפיץ, לשנות או ליצור יצירות נגזרות מהשירות ללא הסכמה בכתב, למעט שימוש אישי ורגיל בשירות.' },
      ],
    },
    {
      heading: '10. מחיקת חשבון והפסקת שימוש',
      blocks: [
        { p: 'אפשר למחוק את החשבון בכל עת ממסך ההגדרות. במחיקה יימחקו הפרטים האישיים בחשבון ותוכן ההודעות שלך, והחשבון יוצג למשתמשים אחרים כ"משתמש שנמחק", כדי לשמור על שלמות המשחקים וההיסטוריה של אחרים. פרטים נוספים מופיעים במדיניות הפרטיות.' },
        { p: 'המפעיל רשאי לשנות את השירות, להפסיק אותו כולו או חלקו, או להפסיק את גישתו של משתמש מסוים, בכפוף לכל דין.' },
      ],
    },
    {
      heading: '11. הגבלת אחריות',
      blocks: [
        { p: 'השירות ניתן "כמות שהוא" (AS IS) ו"כפי שהוא זמין" (AS AVAILABLE). המפעיל אינו מתחייב שהשירות יפעל ללא הפרעות או תקלות, או שהמידע בו מדויק.' },
        { p: 'במידה המרבית המותרת על פי דין, המפעיל, עובדיו ומי מטעמו לא יישאו באחריות לכל נזק, ישיר או עקיף, הנובע משימוש בשירות או מהסתמכות עליו. בכלל זה נזק גוף או רכוש שנגרם במהלך משחק או מפגש שתואם דרך השירות, מעשים או מחדלים של משתמשים אחרים, תוכן שמשתמשים פרסמו, או אובדן מידע. אין באמור כדי לגרוע מאחריות שלא ניתן להגבילה על פי דין.' },
      ],
    },
    {
      heading: '12. שיפוי',
      blocks: [
        { p: 'אתה מתחייב לשפות את המפעיל ומי מטעמו בגין כל נזק, הוצאה, אובדן או תביעה, לרבות שכר טרחת עורך דין סביר, שייגרמו להם עקב הפרת התנאים על ידך או עקב תוכן שפרסמת.' },
      ],
    },
    {
      heading: '13. שינויים בתנאים',
      blocks: [
        { p: 'המפעיל רשאי לעדכן את התנאים מעת לעת. על שינוי מהותי תימסר הודעה בשירות, ויהיה צורך לאשר את התנאים המעודכנים, ובמקרה של קטין לחדש את הצהרת הסכמת ההורים, כדי להמשיך להשתמש בשירות. מועד העדכון האחרון מופיע בראש המסמך.' },
      ],
    },
    {
      heading: '14. דין וסמכות שיפוט',
      blocks: [
        { p: 'על התנאים ועל השימוש בשירות יחולו דיני מדינת ישראל בלבד. סמכות השיפוט הבלעדית בכל עניין הנוגע להם נתונה לבתי המשפט המוסמכים במחוז תל אביב-יפו.' },
      ],
    },
    {
      heading: '15. יצירת קשר',
      blocks: [
        { p: `לשאלות, לבירורים ולתלונות: דרך מסך התמיכה באפליקציה, או בדוא"ל ${OPERATOR.email}.` },
      ],
    },
  ],
};

const PRIVACY = {
  title: 'מדיניות פרטיות',
  intro: [
    `מדיניות זו מסבירה איזה מידע ${OPERATOR.name} ("המפעיל", "אנחנו") אוסף על משתמשי אפליקציית JoinUp והאתר הנלווה לה ("השירות"), למה המידע משמש, עם מי הוא משותף, ומה הזכויות שלך לגביו. המדיניות היא חלק מתנאי השימוש.`,
    'המדיניות מנוסחת בלשון זכר מטעמי נוחות בלבד, והיא מתייחסת לכל המגדרים באופן שווה.',
  ],
  sections: [
    {
      heading: '1. מסירת המידע',
      blocks: [
        { p: 'אין חובה חוקית למסור לנו מידע, ומסירתו תלויה ברצונך ובהסכמתך. עם זאת, בלי פרטים מסוימים, כגון כתובת דוא"ל ותאריך לידה, לא נוכל לספק לך את השירות. מידע שמסומן כאופציונלי אינו נדרש לשימוש בשירות.' },
      ],
    },
    {
      heading: '2. איזה מידע אנו אוספים',
      blocks: [
        { ul: [
          'פרטי חשבון: שם, כתובת דוא"ל, תמונת פרופיל ומספר טלפון (אופציונלי). האימות מתבצע דרך ספק האימות Clerk.',
          'פרטי פרופיל: תאריך לידה, מגדר (אופציונלי), עיר, ענפי ספורט ועמדות משחק.',
          'פעילות בשירות: משחקים וקבוצות שיצרת או הצטרפת אליהם, חברים ובקשות חברות, חסימות, מגרשים מועדפים, דירוגים שנתת וקיבלת, תגובות על מגרשים, דיווחי תקלות, הצעות למגרשים ופניות לתמיכה.',
          'תוכן צ\'אט: הודעות ותגובות בשיחות שאתה משתתף בהן.',
          'מיקום: אם אישרת זאת במכשיר, המיקום משמש להצגת משחקים ומגרשים קרובים ולמרכוז המפה. איננו שומרים היסטוריית מיקום. ייתכן שאזור החיפוש במפה יישלח לשרת לצורך החיפוש.',
          'תיעוד הסכמות: מועד אישור תנאי השימוש וגרסתם, ובמקרה של קטין, מועד הצהרת הסכמת ההורים.',
          'מידע טכני: כתובת IP, סוג מכשיר ומערכת הפעלה, יומני שרת, דוחות קריסה ושגיאות, ומזהה מכשיר להתראות (Push).',
        ] },
      ],
    },
    {
      heading: '3. למה המידע משמש',
      blocks: [
        { ul: [
          'הפעלת השירות: יצירת משחקים והצטרפות אליהם, צ\'אט, חברים, התראות ותמיכה.',
          'בטיחות: החלת הגנות לפי גיל, מודרציה של תוכן, טיפול בדיווחים ואכיפת תנאי השימוש.',
          'אבטחה: מניעת שימוש לרעה, הונאות וגישה בלתי מורשית.',
          'תפעול ושיפור: אבחון תקלות, ניתוח שימוש מצרפי ושיפור השירות.',
          'עמידה בדין: מילוי חובות חוקיות ומענה לדרישות מוסמכות של רשויות.',
        ] },
        { p: 'איננו מוכרים מידע אישי, ואיננו משתמשים בו לפרסום ממוקד של צדדים שלישיים.' },
      ],
    },
    {
      heading: '4. מידע שגלוי למשתמשים אחרים',
      blocks: [
        { ul: [
          'שם, תמונת פרופיל וענפי ספורט מוצגים למשתמשים אחרים.',
          'רשימת החברים והיסטוריית המשחקים מוצגות לפי הגדרות הפרטיות שבחרת. ברירת המחדל לקטינים היא "חברים בלבד".',
          'הודעות צ\'אט גלויות למשתתפי השיחה. השתתפותך במשחק גלויה למשתתפי המשחק ולמארגן שלו.',
          'הגיל המחושב עשוי להיות מוצג בפרופיל. תאריך הלידה המלא אינו מוצג למשתמשים אחרים.',
        ] },
      ],
    },
    {
      heading: '5. מודרציה אוטומטית ובינה מלאכותית',
      blocks: [
        { p: 'כדי להגן על קטינים, הודעות הנשלחות לשיחה שמשתתף בה קטין נבדקות באופן אוטומטי. לצורך הבדיקה, טקסט ההודעה נשלח לשירותי הבינה המלאכותית של OpenAI ושל Google (תוך שימוש במסלולים העסקיים המאובטחים שאינם משתמשים בנתונים לאימון מודלים), לאחר הסרה אוטומטית של מספרי טלפון וכתובות דוא"ל. יחד עם הטקסט נשלחים נתוני גיל ומגדר כלליים, לצורך כיול הבדיקה. הודעות בשיחות שכל משתתפיהן בגירים אינן נשלחות לבדיקה כזו. הודעות שסומנו נשמרות לבדיקה של צוות המפעיל.' },
      ],
    },
    {
      heading: '6. שיתוף מידע עם צדדים שלישיים',
      blocks: [
        { p: 'אנו משתפים מידע רק עם ספקי שירות שפועלים מטעמנו ובמידה הדרושה לתפקידם:' },
        { ul: [
          'Clerk: אימות משתמשים וניהול חשבונות.',
          'ספק אחסון השרת ו-Vercel: אחסון השרתים, מסד הנתונים והאתר.',
          'Cloudinary: אחסון תמונות.',
          'Google Firebase ו-Expo: שליחת התראות Push.',
          'OpenAI ו-Google: מודרציה אוטומטית של הודעות, כמתואר בסעיף 5.',
          'Sentry: דוחות קריסה ושגיאות.',
        ] },
        { p: 'בנוסף, מידע עשוי להימסר לרשויות כאשר הדבר נדרש על פי דין או צו שיפוטי, כאשר הדבר דרוש למניעת פגיעה בגוף או ברכוש, או במסגרת העברת פעילות המפעיל לגוף אחר שיתחייב לפעול לפי מדיניות זו.' },
      ],
    },
    {
      heading: '7. העברת מידע אל מחוץ לישראל',
      blocks: [
        { p: 'חלק מספקי השירות שלנו מאחסנים או מעבדים מידע מחוץ לישראל, בין היתר בארצות הברית ובאיחוד האירופי. העברת המידע מתבצעת בהתאם לתקנות הגנת הפרטיות (העברת מידע אל מאגרי מידע שמחוץ לגבולות המדינה), התשס"א-2001.' },
      ],
    },
    {
      heading: '8. קטינים',
      blocks: [
        { p: `השירות אינו מיועד למי שטרם מלאו לו ${MIN_AGE}, ואיננו אוספים ביודעין מידע על ילדים מתחת לגיל זה. משתמש שטרם מלאו לו ${ADULT_AGE} נדרש להצהיר על הסכמת הוריו או האפוטרופוס שלו. לקטינים מוחלות הגנות נוספות: ברירת מחדל של "חברים בלבד" בהגדרות הפרטיות, ומודרציה של הודעות כמתואר בסעיף 5.` },
        { p: 'הורה או אפוטרופוס רשאי לפנות אלינו כדי לעיין במידע על הקטין שבאחריותו, לתקן אותו או לבקש את מחיקת החשבון.' },
      ],
    },
    {
      heading: '9. אבטחת מידע',
      blocks: [
        { p: 'אנו נוקטים אמצעים סבירים ומקובלים להגנה על המידע, בהתאם לתקנות הגנת הפרטיות (אבטחת מידע), התשע"ז-2017. בין האמצעים: הצפנת תעבורה, הגבלת גישה והרשאות ותיעוד. עם זאת, אין שיטת אבטחה חסינה לחלוטין, ואיננו יכולים להבטיח הגנה מוחלטת מפני גישה בלתי מורשית.' },
      ],
    },
    {
      heading: '10. שמירת מידע ומחיקתו',
      blocks: [
        { p: 'אנו שומרים את המידע כל עוד החשבון פעיל. במחיקת חשבון יימחקו שמך, כתובת הדוא"ל, הטלפון, התמונה, העיר, תאריך הלידה, המגדר, הדירוגים, החברויות, החסימות והפניות לתמיכה. תוכן ההודעות שלך יימחק, ותגובות על מגרשים יימחקו או ירוקנו מתוכן. החשבון יישמר כרשומה אנונימית ("משתמש שנמחק"), כדי לשמור על שלמות המשחקים וההיסטוריה של משתמשים אחרים.' },
        { p: 'עותקים בגיבויים וביומני מערכת עשויים להישמר לתקופה מוגבלת של עד 30 יום, ומידע מסוים עשוי להישמר זמן רב יותר אם הדבר נדרש על פי דין או לצורך בירור תלונה או מחלוקת.' },
      ],
    },
    {
      heading: '11. הזכויות שלך',
      blocks: [
        { ul: [
          'זכות עיון: לעיין במידע עליך שמוחזק במאגר המידע שלנו (סעיף 13 לחוק הגנת הפרטיות, התשמ"א-1981).',
          'זכות תיקון ומחיקה: לבקש לתקן או למחוק מידע שאינו נכון, שלם, ברור או מעודכן (סעיף 14 לחוק).',
          'מחיקת חשבון: אפשר למחוק את החשבון בעצמך בכל עת ממסך ההגדרות.',
          'התראות: אפשר לכבות התראות או סוגי התראות בהגדרות האפליקציה ובהגדרות המכשיר.',
        ] },
        { p: `לפנייה בעניין זכויותיך: דרך מסך התמיכה באפליקציה או בדוא"ל ${OPERATOR.email}. נשיב לפנייה בתוך הזמנים הקבועים בדין.` },
      ],
    },
    {
      heading: '12. עוגיות ואחסון מקומי',
      blocks: [
        { p: 'האתר משתמש בעוגיות (cookies) ובאחסון מקומי בדפדפן לצורכי תפעול בלבד: שמירת החיבור לחשבון באמצעות Clerk, והעדפות כמו מצב תצוגה. איננו משתמשים בעוגיות פרסום או במעקב של צדדים שלישיים לצורכי פרסום.' },
      ],
    },
    {
      heading: '13. שינויים במדיניות',
      blocks: [
        { p: 'אנו עשויים לעדכן מדיניות זו מעת לעת. על שינוי מהותי תימסר הודעה בשירות, ויהיה צורך לאשר את המדיניות המעודכנת. מועד העדכון האחרון מופיע בראש המסמך.' },
      ],
    },
    {
      heading: '14. יצירת קשר',
      blocks: [
        { p: `בעל מאגר המידע: ${OPERATOR.name}. לשאלות או לתלונות בנושא פרטיות: דרך מסך התמיכה באפליקציה או בדוא"ל ${OPERATOR.email}.` },
      ],
    },
  ],
};

const TERMS_EN = {
  title: 'Terms of Service',
  intro: [
    `Welcome to JoinUp. These Terms of Service ("Terms") govern your use of the JoinUp mobile application and its companion website (collectively: the "Service"), operated by ${OPERATOR.nameEn} ("the Operator", "we", "us", or "our").`,
    'By creating an account, checking the box to accept these Terms, or otherwise using the Service, you fully agree to these Terms and to our Privacy Policy, which forms an integral part of them. If you do not agree to these Terms, do not use the Service.',
    'These Terms are drafted in the masculine gender for convenience only and apply equally to all genders. Section headings are for reading convenience only and shall not be used for interpretation.',
  ],
  sections: [
    {
      heading: '1. The Service',
      blocks: [
        { p: 'JoinUp is a community platform for coordinating amateur sports matches: publishing matches and fixed groups, joining matches, in-app chat between participants, pitch information, and player ratings.' },
        { p: 'The Operator provides the technological platform only. The Operator does not organize matches, supervise them, employ organizers or players, and is not a party to any agreement between them. Pitch and match information is primarily user-generated and may be partial or inaccurate.' },
      ],
    },
    {
      heading: '2. Age and Eligibility',
      blocks: [
        { p: `Use of the Service is permitted for ages ${MIN_AGE} and older only. Do not register for or use the Service if you are under ${MIN_AGE}.` },
        { p: `A user under the age of ${ADULT_AGE} ("Minor") may use the Service only with the consent of their parent or legal guardian. Upon registration, the Minor is required to declare that their parent or legal guardian has read these Terms and the Privacy Policy and consented to their use of the Service. A parent or legal guardian of a Minor is responsible for supervising the Minor's use of the Service.` },
        { p: 'You must provide a correct date of birth during registration. Date of birth is used to apply protections for minors and cannot be changed independently once submitted. To correct an error, please contact support.' },
        { p: 'Providing false information, specifically a false age, constitutes a breach of these Terms. The Operator may request verification, restrict an account, or close it if there is reason to believe the provided details are incorrect.' },
      ],
    },
    {
      heading: '3. Your Account',
      blocks: [
        { ul: [
          'Registration and login to the Service are performed via an external authentication provider (Clerk).',
          'You may open only one account per person. Impersonating another person or opening an account under a false name is prohibited.',
          'You must keep your login credentials secure. You are responsible for all activity conducted through your account.',
          'If you become aware of any unauthorized use of your account, you must notify us immediately.',
        ] },
      ],
    },
    {
      heading: '4. Safety, Health, and Physical Meetups',
      blocks: [
        { p: 'The Service is designed to coordinate physical meetups for sports activities among individuals, some of whom may not know each other. Physical activity involves a risk of injury. Participation in any match is entirely at your own decision and sole responsibility.' },
        { ul: [
          'It is your responsibility to ensure that your health condition allows for such activity. In case of doubt, consult a physician.',
          'It is recommended to meet in public, well-known locations and inform someone close to you where and when you are playing.',
          'The Operator does not verify the identity, background, or suitability of users, organizers, or pitches, and is not responsible for pitch safety or equipment condition.',
          'We strongly recommend that minors notify their parents prior to participating in any match, and that parents accompany minors to matches with unfamiliar people.',
          'In case of emergency, contact emergency services (Magen David Adom 101, Police 100) rather than the Service.',
        ] },
      ],
    },
    {
      heading: '5. Code of Conduct',
      blocks: [
        { p: 'When using the Service, including in chat, profile, pitch reviews, and reports, you must not:' },
        { ul: [
          'Harass, threaten, humiliate, badger, or pressure other users.',
          'Publish explicit sexual content, obscene content, or violent content. Any sexual approach toward a minor, or any attempt to solicit a minor for a meeting unrelated to sports activity, is strictly prohibited. Such instances will result in immediate account termination and may be reported to authorities.',
          'Publish racist, incitive, or discriminatory content based on religion, origin, gender, sexual orientation, disability, or age.',
          'Publish personal details of another person without their consent.',
          'Send spam, advertisements, or unsolicited commercial offers.',
          'Impersonate any person or entity.',
          'Publish content that infringes copyrights, trademarks, privacy rights of others, or illegal content of any kind.',
          'Automatically scrape data from the Service, bypass security or restriction mechanisms, or disrupt the operation of the Service.',
        ] },
      ],
    },
    {
      heading: '6. User-Generated Content',
      blocks: [
        { p: 'Content you publish on the Service (messages, photos, comments, ratings, and reports) remains yours. You are solely responsible for it.' },
        { p: 'By publishing content, you grant the Operator a non-exclusive, worldwide, royalty-free license to store, display, copy, and process the content to the extent necessary to operate the Service, improve it, and enforce these Terms. This license terminates upon the deletion of the content or account, except for copies retained as required by law or in backups for a limited period.' },
      ],
    },
    {
      heading: '7. Moderation, Reporting, and Enforcement',
      blocks: [
        { ul: [
          'To protect minors, chat messages sent to a conversation involving a minor are automatically checked, inter alia, using third-party artificial intelligence services. Messages found to be offensive may be blocked from sending. If automated checking is unavailable, messages to a minor from someone who is not an approved friend of the sender may be blocked.',
          'Flagged messages may be reviewed by the Operator\'s team.',
          'You can report a message or user, and block users directly within the Service.',
          'The Operator may, at its discretion and without prior notice, remove content, restrict actions, suspend an account, or terminate it when there is suspicion of a breach of these Terms or risk to users.',
          'The Operator will cooperate with law enforcement authorities when required by law, or when necessary in its opinion to prevent bodily harm, specifically harm to minors.',
        ] },
      ],
    },
    {
      heading: '8. Matches, Prices, and Payments',
      blocks: [
        { p: 'Prices displayed for a match or group are set by the organizer and displayed for informational purposes only. Payments, if any, are made directly between participants or at the pitch, outside of the Service. The Operator is not a party to these transactions, does not collect fees, and is not responsible for collection, refunds, cancellations, or disputes between users. The Service itself is provided free of charge.' },
      ],
    },
    {
      heading: '9. Intellectual Property',
      blocks: [
        { p: 'All rights in the Service, including code, design, the JoinUp name, trademarks, and logo, belong to the Operator or its licensors. You may not copy, distribute, modify, or create derivative works from the Service without written consent, except for personal and ordinary use of the Service.' },
      ],
    },
    {
      heading: '10. Account Deletion and Termination of Use',
      blocks: [
        { p: 'You may delete your account at any time from the settings screen. Upon deletion, your personal account details and message content will be removed, and your account will be displayed to other users as a "Deleted User" to preserve the integrity of other users\' matches and history. Further details appear in the Privacy Policy.' },
        { p: 'The Operator may modify the Service, discontinue all or part of it, or terminate a specific user\'s access, subject to applicable law.' },
      ],
    },
    {
      heading: '11. Limitation of Liability',
      blocks: [
        { p: 'The Service is provided on an "AS IS" and "AS AVAILABLE" basis. The Operator does not warrant that the Service will be uninterrupted or error-free, or that its information is accurate.' },
        { p: 'To the maximum extent permitted by law, the Operator, its employees, and anyone acting on its behalf shall not be liable for any direct or indirect damage resulting from the use of or reliance on the Service. This includes bodily or property injury caused during a match or meetup coordinated via the Service, actions or omissions of other users, user-published content, or data loss. Nothing herein shall derogate from liability that cannot be limited by law.' },
      ],
    },
    {
      heading: '12. Indemnification',
      blocks: [
        { p: 'You agree to indemnify and hold harmless the Operator and anyone on its behalf from any damage, expense, loss, or claim, including reasonable attorney\'s fees, incurred by them due to your breach of these Terms or content you published.' },
      ],
    },
    {
      heading: '13. Changes to Terms',
      blocks: [
        { p: 'The Operator may update these Terms from time to time. Material changes will be notified via the Service, and continued use will require accepting the updated terms (and in the case of a minor, renewing parental consent). The date of the last update appears at the top of this document.' },
      ],
    },
    {
      heading: '14. Governing Law and Jurisdiction',
      blocks: [
        { p: 'These Terms and the use of the Service shall be governed solely by the laws of the State of Israel. Exclusive jurisdiction for any matter concerning them is granted to the competent courts in the Tel Aviv-Yafo district.' },
      ],
    },
    {
      heading: '15. Contact',
      blocks: [
        { p: `For questions, inquiries, and complaints: via the support screen in the app, or by email at ${OPERATOR.email}.` },
      ],
    },
  ],
};

const PRIVACY_EN = {
  title: 'Privacy Policy',
  intro: [
    `This policy explains what information ${OPERATOR.nameEn} ("the Operator", "we", "us") collects about users of the JoinUp application and its companion website (the "Service"), what the information is used for, with whom it is shared, and what your rights are regarding it. This policy is part of the Terms of Service.`,
    'This policy is drafted in the masculine gender for convenience only and applies equally to all genders.',
  ],
  sections: [
    {
      heading: '1. Provision of Information',
      blocks: [
        { p: 'There is no legal obligation to provide us with information, and its provision depends on your will and consent. However, without certain details, such as email address and date of birth, we will not be able to provide you with the Service. Information marked as optional is not required to use the Service.' },
      ],
    },
    {
      heading: '2. Information We Collect',
      blocks: [
        { ul: [
          'Account Details: Name, email address, profile picture, and phone number (optional). Authentication is performed via Clerk.',
          'Profile Details: Date of birth, gender (optional), city, sports branches, and playing positions.',
          'Service Activity: Matches and groups you created or joined, friends and friend requests, blocks, favorite pitches, ratings given and received, pitch comments, bug reports, pitch suggestions, and support requests.',
          'Chat Content: Messages and replies in conversations you participate in.',
          'Location: If permitted on your device, location is used to display nearby matches and pitches and to center the map. We do not store location history. Map search areas may be sent to the server for search purposes.',
          'Consent Logs: Date and version of Terms of Service acceptance, and in the case of a minor, the date of parental consent declaration.',
          'Technical Information: IP address, device type and operating system, server logs, crash and error reports, and push notification device token.',
        ] },
      ],
    },
    {
      heading: '3. How Information Is Used',
      blocks: [
        { ul: [
          'Operating the Service: Creating and joining matches, chat, friends, notifications, and support.',
          'Safety: Enforcing age-based protections, content moderation, handling reports, and enforcing Terms of Service.',
          'Security: Preventing misuse, fraud, and unauthorized access.',
          'Operations and Improvement: Diagnosing bugs, aggregated usage analysis, and improving the Service.',
          'Compliance: Fulfilling legal obligations and responding to authorized requests by authorities.',
        ] },
        { p: 'We do not sell personal information, and we do not use it for third-party targeted advertising.' },
      ],
    },
    {
      heading: '4. Information Visible to Other Users',
      blocks: [
        { ul: [
          'Name, profile picture, and sports branches are displayed to other users.',
          'Friends list and match history are displayed according to your privacy settings. The default for minors is "Friends only".',
          'Chat messages are visible to conversation participants. Your participation in a match is visible to match participants and the organizer.',
          'Calculated age may be displayed on your profile. Your full date of birth is not displayed to other users.',
        ] },
      ],
    },
    {
      heading: '5. Automated Moderation and Artificial Intelligence',
      blocks: [
        { p: 'To protect minors, messages sent to conversations involving a minor are checked automatically. For this purpose, message text is sent to OpenAI and Google Gemini artificial intelligence services (using secure business tiers that do not use data to train models), following the automatic removal of phone numbers and email addresses. General age and gender metadata are sent alongside the text to calibrate moderation. Conversations where all participants are adults are not sent for such checks. Flagged messages are saved for Operator team review.' },
      ],
    },
    {
      heading: '6. Sharing Information with Third Parties',
      blocks: [
        { p: 'We share information only with service providers acting on our behalf and to the extent necessary for their role:' },
        { ul: [
          'Clerk: User authentication and account management.',
          'Server and Database Provider & Vercel: Hosting servers, databases, and website.',
          'Cloudinary: Image hosting.',
          'Google Firebase & Expo: Sending push notifications.',
          'OpenAI & Google: Automated message moderation, as described in Section 5.',
          'Sentry: Crash and error reports.',
        ] },
        { p: 'Additionally, information may be disclosed to authorities when required by law or court order, when necessary to prevent bodily or property harm, or as part of a transfer of the Operator\'s activity to another entity bound by this policy.' },
      ],
    },
    {
      heading: '7. International Data Transfers',
      blocks: [
        { p: 'Some of our service providers store or process information outside of Israel, inter alia, in the United States and the European Union. Information transfer is carried out in accordance with the Privacy Protection Regulations (Transfer of Information to Databases Outside State Borders), 2001.' },
      ],
    },
    {
      heading: '8. Minors',
      blocks: [
        { p: `The Service is not intended for individuals under ${MIN_AGE}, and we do not knowingly collect information from children under this age. Users under ${ADULT_AGE} are required to declare parental or guardian consent. Minors are subject to additional protections: default "Friends only" privacy settings, and message moderation as described in Section 5.` },
        { p: 'A parent or legal guardian may contact us to review minor information under their responsibility, correct it, or request account deletion.' },
      ],
    },
    {
      heading: '9. Data Security',
      blocks: [
        { p: 'We implement reasonable and customary measures to protect information in accordance with the Privacy Protection Regulations (Data Security), 2017. Measures include traffic encryption, access and permission restrictions, and logging. However, no security system is completely immune, and we cannot guarantee absolute protection against unauthorized access.' },
      ],
    },
    {
      heading: '10. Data Retention and Deletion',
      blocks: [
        { p: 'We retain information as long as your account is active. Upon account deletion, your name, email address, phone number, picture, city, date of birth, gender, ratings, friendships, blocks, and support inquiries will be deleted. Your chat message content will be deleted, and pitch reviews will be deleted or emptied. The account will be retained as an anonymous record ("Deleted User") to preserve the integrity of other users\' matches and history.' },
        { p: 'Backups and system log copies may be retained for a limited period of up to 30 days, and certain information may be retained longer if required by law or for investigating a complaint or dispute.' },
      ],
    },
    {
      heading: '11. Your Rights',
      blocks: [
        { ul: [
          'Right of Inspection: To review information held about you in our database (Section 13 of the Privacy Protection Law, 1981).',
          'Right to Correction and Deletion: To request correction or deletion of information that is incorrect, incomplete, unclear, or outdated (Section 14 of the Law).',
          'Account Deletion: You may delete your account yourself at any time from the settings screen.',
          'Notifications: You can disable notifications or specific notification types in app settings and device settings.',
        ] },
        { p: `To exercise your rights: via the support screen in the app or by email at ${OPERATOR.email}. We will respond within the timeframes prescribed by law.` },
      ],
    },
    {
      heading: '12. Cookies and Local Storage',
      blocks: [
        { p: 'The website uses cookies and browser local storage for operational purposes only: maintaining account connection via Clerk, and preferences such as display mode. We do not use advertising cookies or third-party tracking for advertising purposes.' },
      ],
    },
    {
      heading: '13. Changes to Policy',
      blocks: [
        { p: 'We may update this policy from time to time. Material changes will be notified via the Service, and acceptance of the updated policy will be required. The date of the last update appears at the top of this document.' },
      ],
    },
    {
      heading: '14. Contact',
      blocks: [
        { p: `Database Owner: ${OPERATOR.nameEn}. For questions or privacy complaints: via the support screen in the app or by email at ${OPERATOR.email}.` },
      ],
    },
  ],
};

/** Legal texts for a UI language; anything but 'en' gets Hebrew. */
function getLegalTexts(lang) {
  const en = lang === 'en';
  return {
    lang: en ? 'en' : 'he',
    dir: en ? 'ltr' : 'rtl',
    terms: en ? TERMS_EN : TERMS,
    privacy: en ? PRIVACY_EN : PRIVACY,
    lastUpdated: en ? LEGAL_LAST_UPDATED_EN : LEGAL_LAST_UPDATED,
    lastUpdatedLabel: en ? 'Last updated' : 'עדכון אחרון',
    termsAcceptLabel: en ? TERMS_ACCEPT_LABEL_EN : TERMS_ACCEPT_LABEL,
    guardianDeclarationLabel: en ? GUARDIAN_DECLARATION_LABEL_EN : GUARDIAN_DECLARATION_LABEL,
  };
}

module.exports = {
  LEGAL_VERSION,
  LEGAL_IS_DRAFT,
  LEGAL_LAST_UPDATED,
  LEGAL_LAST_UPDATED_EN,
  OPERATOR,
  TERMS,
  PRIVACY,
  TERMS_EN,
  PRIVACY_EN,
  TERMS_ACCEPT_LABEL,
  GUARDIAN_DECLARATION_LABEL,
  TERMS_ACCEPT_LABEL_EN,
  GUARDIAN_DECLARATION_LABEL_EN,
  getLegalTexts,
};
