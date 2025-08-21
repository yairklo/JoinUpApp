import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider, SignedIn, UserButton } from "@clerk/nextjs";
import AuthButtons from "@/components/AuthButtons";
import Container from "@/components/ui/Container";
import Link from "next/link";

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
          <link
            href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
            rel="stylesheet"
          />
          <link
            href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.css"
            rel="stylesheet"
          />
          <link rel="icon" href="/favicon.svg" />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} data-nextjs-scroll-behavior="true" data-nextjs-router="true">
          <header style={{position:"sticky", top:0, zIndex:50, backdropFilter:"saturate(180%) blur(6px)", background:"rgba(255,255,255,.85)", borderBottom:"1px solid rgb(229 231 235)"}}>
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
              <div className="avatar" aria-hidden>Y</div>
            </div>
          </header>
          <main className="container" style={{paddingBlock:"1.25rem"}}>
            {children}
          </main>
          <script async src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js" />
        </body>
      </html>
    </ClerkProvider>
  );
}
