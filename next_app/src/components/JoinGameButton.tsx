"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

// MUI Imports
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import AddIcon from "@mui/icons-material/Add";
import LoginIcon from "@mui/icons-material/Login";
import Tooltip from "@mui/material/Tooltip";
import LockIcon from "@mui/icons-material/LockClock";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function JoinGameButton({
  gameId,
  onJoined,
  onRequestSent,
  registrationOpensAt,
  joinPolicy,
  viewerParticipationStatus,
  waitlistOfferPending
}: {
  gameId: string;
  onJoined?: (updatedGame?: any) => void;
  onRequestSent?: (updatedGame?: any) => void;
  registrationOpensAt?: string | null;
  joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | null;
  waitlistOfferPending?: boolean;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Seed from server-provided status so a hard refresh doesn't forget an in-flight request.
  const [pending, setPending] = useState(viewerParticipationStatus === "PENDING" && !waitlistOfferPending);
  const [offerPending, setOfferPending] = useState(waitlistOfferPending);
  const [waitlisted, setWaitlisted] = useState(viewerParticipationStatus === "WAITLISTED" && !waitlistOfferPending);
  // A REQUIRES_APPROVAL rejection is terminal (server blocks re-requesting); an INSTANT game lets
  // a previously-rejected user join normally, so this only locks the button for the approval flow.
  const isRejectedTerminal = viewerParticipationStatus === "REJECTED" && joinPolicy === "REQUIRES_APPROVAL";

  useEffect(() => {
    const isOffer = !!waitlistOfferPending;
    setOfferPending(isOffer);
    
    // If it's PENDING and not an offer, the user is waiting for organizer approval.
    const isWaitingForApproval = viewerParticipationStatus === "PENDING" && !isOffer;
    setPending(isWaitingForApproval);
    
    setWaitlisted(viewerParticipationStatus === "WAITLISTED" && !isOffer);
  }, [viewerParticipationStatus, waitlistOfferPending, joinPolicy]);

  const now = new Date();
  const openDate = registrationOpensAt ? new Date(registrationOpensAt) : null;
  const isRegistrationClosed = openDate && now < openDate;

  async function join() {
    if (isRegistrationClosed || pending) return;
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

      const body = await res.json().catch(() => ({}));
      if (body.pending) {
        setPending(true);
        if (onRequestSent) onRequestSent(body);
        return;
      }

      if (onJoined) onJoined(body);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setLoading(false);
    }
  }

  async function confirmWaitlist(accept: boolean) {
    setError(null);
    setLoading(true);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(`${API_BASE}/api/games/${gameId}/waitlist-confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accept })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to confirm waitlist offer");
      }
      const body = await res.json().catch(() => ({}));
      if (onJoined) onJoined(body);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to process waitlist offer");
    } finally {
      setLoading(false);
    }
  }

  async function leaveWaitlist() {
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
        throw new Error(body.error || "Failed to leave waitlist");
      }
      const body = await res.json().catch(() => ({}));
      if (onJoined) onJoined(body);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to cancel waitlist registration");
    } finally {
      setLoading(false);
    }
  }

  // Formatting for Hebrew Tooltip
  let tooltipText = "";
  let dateStr = "";
  let timeStr = "";

  if (openDate) {
    dateStr = openDate.toLocaleDateString("he-IL", { day: 'numeric', month: 'numeric' });
    timeStr = openDate.toLocaleTimeString("he-IL", { hour: '2-digit', minute: '2-digit' });
    tooltipText = `ההרשמה נפתחת ב-${dateStr} בשעה ${timeStr}`;
  }

  return (
    <Box display="flex" flexDirection="column" alignItems="flex-end">
      <SignedOut>
        <SignInButton mode="modal">
          <Button variant="contained" color="primary" size="small" startIcon={<LoginIcon />}>
            התחבר כדי להצטרף
          </Button>
        </SignInButton>
      </SignedOut>

      <SignedIn>
        {waitlistOfferPending ? (
          <Box display="flex" flexDirection="column" gap={1} alignItems="flex-end">
            <Typography variant="body2" color="warning.main" fontWeight="bold" align="right" sx={{ mb: 0.5 }}>
              התפנה מקום במשחק! המקום שמור לך. האם ברצונך להצטרף?
            </Typography>
            <Box display="flex" gap={1}>
              <Button
                onClick={() => confirmWaitlist(true)}
                disabled={loading}
                variant="contained"
                color="success"
                size="small"
              >
                אישור הצטרפות
              </Button>
              <Button
                onClick={() => confirmWaitlist(false)}
                disabled={loading}
                variant="contained"
                color="error"
                size="small"
              >
                ויתור
              </Button>
            </Box>
          </Box>
        ) : viewerParticipationStatus === "WAITLISTED" ? (
          <Box display="flex" flexDirection="column" gap={1} alignItems="flex-end">
            <Typography variant="body2" color="text.secondary" fontWeight="bold" align="right" sx={{ mb: 0.5 }}>
              הרשמת כמחליף (ברשימת המתנה)
            </Typography>
            <Button
              onClick={leaveWaitlist}
              disabled={loading}
              variant="outlined"
              color="error"
              size="small"
            >
              בטל הרשמה כמחליף
            </Button>
          </Box>
        ) : pending ? (
          <Button
            disabled
            variant="outlined"
            color="warning"
            size="small"
          >
            ממתין לאישור המארגן
          </Button>
        ) : isRejectedTerminal ? (
          <Button
            disabled
            variant="outlined"
            color="inherit"
            size="small"
          >
            הבקשה נדחתה
          </Button>
        ) : isRegistrationClosed ? (
          <Tooltip title={tooltipText} arrow placement="top">
            <span>
              <Button
                disabled
                variant="contained"
                color="inherit"
                size="small"
                startIcon={<LockIcon fontSize="small" />}
                sx={{
                  opacity: 0.8, // Slightly more opaque for readability
                  backgroundColor: 'action.disabledBackground',
                  color: 'text.primary', // Use primary text color for readability
                  fontWeight: 'bold'
                }}
              >
                {`נפתח ב-${dateStr} ${timeStr}`}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            onClick={join}
            disabled={loading}
            variant="contained"
            color="primary"
            size="small"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AddIcon />}
          >
            {loading ? "מצטרף..." : joinPolicy === "REQUIRES_APPROVAL" ? "בקש להצטרף" : "הצטרף"}
          </Button>
        )}

        {error && (
          <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>
            {error === "Registration is not yet open" ? "ההרשמה טרם נפתחה" : error}
          </Typography>
        )}
      </SignedIn>
    </Box>
  );
}