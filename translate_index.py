import sys

file_path = "c:/JoinUpApp/mobile_app/app/(tabs)/index.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add imports
content = content.replace("import { Ionicons } from '@expo/vector-icons';", "import { Ionicons } from '@expo/vector-icons';\nimport { useTranslation } from 'react-i18next';\nimport { changeLanguage } from '@/i18n';\nimport i18n from '@/i18n';")

# Extract t from useTranslation
content = content.replace("export default function HomeScreen() {", "export default function HomeScreen() {\n  const { t } = useTranslation();")

# Replace strings
content = content.replace('"ברוך שובך"', 't("home.welcomeBack")')
content = content.replace('>ברוך שובך<', '>{t("home.welcomeBack")}<')
content = content.replace('"חבר"', 't("home.friend")')
content = content.replace('אין משחקים בתאריך זה', '{t("home.noGamesToday")}')
content = content.replace('נראה שאין משחקים זמינים כרגע. נסה לבחור תאריך אחר או צור משחק חדש!', '{t("home.noGamesDesc")}')
content = content.replace('>חזור להיום<', '>{t("home.backToToday")}<')

# Add language switcher near notifications
# Original:
# <Link href="/notifications" asChild>
#   <TouchableOpacity className="w-12 h-12 bg-gray-50 rounded-2xl items-center justify-center border border-gray-100">
#     <Ionicons name="notifications-outline" size={22} color="#111827" />
#   </TouchableOpacity>
# </Link>

switcher = """
        <View className="flex-row gap-2">
          <TouchableOpacity 
            onPress={() => changeLanguage(i18n.language === 'en' ? 'he' : 'en')}
            className="h-12 px-3 bg-gray-50 rounded-2xl items-center justify-center border border-gray-100"
          >
            <Text className="font-bold text-gray-800">{i18n.language === 'en' ? 'EN' : 'HE'}</Text>
          </TouchableOpacity>
          <Link href="/notifications" asChild>
            <TouchableOpacity className="w-12 h-12 bg-gray-50 rounded-2xl items-center justify-center border border-gray-100">
              <Ionicons name="notifications-outline" size={22} color="#111827" />
            </TouchableOpacity>
          </Link>
        </View>
"""

content = content.replace("""        <Link href="/notifications" asChild>
          <TouchableOpacity className="w-12 h-12 bg-gray-50 rounded-2xl items-center justify-center border border-gray-100">
            <Ionicons name="notifications-outline" size={22} color="#111827" />
          </TouchableOpacity>
        </Link>""", switcher)


# Revert manual flex-row-reverse
content = content.replace("flex-row-reverse items-center justify-between px-6 py-4", "flex-row items-center justify-between px-6 py-4")
content = content.replace("text-right", "text-left")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated index.tsx!")
