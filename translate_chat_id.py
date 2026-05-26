import sys

file_path = "c:/JoinUpApp/mobile_app/app/chat/[id].tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add useTranslation import
content = content.replace("import { Ionicons } from '@expo/vector-icons';", "import { Ionicons } from '@expo/vector-icons';\nimport { useTranslation } from 'react-i18next';")

content = content.replace("export default function ChatScreen() {", "export default function ChatScreen() {\n    const { t } = useTranslation();")

content = content.replace('"הודעה..."', "t('chat.message')")
content = content.replace('"שלח"', "t('chat.send')")
content = content.replace('>אפשרויות הודעה<', ">{t('chat.options')}<")
content = content.replace('>השב<', ">{t('chat.reply')}<")
content = content.replace('>מחק<', ">{t('chat.delete')}<")
content = content.replace('>ערוך<', ">{t('chat.edit')}<")

content = content.replace("flex-row-reverse", "flex-row")
content = content.replace("text-right", "text-left")
content = content.replace("pl-12", "pr-12") # Invert paddings
content = content.replace("pr-4", "pl-4")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated chat/[id].tsx")
