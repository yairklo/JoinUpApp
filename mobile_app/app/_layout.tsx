import { Slot, SplashScreen, Stack, useRouter } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { useColorScheme } from "react-native";
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { tokenStorage } from "@/services/api/client.adapter";
import { ChatProvider } from "@/context/ChatContext";
import { GameUpdateProvider } from "@/context/GameUpdateContext";
import { I18nextProvider } from 'react-i18next';
import i18n, { initI18n } from "@/i18n";
import "../global.css"; // NativeWind

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  console.error("Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env");
}

export default function RootLayout() {
  const [loaded, error] = useFonts({});
  const [i18nLoaded, setI18nLoaded] = useState(false);
  const colorScheme = useColorScheme();

  const CyberDarkTheme = {
    ...DarkTheme,
    colors: {
      ...DarkTheme.colors,
      background: '#0a0a0a',
      card: '#171717',
      text: '#f8fafc',
      border: '#262626',
      primary: '#2563eb',
    },
  };

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    initI18n().then(() => setI18nLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded && i18nLoaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded, i18nLoaded]);

  if (!i18nLoaded) return null;

  return (
    <I18nextProvider i18n={i18n}>
      <ClerkProvider tokenCache={tokenStorage} publishableKey={publishableKey}>
        <ClerkLoaded>
          <AuthGuard>
            <ThemeProvider value={colorScheme === 'dark' ? CyberDarkTheme : DefaultTheme}>
              <ChatProvider>
                <GameUpdateProvider>
                  <Stack screenOptions={{ headerShown: false }} />
                </GameUpdateProvider>
              </ChatProvider>
            </ThemeProvider>
          </AuthGuard>
        </ClerkLoaded>
      </ClerkProvider>
    </I18nextProvider>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return null;

  return <>{children}</>;
}
