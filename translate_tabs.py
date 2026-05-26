import sys

file_path = "c:/JoinUpApp/mobile_app/app/(tabs)/_layout.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("import { Tabs } from 'expo-router';", "import { Tabs } from 'expo-router';\nimport { useTranslation } from 'react-i18next';")
content = content.replace("export default function TabLayout() {", "export default function TabLayout() {\n  const { t } = useTranslation();")
content = content.replace("title: 'Games'", "title: t('tabs.games')")
content = content.replace("headerTitle: 'JoinUp Games'", "headerTitle: 'JoinUp Games'") # Do not translate JoinUp Games
content = content.replace("title: 'Search'", "title: t('tabs.search')")
content = content.replace("title: 'Chats'", "title: t('tabs.chats')")
content = content.replace("title: 'Profile'", "title: t('tabs.profile')")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated tabs layout!")
