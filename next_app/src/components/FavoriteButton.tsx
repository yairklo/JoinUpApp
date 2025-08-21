"use client";
import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function FavoriteButton({ fieldId }: { fieldId: string }) {
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;
  const [isFav, setIsFav] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/users/${userId}/favorites`).then(r => r.json()).then((arr) => {
      setIsFav(arr.some((f: any) => f.id === fieldId));
    }).catch(() => {});
  }, [userId, fieldId]);

  const toggle = async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) return;
      if (!isFav) {
        const res = await fetch(`${API_BASE}/api/users/${userId}/favorites/${fieldId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setIsFav(true);
      } else {
        const res = await fetch(`${API_BASE}/api/users/${userId}/favorites/${fieldId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) setIsFav(false);
      }
      // fire-and-forget invalidation so lists refresh counts without full reload
      try { fetch(`${API_BASE}/api/fields`, { cache: 'no-store' }); } catch {}
    } finally {
      setLoading(false);
    }
  };

  if (!userId) return null;

  return (
    <button onClick={toggle} disabled={loading} className="text-xs px-2 py-0.5 rounded border">
      {isFav ? '★ Favorite' : '☆ Favorite'}
    </button>
  );
}


