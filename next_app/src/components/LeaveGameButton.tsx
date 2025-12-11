"use client";
import { useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function LeaveGameButton({ gameId, onLeft }: { gameId: string; onLeft?: () => void }) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function leave() {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(`${API_BASE}/api/games/${gameId}/leave`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to leave");
      }
      if (onLeft) onLeft();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to leave");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end">
      <SignedOut>
        <SignInButton mode="modal">
          <button className="btn btn-primary btn-sm">Sign in</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        <button onClick={leave} disabled={loading} className="btn btn-danger btn-sm disabled:opacity-50">
          {loading ? "Leaving..." : "Leave game"}
        </button>
        {error && <div className="text-red-600 text-xs mt-1">{error}</div>}
      </SignedIn>
    </div>
  );
}


