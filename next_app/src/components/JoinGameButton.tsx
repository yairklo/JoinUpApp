"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

// MUI Imports
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import AddIcon from "@mui/icons-material/Add";
import LoginIcon from "@mui/icons-material/Login";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function JoinGameButton({
  gameId,
  onJoined,
  registrationOpensAt
}: {
  gameId: string;
  onJoined?: () => void;
  registrationOpensAt?: string | null;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const openDate = registrationOpensAt ? new Date(registrationOpensAt) : null;
  const isRegistrationClosed = openDate && now < openDate;

  async function join() {
    if (isRegistrationClosed) return;
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

      router.refresh();
      if (onJoined) onJoined();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box display="flex" flexDirection="column" alignItems="flex-end">
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="contained" color="primary" size="small" startIcon={<LoginIcon />}>
            Sign in to join
          </Button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        <Button
          onClick={join}
          disabled={loading || !!isRegistrationClosed}
          variant="contained"
          color={isRegistrationClosed ? "inherit" : "primary"}
          size="small"
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
        >
          {loading ? "Joining..." : (isRegistrationClosed ? `Opens at ${openDate?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : "Join")}
        </Button>
        {isRegistrationClosed && openDate && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
            {openDate.toLocaleDateString()}
          </Typography>
        )}
        {error && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
            {error}
          </Typography>
        )}
      </SignedIn>
    </Box>
  );
}