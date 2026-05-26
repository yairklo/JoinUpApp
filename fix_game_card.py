import sys

file_path = "c:/JoinUpApp/mobile_app/src/components/GameCard.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("currentשחקנים", "currentPlayers")
content = content.replace("maxשחקנים", "maxPlayers")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Fixed GameCard.tsx!")
