"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function FriendsAllPage() {
  const { user } = useUser();
  const userId = user?.id;
  const [friends, setFriends] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null }>>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then((arr) => {
      const sorted = [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setFriends(sorted);
    }).catch(() => {});
  }, [userId]);

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold mb-4">Friends</h1>
      <div className="grid grid-cols-1 gap-3">
        {friends.map((f) => (
          <Link key={f.id} href={`/users/${f.id}`} className="flex items-center gap-3 border rounded p-3 bg-white">
            <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[32px] h-[32px] ring-1 ring-gray-300">
              {f.imageUrl ? (<img src={f.imageUrl} alt={f.name || f.id} className="w-full h-full object-cover block" />) : (<span className="text-[12px] font-semibold">{getInitials(f.name || '')}</span>)}
            </span>
            <span className="text-sm text-gray-800">{f.name || f.id}</span>
          </Link>
        ))}
        {friends.length === 0 && <div className="text-sm text-gray-500">No friends yet.</div>}
      </div>
    </main>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


