/**
 * Runtime fingerprint inputs for EAS Update (app.json runtimeVersion policy "fingerprint").
 * Only things that change the NATIVE app should change the runtime version — otherwise an OTA
 * update silently stops reaching builds that are already installed.
 * - npm scripts and .gitignore are not native inputs (adding `update:*` scripts must not bump it).
 * - eas.json / .easignore are ignored (ignorePaths): the EXPO_PUBLIC_* values there are
 *   JS-only, so e.g. an API domain change can ship to existing builds over OTA. Trade-off: a
 *   native-relevant eas.json change (buildType, env read by a config plugin) won't bump the
 *   runtime by itself — ship those with a new store build.
 */
/** @type {import('expo/fingerprint').Config} */
const { SourceSkips, DEFAULT_SOURCE_SKIPS } = require("expo/fingerprint");

module.exports = {
  sourceSkips: DEFAULT_SOURCE_SKIPS | SourceSkips.PackageJsonScriptsAll | SourceSkips.GitIgnore,
  ignorePaths: ["eas.json", ".easignore"],
};
