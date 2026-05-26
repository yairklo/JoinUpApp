import sys

file_path = "c:/JoinUpApp/mobile_app/app/(tabs)/chats.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add useTranslation import
content = content.replace("import { useFocusEffect } from '@react-navigation/native';", "import { useFocusEffect } from '@react-navigation/native';\nimport { useTranslation } from 'react-i18next';")

# Extract t from useTranslation
content = content.replace("export default function ChatsScreen() {", "export default function ChatsScreen() {\n    const { t } = useTranslation();")

# Replace strings
content = content.replace('"שחקנים"', 't("chats.players")')
content = content.replace('>שחקנים<', '>{t("chats.players")}<')
content = content.replace('"משחקים"', 't("chats.games")')
content = content.replace('>משחקים<', '>{t("chats.games")}<')
content = content.replace('"אין צ\'אטים פעילים עם שחקנים"', 't("chats.noActiveChats")')
content = content.replace('"לא נרשמת לאף משחק"', 't("chats.noGamesRegistered")')
content = content.replace('"אין הודעות עדיין"', 't("chats.noMessages")')
content = content.replace('"אתה: "', 't("chats.you")')

# Revert manual flex-row-reverse
content = content.replace("flex-row-reverse", "flex-row")
content = content.replace("text-right", "text-left")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated chats.tsx!")
