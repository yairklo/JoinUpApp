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
    fetch(`${API_BASE}/api/users/${userId}/favorites`).then(r => r.json()).then((arr: Array<{ id: string }>) => {
      setIsFav(arr.some((f) => f.id === fieldId));
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
    <button
      onClick={toggle}
      disabled={loading}
      aria-pressed={isFav}
      aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '1px solid rgba(0,0,0,0.15)',
        backgroundColor: 'rgba(255,255,255,0.9)',
        backdropFilter: 'saturate(180%) blur(2px)',
        cursor: loading ? 'not-allowed' : 'pointer'
      }}
      title={isFav ? 'Unfavorite' : 'Favorite'}
    >
      <span
        aria-hidden
        style={{
          fontSize: 16,
          lineHeight: 1,
          color: isFav ? '#f59e0b' : '#666'
        }}
      >
        {isFav ? '★' : '☆'}
      </span>
    </button>
  );
}


