import sys

file_path = "c:/JoinUpApp/mobile_app/app/(tabs)/search.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add useTranslation import
content = content.replace("import { useRouter } from 'expo-router';", "import { useRouter } from 'expo-router';\nimport { useTranslation } from 'react-i18next';")

# Extract t from useTranslation
content = content.replace("export default function SearchScreen() {", "export default function SearchScreen() {\n    const { t } = useTranslation();")

# Replace strings
content = content.replace('"Game"', 't("search.game")')
content = content.replace('"Unknown Location"', 't("search.unknownLocation")')
content = content.replace('placeholder="Search games, fields..."', 'placeholder={t("search.placeholder")}')
content = content.replace('"All Cities"', 't("search.allCities")')
content = content.replace("'All Cities'", 't("search.allCities")')
content = content.replace(">No games found<", ">{t('search.noGamesFound')}<")
content = content.replace(">Select City<", ">{t('search.selectCity')}<")
content = content.replace(">Close<", ">{t('search.close')}<")

# Revert manual flex-row-reverse if any (wait, search.tsx didn't have flex-row-reverse added yet since the user only asked for translation now for the search page)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated search.tsx!")
