import sys
import glob

components_dir = "c:/JoinUpApp/mobile_app/src/components/"

def replace_in_file(file_path, replacements):
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Add useTranslation if not present
    if "useTranslation" not in content and any(r[0] in content for r in replacements):
        content = content.replace("import React", "import React from 'react';\nimport { useTranslation } from 'react-i18next';\n//")
        content = content.replace("//", "") # Clean up hack
        # This is a bit brittle, so let's just insert it after the first import
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if line.startswith("import "):
                lines.insert(i + 1, "import { useTranslation } from 'react-i18next';")
                break
        content = '\n'.join(lines)
        
        # Inject const { t } = useTranslation();
        # Find the main component function
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if "export default function" in line or "const " in line and "=>" in line:
                if "{" in line and "return" not in line:
                   lines.insert(i + 1, "  const { t } = useTranslation();")
                   break
        content = '\n'.join(lines)

    for old, new in replacements:
        content = content.replace(old, new)
        
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(content)

# GameCard.tsx
replace_in_file(components_dir + "GameCard.tsx", [
    ("'מלא'", "t('game.full')"),
    ("flex-row-reverse", "flex-row"),
    ("text-right", "text-left")
])

# MyGamesSection.tsx
replace_in_file(components_dir + "MyGamesSection.tsx", [
    (">המשחקים שלי<", ">{t('home.myGames')}<"),
    ("flex-row-reverse", "flex-row"),
    ("text-right", "text-left")
])

# SeriesSection.tsx
replace_in_file(components_dir + "SeriesSection.tsx", [
    (">הסדרות שלי<", ">{t('home.mySeries')}<"),
    ("s.sport || 'ספורט'", "s.sport || t('newGame.sport')"),
    ("flex-row-reverse", "flex-row"),
    ("text-right", "text-left")
])

# JoinGameButton.tsx
replace_in_file(components_dir + "JoinGameButton.tsx", [
    (">הצטרף למשחק<", ">{t('game.joinGame')}<"),
    ("הרשמה תיפתח ב:", "{t('game.registrationOpensAt')} ")
])

# LeaveGameButton.tsx
replace_in_file(components_dir + "LeaveGameButton.tsx", [
    (">עזוב משחק<", ">{t('game.leaveGame')}<")
])

print("Updated components!")
