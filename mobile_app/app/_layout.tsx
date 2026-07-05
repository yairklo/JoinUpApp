import { Slot, SplashScreen, Stack, useRouter } from "expo-router";
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
import "../global.css"; // NativeWind

console.log("=== _layout.tsx loaded ===");

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  console.error("Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env");
}

export default function RootLayout() {
  console.log("=== RootLayout rendering ===");
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
    console.log("=== RootLayout useEffect (mount) ===");
    const timeout = new Promise((resolve) => setTimeout(resolve, 2000));
    Promise.race([initI18n(), timeout])
      .then(() => {
        console.log("=== RootLayout i18n init resolved ===");
        setI18nLoaded(true);
      })
      .catch((e) => {
        console.error("I18n init error:", e);
        setI18nLoaded(true);
      });
  }, []);

  useEffect(() => {
    console.log("=== RootLayout useEffect i18nLoaded change:", i18nLoaded, "===");
    if (i18nLoaded) {
      console.log("=== Calling SplashScreen.hideAsync() ===");
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
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Loading Clerk...</Text></View>;

  return <>{children}</>;
}
