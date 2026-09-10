import { Stack } from 'expo-router';

/**
 * Nested stack for the game/* routes, inside the (tabs) group instead of the root
 * stack. This keeps them one of the Tabs navigator's own screens (hidden from the tab
 * bar UI via `href: null` on its Tabs.Screen entry) so the bottom tab bar stays visible
 * while still getting normal stack push animations and swipe-back between game screens.
 */
export default function GameStackLayout() {
    return <Stack screenOptions={{ headerShown: false }} />;
}
