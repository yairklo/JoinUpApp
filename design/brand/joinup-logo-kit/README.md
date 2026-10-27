# JoinUp logo kit

Folders: `svg/`, `png/`, `favicon/`, `android/`, `play-store/`, `guide/` (usage guide).

## Android adaptive icon

- `android/ic_launcher_foreground.svg` - white single-colour foreground (original, used with the green background layer).
- `android/ic_launcher_foreground_color.svg` - **variant B** (approved): coloured foreground - ring `#047857`, notch dot `#D9480F` - meant for a **white** (`#FFFFFF`) background layer. Same ring/dot geometry as the white foreground; ring outer radius is ~30.7dp of the 108dp canvas (inside the 33dp / 66% safe zone).
- `mobile_app/assets/images/adaptive-icon.png` is this variant rendered to 1024x1024 transparent PNG; `expo.android.adaptiveIcon.backgroundColor` is `#FFFFFF`. Changing the launcher icon needs a native EAS build (not OTA).
