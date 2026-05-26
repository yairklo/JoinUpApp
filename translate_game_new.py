import sys

file_path = "c:/JoinUpApp/mobile_app/app/game/new.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add useTranslation import
content = content.replace("import DateTimePicker from '@react-native-community/datetimepicker';", "import DateTimePicker from '@react-native-community/datetimepicker';\nimport { useTranslation } from 'react-i18next';")

content = content.replace("export default function NewGameScreen() {", "export default function NewGameScreen() {\n    const { t } = useTranslation();")

content = content.replace(">ספורט<", ">{t('newGame.sport')}<")
content = content.replace("SOCCER: 'כדורגל'", "SOCCER: t('newGame.soccer')")
content = content.replace("BASKETBALL: 'כדורסל'", "BASKETBALL: t('newGame.basketball')")
content = content.replace("TENNIS: 'טניס'", "TENNIS: t('newGame.tennis')")
content = content.replace("VOLLEYBALL: 'כדורעף'", "VOLLEYBALL: t('newGame.volleyball')")

content = content.replace(">כותרת המשחק (לא חובה)<", ">{t('newGame.title')}<")
content = content.replace(">זמן משחק (שעות)<", ">{t('newGame.duration')}<")
content = content.replace(">בחר מגרש<", ">{t('newGame.selectField')}<")
content = content.replace(">מקסימום שחקנים<", ">{t('newGame.maxPlayers')}<")
content = content.replace(">מחיר (₪)<", ">{t('newGame.price')}<")
content = content.replace(">קבוצה פרטית?<", ">{t('newGame.privateGroup')}<")
content = content.replace(">הגרלה?<", ">{t('newGame.lottery')}<")
content = content.replace(">פתיחת הרשמה עתידית?<", ">{t('newGame.futureRegistration')}<")
content = content.replace(">יצירת משחק<", ">{t('newGame.create')}<")
content = content.replace(">פרטים נוספים (לא חובה)<", ">{t('newGame.description')}<")
content = content.replace(">לינק לקבוצת הוואטסאפ (לא חובה)<", ">{t('newGame.whatsappLink')}<")

content = content.replace("flex-row-reverse", "flex-row")
content = content.replace("text-right", "text-left")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated game/new.tsx")
