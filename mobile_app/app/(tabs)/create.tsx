import { Redirect } from 'expo-router';

/** Tab slot for the center FAB — navigation is handled in the tab bar button. */
export default function CreateTabPlaceholder() {
  return <Redirect href="/game/new" />;
}
