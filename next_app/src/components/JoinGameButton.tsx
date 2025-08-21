"use client";
import { useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function JoinGameButton({ gameId, onJoined }: { gameId: string; onJoined?: () => void }) {
  const { getToken } = useAuth();
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
      if (onJoined) onJoined();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="px-3 py-1 rounded bg-blue-600 text-white text-xs">Sign in to join</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <button onClick={join} disabled={loading} className="px-3 py-1 rounded bg-green-600 text-white text-xs disabled:opacity-50">
          {loading ? "Joining..." : "Join"}
        </button>
        {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
      </SignedIn>
    </div>
  );
}


