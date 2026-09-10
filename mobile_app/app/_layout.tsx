import { Slot, SplashScreen, Stack, useRouter, useSegments } from "expo-router";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { LogBox, View, Text, AppState, AppStateStatus, Platform } from "react-native";
import * as Sentry from "@sentry/react-native";

LogBox.ignoreLogs(['expo-notifications: Android Push notifications']);

// Error monitoring. No-ops when the DSN isn't configured, so this stays
// inert in local/dev builds until ops sets EXPO_PUBLIC_SENTRY_DSN.
if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    environment: process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? "development" : "production"),
    tracesSampleRate: Number(process.env.EXPO_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.1),
  });
}
import { ThemeProvider, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { ClerkProvider, ClerkLoaded, useAuth, getClerkInstance } from "@clerk/clerk-expo";
import { tokenStorage } from "@/services/api/client.adapter";
import { ChatProvider } from "@/context/ChatContext";
import { NotificationProvider } from "@/context/NotificationContext";
import { NotificationCountersProvider } from "@/context/NotificationCountersContext";
import { GameUpdateProvider } from "@/context/GameUpdateContext";
import { I18nextProvider } from 'react-i18next';
import i18n, { initI18n } from "@/i18n";
import { SocketManager } from "@/services/socketManager";
import { ColorModeProvider, useColorMode } from "@/theme/ColorModeContext";
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
    primary: '#059669',
  },
};

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

if (!publishableKey) {
  console.error("Missing Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env");
}

// Live keys are on a *.vercel.app domain, which can't be CNAME'd to Clerk's
// Frontend API (no DNS control over vercel.app). next_app already solves this
// for web with a proxy at /__clerk (see clerkFrontendApiProxy.ts). This prop
// only takes effect for Expo *web* — @clerk/clerk-expo's native singleton
// (provider/singleton/createClerkInstance.js) calls `new ClerkClass(publishableKey)`
// with no options object at all, so proxyUrl/domain can't reach it that way.
const clerkProxyUrl = publishableKey?.startsWith("pk_live_")
  ? "https://join-up-app.vercel.app/__clerk"
  : undefined;

// Native (iOS/Android) workaround for the same problem: since the singleton gives
// us no way to configure the Frontend API host, rewrite requests to the broken
// raw domain onto the working proxy via the (public, if "__unstable__") request
// interceptor hook instead. Confirmed additive — this doesn't replace the
// singleton's own onBeforeRequest (which sets the native auth header).
if ((Platform.OS === "ios" || Platform.OS === "android") && publishableKey?.startsWith("pk_live_")) {
  const BROKEN_FAPI_HOST = "clerk.join-up-app.vercel.app";
  const WORKING_PROXY_ORIGIN = "https://join-up-app.vercel.app";
  const WORKING_PROXY_PREFIX = "/__clerk";
  const clerkInstance: any = getClerkInstance({ publishableKey, tokenCache: tokenStorage });
  clerkInstance.__unstable__onBeforeRequest(async (requestInit: any) => {
    const url = requestInit?.url;
    if (url instanceof URL && url.hostname === BROKEN_FAPI_HOST) {
      requestInit.url = new URL(`${WORKING_PROXY_ORIGIN}${WORKING_PROXY_PREFIX}${url.pathname}${url.search}`);
    }
  });
}

function RootLayout() {
  return (
    <ColorModeProvider>
      <RootLayoutInner />
    </ColorModeProvider>
  );
}

function RootLayoutInner() {
  const [i18nLoaded, setI18nLoaded] = useState(false);
  const { colorMode } = useColorMode();

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
      <ClerkProvider tokenCache={tokenStorage} publishableKey={publishableKey} proxyUrl={clerkProxyUrl}>
        <ClerkLoaded>
          <AuthGuard>
            <ThemeProvider value={colorMode === 'dark' ? CyberDarkTheme : DefaultTheme}>
              <ChatProvider>
                <NotificationProvider>
                  <NotificationCountersProvider>
                    <GameUpdateProvider>
                      <Stack screenOptions={{ headerShown: false }} />
                    </GameUpdateProvider>
                  </NotificationCountersProvider>
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

    if (!isSignedIn) {
      SocketManager.disconnect();
      return;
    }

    // Wait until Clerk is fully loaded AND user is signed in before opening the socket.
    let cancelled = false;

    SocketManager.setAuthRefresher(() => getToken());

    const connectWhenReady = async () => {
      try {
        const token = await getToken();
        if (cancelled || !token) return;
        SocketManager.connect(token);
      } catch (e) {
        console.error('[AuthGuard] Socket connect failed — token not ready', e);
      }
    };

    connectWhenReady();

    const onAppStateChange = (next: AppStateStatus) => {
      if (next !== 'active' || cancelled) return;
      connectWhenReady();
    };
    const appSub = AppState.addEventListener('change', onAppStateChange);

    return () => {
      cancelled = true;
      appSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getToken identity churn must not remount mid-handshake
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) return <View style={{flex:1, justifyContent:'center', alignItems:'center'}}><Text>Loading Clerk...</Text></View>;

  return <>{children}</>;
}

export default Sentry.wrap(RootLayout);
