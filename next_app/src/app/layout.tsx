import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";

import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance, clerkHe } from "@/lib/clerkHe";
import AppNavbar from "@/components/AppNavbar";
import BottomNav from "@/components/BottomNav";
import Footer from "@/components/Footer";
import ThemeRegistry from "@/components/theme/themeRegistry";
import NotificationAsker from "@/components/NotificationAsker";
import AgeGate from "@/components/AgeGate";
import OfflineStatusToast from "@/components/OfflineStatusToast";
import PwaCacheCleanup from "@/components/PwaCacheCleanup";

import { ChatProvider } from "@/context/ChatContext";
import FloatingChatWindow from "@/components/FloatingChatWindow";
import { SocketProvider } from "@/context/SocketContext";
import { NotificationCountersProvider } from "@/context/NotificationCountersContext";
import { resolveClerkProxyUrl } from "@/lib/clerkFrontendApiProxy";
import ClerkDevKeyGuard from "@/components/ClerkDevKeyGuard";
import { SITE_URL } from "@/lib/siteUrl";

const clerkProxyUrl = resolveClerkProxyUrl();

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// Bump when the brand icons change: icons are cached for a week (next.config.ts headers) and the
// service worker serves static images stale-while-revalidate, so a new query string is what forces
// every client to fetch the new files. Keep in sync with the icon `src` query strings in public/manifest.json.
const ICON_VERSION = "brand2";

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "JoinUp",
  description: "קהילת הספורט של ישראל – מצאו משחקים, הצטרפו וקבעו בעצמכם",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: `/icons/favicon.ico?v=${ICON_VERSION}`, sizes: "16x16 32x32 48x48" },
      { url: `/icons/favicon.svg?v=${ICON_VERSION}`, type: "image/svg+xml" },
      { url: `/icons/favicon-32x32.png?v=${ICON_VERSION}`, sizes: "32x32", type: "image/png" },
      { url: `/icons/favicon-96x96.png?v=${ICON_VERSION}`, sizes: "96x96", type: "image/png" }
    ],
    apple: `/icons/apple-touch-icon.png?v=${ICON_VERSION}`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "JoinUp",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      {...(clerkProxyUrl ? { proxyUrl: clerkProxyUrl } : {})}
      localization={clerkHe}
      appearance={clerkAppearance}
    >
      <html lang="he" dir="rtl">
        <head>
          <link rel="icon" href={`/favicon.svg?v=${ICON_VERSION}`} type="image/svg+xml" />
        </head>
        <body className={heebo.variable}>
          <ClerkDevKeyGuard />
          <SocketProvider>
            <ThemeRegistry>
              <ChatProvider>
                <NotificationCountersProvider>
                  <AppNavbar />

                  {/* padding-bottom clears the mobile bottom navigation */}
                  <main className="app-main">
                    {children}
                  </main>

                  <Footer />

                  <BottomNav />
                  <FloatingChatWindow />
                  <NotificationAsker />
                  <AgeGate />
                  <OfflineStatusToast />
                  <PwaCacheCleanup />
                </NotificationCountersProvider>
              </ChatProvider>
            </ThemeRegistry>
          </SocketProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
