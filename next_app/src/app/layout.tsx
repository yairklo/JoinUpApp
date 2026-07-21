import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";

import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import AppNavbar from "@/components/AppNavbar";
import BottomNav from "@/components/BottomNav";
import ThemeRegistry from "@/components/theme/themeRegistry";
import NotificationAsker from "@/components/NotificationAsker";

import { ChatProvider } from "@/context/ChatContext";
import FloatingChatWindow from "@/components/FloatingChatWindow";
import { SocketProvider } from "@/context/SocketContext";
import { NotificationCountersProvider } from "@/context/NotificationCountersContext";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#059669",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "JoinUp",
  description: "קהילת הספורט של ישראל – מצאו משחקים, הצטרפו וקבעו בעצמכם",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/favicon.ico" },
      { url: "/icons/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-96x96.png", sizes: "96x96", type: "image/png" }
    ],
    apple: "/icons/apple-touch-icon.png",
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
    <ClerkProvider>
      <html lang="he" dir="rtl">
        <head>
          <link rel="icon" href="/favicon.svg" />
        </head>
        <body className={heebo.variable}>
          <SocketProvider>
            <ThemeRegistry>
              <ChatProvider>
                <NotificationCountersProvider>
                  <AppNavbar />

                  {/* padding-bottom clears the mobile bottom navigation */}
                  <main className="app-main">
                    {children}
                  </main>

                  <BottomNav />
                  <FloatingChatWindow />
                  <NotificationAsker />
                </NotificationCountersProvider>
              </ChatProvider>
            </ThemeRegistry>
          </SocketProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
