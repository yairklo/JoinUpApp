"use client";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

// Runtime caches that older service workers filled with authenticated API responses
// (next-pwa defaults: "cross-origin" = API host, "apis" = same-origin /api/*). The current
// worker never writes API responses (NetworkOnly in next.config.ts), so this only cleans up
// existing installs.
const API_CACHE_NAMES = ["cross-origin", "apis"] as const;

export async function clearApiCaches(): Promise<void> {
    if (typeof caches === "undefined") return;
    await Promise.all(API_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)));
}

/**
 * Best-effort: whenever the session is known to be signed out (after any sign-out path, or a
 * signed-out visit on an install that still has old cached API data), drop the API caches.
 */
export default function PwaCacheCleanup() {
    const { isLoaded, isSignedIn } = useAuth();
    useEffect(() => {
        if (isLoaded && !isSignedIn) void clearApiCaches().catch(() => undefined);
    }, [isLoaded, isSignedIn]);
    return null;
}
