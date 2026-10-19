import type { ReactNode } from "react";
import { notFound } from "next/navigation";

// Internal design pickers under /dev/* are for local development only.
//
// The HTTP 404 itself comes from src/middleware.ts (isDevOnlyPath): because the root
// app/loading.tsx wraps every route in Suspense, a notFound() thrown here is streamed
// as the not-found UI with status 200, not 404. This server component (no "use client")
// stays as defense in depth: in production builds the /dev pages prerender to the
// not-found UI (noindex) instead of the pickers, even if the middleware matcher changes.
export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <>{children}</>;
}
