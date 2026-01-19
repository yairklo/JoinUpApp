"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

// MUI Imports
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import LoginIcon from "@mui/icons-material/Login";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function LeaveGameButton({ gameId, onLeft, currentPlayers = 0 }: { gameId: string; onLeft?: () => void; currentPlayers?: number }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openConfirm, setOpenConfirm] = useState(false);

  const handleClick = () => {
    if (currentPlayers === 1) {
      setOpenConfirm(true);
    } else {
      leave();
    }
  };

  async function leave() {
    setOpenConfirm(false); // Ensure closed if coming from dialog
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

      const data = await res.json().catch(() => ({}));
      if (data.deleted) {
        router.push('/');
        return;
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
          onClick={handleClick}
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

      <Dialog
        open={openConfirm}
        onClose={() => setOpenConfirm(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        dir="rtl"
      >
        <DialogTitle id="alert-dialog-title">
          {"עזיבת המשחק ומחיקתו"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            אתה השחקן האחרון במשחק. עזיבתך תגרום למחיקת המשחק לצמיתות. האם להמשיך?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConfirm(false)} color="primary">
            ביטול
          </Button>
          <Button onClick={leave} color="error" autoFocus>
            מחק וצא
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}