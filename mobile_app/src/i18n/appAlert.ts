import { Alert, type AlertButton, type AlertOptions } from 'react-native';
import i18n from 'i18next';

/**
 * React Native's default alert button is the English word "OK".
 * Calls that omit `buttons` get the app language's common.ok ("אישור" in Hebrew).
 * Same rule as the old global Alert.alert patch, applied only by this helper.
 */
export function alertOkLabel(): string {
  if (!i18n.isInitialized) return 'אישור';
  return String(i18n.t('common.ok'));
}

export function appAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
  options?: AlertOptions,
) {
  const resolved = buttons && buttons.length > 0 ? buttons : [{ text: alertOkLabel() }];
  return Alert.alert(title, message, resolved, options);
}
