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

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      getToken().then((token) => {
        if (token) {
          SocketManager.connect(token);
        }
      });
    } else if (isLoaded && !isSignedIn) {
      SocketManager.disconnect();
    }

    return () => {
      SocketManager.disconnect();
    };
  }, [isLoaded, isSignedIn, getToken]);

  if (!isLoaded) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Loading Clerk...</Text></View>;

  return <>{children}</>;
}
