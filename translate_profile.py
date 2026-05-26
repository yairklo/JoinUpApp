import sys

file_path = "c:/JoinUpApp/mobile_app/app/(tabs)/profile.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add useTranslation import
content = content.replace("import { Ionicons } from '@expo/vector-icons';", "import { Ionicons } from '@expo/vector-icons';\nimport { useTranslation } from 'react-i18next';")

# Extract t from useTranslation
content = content.replace("export default function ProfileScreen() {", "export default function ProfileScreen() {\n    const { t } = useTranslation();")

# Replace strings
content = content.replace('"עיר לא ידועה"', 't("profile.unknownCity")')
content = content.replace('>פרטים אישיים<', '>{t("profile.personalDetails")}<')
content = content.replace('>אימייל<', '>{t("profile.email")}<')
content = content.replace('>טלפון<', '>{t("profile.phone")}<')
content = content.replace('>עיר<', '>{t("profile.city")}<')
content = content.replace('>גיל<', '>{t("profile.age")}<')
content = content.replace('>ערוך פרופיל<', '>{t("profile.editProfile")}<')
content = content.replace('>שמור שינויים<', '>{t("profile.saveChanges")}<')
content = content.replace('"שמור שינויים"', 't("profile.saveChanges")')
content = content.replace('"שגיאה"', 't("profile.error")')
content = content.replace('"נכשל בעדכון הפרופיל."', 't("profile.updateFailed")')
content = content.replace('>התנתק<', '>{t("profile.signOut")}<')
content = content.replace('>תחומי עניין בספורט<', '>{t("profile.sports")}<')
content = content.replace('>לא נבחרו ענפי ספורט מועדפים<', '>{t("profile.noSports")}<')

# Revert manual flex-row-reverse
content = content.replace("flex-row-reverse", "flex-row")
content = content.replace("text-right", "text-left")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated profile.tsx!")
