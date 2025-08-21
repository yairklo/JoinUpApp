"use client";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function Navbar(){
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur">
      <div className="container-prose flex h-14 items-center justify-between">
        <Link href="/" className="text-base font-semibold">JoinUp</Link>
        <ThemeToggle />
      </div>
    </header>
  );
}


