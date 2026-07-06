import { Slot, SplashScreen, Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { useColorScheme, LogBox, View, Text } from "react-native";

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { ClerkProvider, ClerkLoaded, useAuth } from "@clerk/clerk-expo";
import { tokenStorage } from "@/services/api/client.adapter";
import { ChatProvider } from "@/context/ChatContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { GameUpdateProvider } from "@/context/GameUpdateContext";
import { I18nextProvider } from 'react-i18next';
import i18n, { initI18n } from "@/i18n";
import { SocketManager } from "@/services/socketManager";
import "../global.css"; // NativeWind

// Fix #9: Defined once outside component — not recreated on every render
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

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  console.error("Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env");
}

export default function RootLayout() {
  const [i18nLoaded, setI18nLoaded] = useState(false);
  const colorScheme = useColorScheme();

  useEffect(() => {
    const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
    Promise.race([initI18n(), timeout])
      .then(() => {
        setI18nLoaded(true);
      })
      .catch((e) => {
        console.error('I18n init error:', e);
        setI18nLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (i18nLoaded) {
      SplashScreen.hideAsync().catch(console.warn);
    }
  }, [i18nLoaded]);

  if (!i18nLoaded) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Loading i18n...</Text></View>;

  return (
    <I18nextProvider i18n={i18n}>
      <ClerkProvider tokenCache={tokenStorage} publishableKey={publishableKey}>
        <ClerkLoaded>
          <AuthGuard>
            <ThemeProvider value={colorScheme === 'dark' ? CyberDarkTheme : DefaultTheme}>
              <ChatProvider>
                <NotificationProvider>
                  <GameUpdateProvider>
                    <Stack screenOptions={{ headerShown: false }} />
                  </GameUpdateProvider>
                </NotificationProvider>
              </ChatProvider>
            </ThemeProvider>
          </AuthGuard>
        </ClerkLoaded>
      </ClerkProvider>
    </I18nextProvider>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isLoaded) return;

    const inAuthGroup = segments[0] === 'sign-in' || segments[0] === 'sign-up';

    if (!isSignedIn) {
      // If not signed in and not on auth pages, redirect to sign-in
      if (!inAuthGroup) {
        router.replace("/sign-in");
      }
    } else {
      // If signed in and on auth pages, redirect to home
      if (inAuthGroup) {
        router.replace("/(tabs)");
      }
    }
  }, [isLoaded, isSignedIn, segments]);

  useEffect(() => {
    if (!isLoaded) return;

    if (isSignedIn) {
      // Connect socket once. ChatContext will send 'setup' with the actual userId.
      // No cleanup return here — socket must stay alive across re-renders.
      getToken().then((token) => {
        if (token) SocketManager.connect(token);
      });
    } else {
      // Only disconnect on actual sign-out
      SocketManager.disconnect();
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Loading Clerk...</Text></View>;

  return <>{children}</>;
}
