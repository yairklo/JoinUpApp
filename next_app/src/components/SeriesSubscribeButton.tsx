"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import CircularProgress from "@mui/material/CircularProgress";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function SeriesSubscribeButton({ seriesId, initialSubscribed }: { seriesId: string, initialSubscribed: boolean }) {
  const { getToken, isSignedIn } = useAuth();
  const router = useRouter();
  const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    if (!isSignedIn) {
        // Handle login redirect if needed
        return; 
    }
    setLoading(true);
    try {
        const token = await getToken();
        const method = isSubscribed ? "DELETE" : "POST";
        const res = await fetch(`${API_BASE}/api/series/${seriesId}/subscribe`, {
            method,
            headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
            setIsSubscribed(!isSubscribed);
            router.refresh();
        }
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  if (!isSignedIn) return null;

  return (
    <Button 
        variant={isSubscribed ? "outlined" : "contained"} 
        color={isSubscribed ? "secondary" : "primary"}
        startIcon={loading ? <CircularProgress size={20} /> : isSubscribed ? <StarIcon /> : <StarBorderIcon />}
        onClick={handleToggle}
        disabled={loading}
        size="large"
        sx={{ borderRadius: 4, px: 3 }}
    >
        {isSubscribed ? "You are a Regular" : "Become a Regular"}
    </Button>
  );
}