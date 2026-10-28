import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const KEY = 'joinup.installationId';
let cached: string | null = null;

/** Stable random id for this app install; lets the server replace this device's old push-token row. */
export async function getInstallationId(): Promise<string | undefined> {
  if (cached) return cached;
  try {
    let id = await SecureStore.getItemAsync(KEY);
    if (!id) {
      id = `app-${Crypto.randomUUID()}`;
      await SecureStore.setItemAsync(KEY, id);
    }
    cached = id;
    return id;
  } catch {
    return undefined;
  }
}
