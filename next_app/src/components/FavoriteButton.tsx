"use client";
import { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import IconButton from "@mui/material/IconButton";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import StarBorderRoundedIcon from "@mui/icons-material/StarBorderRounded";

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
    <IconButton
      onClick={toggle}
      disabled={loading}
      aria-pressed={isFav}
      aria-label={isFav ? "הסר ממועדפים" : "הוסף למועדפים"}
      size="small"
      sx={{
        bgcolor: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(4px)",
        boxShadow: "0 2px 8px rgba(2,6,23,0.25)",
        "&:hover": { bgcolor: "#fff" },
      }}
    >
      {isFav
        ? <StarRoundedIcon sx={{ fontSize: 20, color: "#f59e0b" }} />
        : <StarBorderRoundedIcon sx={{ fontSize: 20, color: "#475569" }} />}
    </IconButton>
  );
}
