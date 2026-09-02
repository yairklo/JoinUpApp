import { ScrollView, Text, View } from 'react-native';
import { Stack } from 'expo-router';

export default function TermsOfServiceScreen() {
    return (
        <>
            <Stack.Screen options={{ title: 'תנאי שימוש' }} />
            <ScrollView className="flex-1 bg-white px-6 py-6" contentContainerStyle={{ paddingBottom: 40 }}>
                <View className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
                    <Text className="text-amber-800 text-sm" style={{ textAlign: 'right' }}>
                        זהו מסמך טיוטה לתקופת הבטא (טסטרים). לפני השקה רחבה יש להעביר אותו לבדיקה משפטית.{"\n"}
                        עדכון אחרון: 31.08.2026.
                    </Text>
                </View>

                <Text className="text-gray-800 text-base mb-4" style={{ textAlign: 'right' }}>
                    השימוש באפליקציית JoinUp (&quot;השירות&quot;) כפוף לתנאים הבאים. יצירת חשבון או המשך שימוש
                    בשירות מהווים הסכמה לתנאים אלה.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>1. תקופת בטא</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    השירות נמצא בשלב טסטים עם משתמשים אמיתיים. ייתכנו שינויים, איפוסי נתונים, או הפסקות שירות זמניות ללא התראה מראש.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>2. חשבון משתמש</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    אתה אחראי לשמירה על פרטי הכניסה שלך ולכל פעולה המתבצעת דרך חשבונך.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>3. התנהגות בקהילה</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    אין לפרסם תוכן פוגעני, מטריד, מפלה, או בלתי חוקי. הודעות עוברות בדיקת מודרציה אוטומטית, ואנו
                    רשאים להסיר תוכן או להשעות/לחסום חשבון שמפר את הכללים, לפי שיקול דעתנו.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>4. משחקים ותשלומים</Text>
                <Text className="text-gray-700 mb-4" style={{ textAlign: 'right' }}>
                    מחיר המוצג למשחק/קבוצה הוא למידע בלבד (תשלום מתבצע במגרש). האפליקציה אינה צד לעסקה בין
                    המשתמשים ואינה אחראית לגבייה, ביטולים, או מחלוקות כספיות.
                </Text>

                <Text className="text-gray-900 font-bold text-lg mb-2" style={{ textAlign: 'right' }}>5. הגבלת אחריות</Text>
                <Text className="text-gray-700">
                    השירות ניתן &quot;כפי שהוא&quot;, ללא אחריות מכל סוג, במיוחד בתקופת הבטא. השימוש בשירות הוא באחריותך הבלעדית.
                </Text>
            </ScrollView>
        </>
    );
}
