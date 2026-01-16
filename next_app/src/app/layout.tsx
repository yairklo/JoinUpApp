import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import AppNavbar from "@/components/AppNavbar";
import ThemeRegistry from "@/components/theme/themeRegistry";
import NotificationAsker from "@/components/NotificationAsker";

import { ChatProvider } from "@/context/ChatContext";
import FloatingChatWindow from "@/components/FloatingChatWindow";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#1976d2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "JoinUp",
  description: "Social Sports Application",
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
      <html lang="en">
        <head>
          <link rel="icon" href="/favicon.svg" />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable}`}>
          {/* ThemeRegistry דואג שקומפוננטות MUI יראו טוב */}
          <ThemeRegistry>
            <ChatProvider>
              {/* AppNavbar עדיין מסתמך על Bootstrap ולכן חייב את ה-CSS למעלה */}
              <AppNavbar />

              {/* הורדתי את ה-container של בוטסטראפ כדי לאפשר רוחב מלא לדפים החדשים */}
              <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
                {children}
              </main>

              <FloatingChatWindow />
              <NotificationAsker />
            </ChatProvider>
          </ThemeRegistry>
        </body>
      </html>
    </ClerkProvider>
  );
}