"use client";
import { useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

// MUI Imports
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import LoginIcon from "@mui/icons-material/Login";

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
    <Box display="flex" flexDirection="column" alignItems="flex-end">
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="outlined" color="primary" size="small" startIcon={<LoginIcon />}>
            התחבר
          </Button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <Button
          onClick={leave}
          disabled={loading}
          variant="outlined"
          color="error"
          size="small"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <ExitToAppIcon />}
        >
          {loading ? "יוצא..." : "צא מהמשחק"}
        </Button>
        {error && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </SignedIn>
    </Box>
  );
}