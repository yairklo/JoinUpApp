import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

// 1. החזרנו את בוטסטראפ כדי שקומפוננטות ישנות לא ישברו
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import AppNavbar from "@/components/AppNavbar";
import ThemeRegistry from "@/components/theme/themeRegistry";
import NotificationAsker from "@/components/NotificationAsker";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JoinUp",
  description: "JoinUp - find and join pickup games",
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
            {/* AppNavbar עדיין מסתמך על Bootstrap ולכן חייב את ה-CSS למעלה */}
            <AppNavbar />

            {/* הורדתי את ה-container של בוטסטראפ כדי לאפשר רוחב מלא לדפים החדשים */}
            <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
              {children}
            </main>
            <NotificationAsker />
          </ThemeRegistry>
        </body>
      </html>
    </ClerkProvider>
  );
}