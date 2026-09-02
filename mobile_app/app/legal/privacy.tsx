import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';

export default function PrivacyPolicyScreen() {
    return (
        <>
            <Stack.Screen options={{ title: 'מדיניות פרטיות' }} />
            <ScrollView className="flex-1 bg-white px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                    <Text className="text-amber-800 text-sm" style={{ textAlign: 'right' }}>
                        זהו מסמך טיוטה לתקופת הבטא (טסטרים). לפני השקה רחבה יש להעביר אותו לבדיקה משפטית.{"\n"}
                        עדכון אחרון: 31.08.2026.
                    </Text>
                </View>

                <Text className="text-gray-800 text-base mb-4" style={{ textAlign: 'right' }}>
                    JoinUp (&quot;האפליקציה&quot;, &quot;אנחנו&quot;) מפעילה קהילת ספורט לתיאום משחקים בין משתמשים.
                    מסמך זה מסביר אילו מידע אנו אוספים, כיצד אנו משתמשים בו, וכיצד ניתן לפנות אלינו.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>אילו מידע אנו אוספים</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    • פרטי חשבון: שם, אימייל, תמונת פרופיל, טלפון (אופציונלי) — מנוהלים דרך ספק האימות שלנו, Clerk.{"\n"}
                    • תוכן שנוצר בשימוש: משחקים, הודעות צ&apos;אט, דירוגים בין שחקנים.{"\n"}
                    • מיקום: עיר/מגרש שבחרת עבור משחק.{"\n"}
                    • טוקן התראות Push (אם אישרת התראות), לצורך שליחת עדכונים.{"\n"}
                    • נתוני שימוש טכניים לתפעול ואבחון תקלות.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>כיצד אנו משתמשים במידע</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    הפעלת הפיצ&apos;רים המרכזיים (משחקים, צ&apos;אט, התראות), שמירה על קהילה בטוחה (כולל בדיקת
                    מודרציה על הודעות והסמכות להסיר תוכן או להשעות חשבון שמפר את הכללים), ושיפור המוצר בתקופת הבטא.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>שיתוף עם צדדים שלישיים</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    אנו משתמשים בספקים חיצוניים לתפעול השירות בלבד: Clerk (אימות), Expo/Firebase (התראות Push),
                    וספקי אחסון ענן. אנו לא מוכרים מידע אישי לצדדים שלישיים.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>הזכויות שלך</Text>
                <Text className="text-gray-700">
                    ניתן לפנות אלינו בכל עת לעיין, לתקן, או למחוק את החשבון והמידע הנלווה אליו, דרך עמוד ההגדרות באפליקציה.
                </Text>
            </ScrollView>
        </>
    );
}
