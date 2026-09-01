"use client";

import { useEffect } from "react";

// Clerk silently logs "Clerk has been loaded with development keys..." to the browser
// console when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a pk_test_ key, which is easy to miss
// among normal console noise — and dangerous if it ever happens in production (dev keys
// have much higher rate limits removed / different fraud protections and are not meant to
// serve real traffic). This makes that condition loud in the console without showing any
// UI to real users — the fix (swapping the Vercel env var for a pk_live_ key) is outside
// this codebase; this is only a "you will not miss this" guard for developers.
function isProdEnv(): boolean {
  return process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
}

function usesDevKey(): boolean {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  return key.startsWith("pk_test_");
}

export default function ClerkDevKeyGuard() {
  useEffect(() => {
    if (isProdEnv() && usesDevKey()) {
      // Intentionally loud — this must not blend into normal console output.
      console.error(
        "%c[CLERK CONFIG ERROR] Production is running with a Clerk DEVELOPMENT publishable key " +
          "(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY starts with 'pk_test_'). This must be swapped for a " +
          "pk_live_ key in the Vercel project's production environment variables — dev keys are not " +
          "meant to serve real traffic.",
        "color: white; background: #b91c1c; font-weight: bold; padding: 2px 6px; border-radius: 3px;"
      );
    }
  }, []);

  return null;
}
