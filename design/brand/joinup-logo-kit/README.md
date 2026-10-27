# JoinUp logo kit

Folders: `svg/`, `png/`, `favicon/`, `android/`, `play-store/`, `guide/` (usage guide).

## Android adaptive icon

- `android/ic_launcher_foreground.svg` - white single-colour foreground (original).
- `android/ic_launcher_foreground_color.svg` - **variant A2**: white ring with a dark-orange (`#D9480F`) notch dot, on the green (`#047857`) background layer. Same ring/dot geometry as the white foreground; ring outer radius ~30.7dp of the 108dp canvas (inside the 33dp / 66% safe zone).
- `mobile_app/assets/images/adaptive-icon.png` is this variant rendered to 1024x1024 transparent PNG; `expo.android.adaptiveIcon.backgroundColor` is `#047857`. Changing the launcher icon needs a native EAS build (not OTA).
