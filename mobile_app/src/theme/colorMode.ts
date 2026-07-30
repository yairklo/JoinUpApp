import { Appearance, ColorSchemeName } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const COLOR_MODE_KEY = 'joinup-color-mode';

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export type AppColorMode = 'light' | 'dark';

export async function loadColorMode(): Promise<AppColorMode> {
  try {
    const val = await withTimeout(
      SecureStore.getItemAsync(COLOR_MODE_KEY),
      1000,
      '__TIMEOUT__'
    );
    if (val === '__TIMEOUT__') {
      console.warn('SecureStore.getItemAsync timed out for key:', COLOR_MODE_KEY);
      return 'light';
    }
    if (val === 'dark' || val === 'light') return val;
  } catch (e) {
    console.error('SecureStore.getItemAsync error:', e);
  }
  return 'light';
}

export async function saveColorMode(mode: AppColorMode): Promise<void> {
  try {
    await withTimeout(SecureStore.setItemAsync(COLOR_MODE_KEY, mode), 1000, null);
  } catch (e) {
    console.error('SecureStore.setItemAsync error:', e);
  }
}

export function applyColorMode(mode: AppColorMode): void {
  Appearance.setColorScheme(mode as NonNullable<ColorSchemeName>);
}

/** First launch / no saved preference → light. Otherwise restore saved choice. */
export async function initColorMode(): Promise<AppColorMode> {
  // Avoid a dark flash while SecureStore resolves (OS may prefer dark)
  applyColorMode('light');
  const mode = await loadColorMode();
  applyColorMode(mode);
  return mode;
}

export async function toggleColorMode(current: ColorSchemeName): Promise<AppColorMode> {
  const next: AppColorMode = current === 'dark' ? 'light' : 'dark';
  applyColorMode(next);
  await saveColorMode(next);
  return next;
}
