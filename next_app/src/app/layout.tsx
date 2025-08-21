import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import AuthButtons from "@/components/AuthButtons";
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
          <header style={{position:"sticky", top:0, zIndex:50}} className="w-full border-b bg-background/80 backdrop-blur">
            <div className="container" style={{display:"flex", alignItems:"center", gap:"1.5rem", height:64}}>
              <Link href="/" className="logo" style={{fontWeight:800}}>⚽ JoinUp</Link>
              <nav style={{display:"flex", gap:"1.5rem", marginInlineStart:"auto"}}>
                <Link href="/">Home</Link>
                <Link href="/fields">Fields</Link>
                <Link href="/games">Active Games</Link>
                <SignedIn>
                  <Link href="/profile">My Profile</Link>
                </SignedIn>
                <AuthButtons />
                <SignedIn>
                  <UserButton afterSignOutUrl="/" />
                </SignedIn>
              </nav>
            </div>
          </header>
          <main className="container" style={{paddingBlock:"1.25rem"}}>
            {children}
          </main>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
