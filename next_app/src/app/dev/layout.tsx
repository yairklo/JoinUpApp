import type { ReactNode } from "react";
import { notFound } from "next/navigation";

// Internal design pickers under /dev/* are for local development only. This is a
// server component (no "use client") so notFound() runs on the server and every
// current and future /dev route returns a real 404 in production builds (including
// Vercel previews, which also run with NODE_ENV=production).
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
