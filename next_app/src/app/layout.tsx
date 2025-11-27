import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import AuthButtons from "@/components/AuthButtons";
import AppNavbar from "@/components/AppNavbar";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme/theme-provider";

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
      <html lang="en" className="light" suppressHydrationWarning>
        <head>
          <link rel="icon" href="/favicon.svg" />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} data-nextjs-scroll-behavior="true" data-nextjs-router="true" suppressHydrationWarning>
          <ThemeProvider>
          <AppNavbar />
          <main className="container" style={{paddingBlock:"1.25rem"}}>
            {children}
          </main>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
