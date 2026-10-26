"use client";
import { useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { PWA_PRIVATE_CACHE_NAMES } from "@/lib/pwaRuntimeCaching";

export async function clearApiCaches(): Promise<void> {
    try {
        if (typeof caches === "undefined") return;
        await Promise.all(PWA_PRIVATE_CACHE_NAMES.map((name) => caches.delete(name).catch(() => false)));
    } catch {
        // Best-effort: Cache Storage can be unavailable (private mode, insecure context).
    }
}

/**
 * Best-effort: whenever the session is known to be signed out (after any sign-out path, or a
 * signed-out visit on an install that still has old cached data), drop every runtime cache that
 * may hold per-user data (API JSON, pages, RSC).
 */
export default function PwaCacheCleanup() {
    const { isLoaded, isSignedIn } = useAuth();
    useEffect(() => {
        if (isLoaded && !isSignedIn) void clearApiCaches().catch(() => undefined);
    }, [isLoaded, isSignedIn]);
    return null;
}
