"use client";
import { useState } from "react";
import { useAuth } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function AddFriendButton({ receiverId }: { receiverId: string }) {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) {
        setError("Sign in required");
        return;
      }
      const res = await fetch(`${API_BASE}/api/users/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed');
      }
      setSent(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) return <span className="text-xs text-green-700">Request sent</span>;

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button onClick={send} disabled={loading} className="text-xs rounded bg-blue-600 text-white px-3 py-1 disabled:opacity-50">
        {loading ? 'Sending...' : 'Add friend'}
      </button>
    </div>
  );
}


