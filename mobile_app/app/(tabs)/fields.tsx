import { Redirect } from 'expo-router';

/** Tab slot for the Fields directory — navigation is handled in the tab bar button. */
export default function FieldsTabPlaceholder() {
  return <Redirect href="/fields" />;
}
