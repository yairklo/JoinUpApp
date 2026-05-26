import sys

file_path = "c:/JoinUpApp/mobile_app/app/game/[id].tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add useTranslation import
content = content.replace("import { useSeriesLogic } from '@/hooks/useSeriesLogic';", "import { useSeriesLogic } from '@/hooks/useSeriesLogic';\nimport { useTranslation } from 'react-i18next';")

content = content.replace("export default function GameDetailsScreen() {", "export default function GameDetailsScreen() {\n    const { t } = useTranslation();")

content = content.replace("'פרטי משחק'", "t('game.details')")
content = content.replace('"מגרש לא ידוע"', "t('game.unknownField')")
content = content.replace('"לא סופק מיקום"', "t('game.unknownLocation')")
content = content.replace("'Free'", "t('game.free')")
content = content.replace('>שחקנים<', ">{t('game.players')}<")
content = content.replace('"עזוב"', "t('game.leave')")
content = content.replace('"הצטרף"', "t('game.join')")

content = content.replace("flex-row-reverse", "flex-row")
content = content.replace("text-right", "text-left")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated game/[id].tsx")
