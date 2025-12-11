"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function JoinGameButton({ gameId, onJoined }: { gameId: string; onJoined?: () => void }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function join() {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(`${API_BASE}/api/games/${gameId}/join`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to join");
      }
      // Soft-refresh the current route so server components refetch and counts update
      router.refresh();
      if (onJoined) onJoined();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="btn btn-primary btn-sm">Sign in to join</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <button onClick={join} disabled={loading} className="btn btn-primary btn-sm disabled:opacity-50">
          {loading ? "Joining..." : "Join"}
        </button>
        {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
      </SignedIn>
    </div>
  );
}


