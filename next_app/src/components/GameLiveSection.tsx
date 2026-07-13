"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import PendingJoinRequests from "@/components/PendingJoinRequests";
import { useSocket } from "@/context/SocketContext";
import { normalizeIncomingGame } from "@/utils/timezone";
import { useAuth } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type Participant = { id: string; name: string | null; avatar?: string | null };

export type LiveGame = {
  id: string;
  time: string;
  date?: string;
  start?: string;
  duration?: number;
  title?: string | null;
  fieldName: string;
  fieldLocation: string;
  currentPlayers: number;
  maxPlayers: number;
  sport?: string;
  teamSize?: number | null;
  price?: number | null;
  participants: Participant[];
  registrationOpensAt?: string | null;
  joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | null;
  waitlistOfferPending?: boolean;
  lotteryEnabled?: boolean;
  lotteryPending?: boolean;
  totalSignups?: number;
};

// Owns the "live" slice of a game's state (header counts, join/leave button, pending requests)
// so that approving/rejecting a request, joining, or leaving instantly reflects everywhere this
// game is open — without a full page reload. Seeded from the server-rendered game and kept in
// sync via the `game:updated` socket broadcast that every mutating game endpoint now emits.
export default function GameLiveSection({
  initialGame,
  viewerId,
  canManageSeries,
}: {
  initialGame: LiveGame;
  viewerId: string;
  canManageSeries: boolean;
}) {
  const [game, setGame] = useState<LiveGame>(initialGame);
  const { socket } = useSocket();
  const { getToken } = useAuth();
  const [waitlistActionLoading, setWaitlistActionLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket) return;
    const handler = (updated: LiveGame) => {
      if (updated?.id === initialGame.id) {
        setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
      }
    };
    socket.on("game:updated", handler);
    return () => {
      socket.off("game:updated", handler);
    };
  }, [socket, initialGame.id]);

  const mergeAndSet = (updated?: any) => {
    if (updated) setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
  };

  async function confirmWaitlist(accept: boolean) {
    setWaitlistError(null);
    setWaitlistActionLoading(true);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(`${API_BASE}/api/games/${game.id}/waitlist-confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accept }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to confirm waitlist offer");
      }
      const body = await res.json().catch(() => ({}));
      mergeAndSet(body);
    } catch (e: unknown) {
      setWaitlistError(e instanceof Error ? e.message : "שגיאה בעיבוד הבקשה");
    } finally {
      setWaitlistActionLoading(false);
    }
  }

  async function leaveWaitlist() {
    setWaitlistError(null);
    setWaitlistActionLoading(true);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(`${API_BASE}/api/games/${game.id}/leave`, {
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
      mergeAndSet(body);
    } catch (e: unknown) {
      setWaitlistError(e instanceof Error ? e.message : "שגיאה בביטול ההרשמה");
    } finally {
      setWaitlistActionLoading(false);
    }
  }

  const joined = !!viewerId && (game.participants || []).some((p) => p.id === viewerId);
  const headerCount =
    (game.lotteryEnabled && game.lotteryPending
      ? game.totalSignups ?? game.currentPlayers
      : game.currentPlayers) || 0;

  const isWaitlistOfferPending = game.waitlistOfferPending === true;
  const isWaitlisted = game.viewerParticipationStatus === "WAITLISTED";

  return (
    <>
      {/* ── Waitlist Offer Banner: shown prominently OUTSIDE the card ── */}
      {isWaitlistOfferPending && (
        <Alert
          severity="warning"
          dir="rtl"
          sx={{
            mb: 2,
            borderRadius: 2,
            "& .MuiAlert-message": { width: "100%" },
          }}
        >
          <AlertTitle sx={{ fontWeight: "bold", fontSize: "1rem" }}>
            התפנה מקום במשחק!
          </AlertTitle>
          <Typography variant="body2" mb={2}>
            המקום שמור לך. עליך לאשר את ההצטרפות כדי לתפוס אותו.
          </Typography>
          {waitlistError && (
            <Typography variant="caption" color="error" display="block" mb={1}>
              {waitlistError}
            </Typography>
          )}
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              variant="contained"
              color="success"
              size="small"
              disabled={waitlistActionLoading}
              startIcon={
                waitlistActionLoading ? (
                  <CircularProgress size={16} color="inherit" />
                ) : undefined
              }
              onClick={() => confirmWaitlist(true)}
              sx={{ fontWeight: "bold" }}
            >
              אישור הצטרפות
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              disabled={waitlistActionLoading}
              onClick={() => confirmWaitlist(false)}
              sx={{ fontWeight: "bold" }}
            >
              ויתור על המקום
            </Button>
          </Box>
        </Alert>
      )}

      {/* ── Waitlist Status Banner (user waiting, no active offer yet) ── */}
      {isWaitlisted && !isWaitlistOfferPending && (
        <Alert
          severity="info"
          dir="rtl"
          sx={{
            mb: 2,
            borderRadius: 2,
            "& .MuiAlert-message": { width: "100%" },
          }}
        >
          <AlertTitle sx={{ fontWeight: "bold" }}>ברשימת המתנה</AlertTitle>
          <Typography variant="body2" mb={1.5}>
            הרשמת כמחליף. אם יתפנה מקום, תקבל הודעה ותוכל לאשר כאן.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            size="small"
            disabled={waitlistActionLoading}
            onClick={leaveWaitlist}
          >
            בטל הרשמה כמחליף
          </Button>
        </Alert>
      )}

      <GameHeaderCard
        time={game.time}
        date={game.date}
        durationHours={game.duration ?? 1}
        title={game.title || game.fieldName}
        subtitle={
          game.title
            ? `${game.fieldName} • ${game.fieldLocation}`
            : game.fieldLocation
        }
        currentPlayers={headerCount}
        maxPlayers={game.maxPlayers}
        sport={game.sport}
        teamSize={game.teamSize}
        price={game.price}
      >
        {joined ? (
          <LeaveGameButton
            gameId={game.id}
            currentPlayers={game.participants?.length || 0}
            onLeft={mergeAndSet}
          />
        ) : !isWaitlistOfferPending && !isWaitlisted ? (
          <JoinGameButton
            gameId={game.id}
            registrationOpensAt={game.registrationOpensAt}
            joinPolicy={game.joinPolicy}
            viewerParticipationStatus={game.viewerParticipationStatus}
            waitlistOfferPending={game.waitlistOfferPending}
            onJoined={mergeAndSet}
            onRequestSent={mergeAndSet}
          />
        ) : null}
      </GameHeaderCard>

      {canManageSeries && (
        <Box mt={2}>
          <PendingJoinRequests gameId={game.id} onDecision={mergeAndSet} />
        </Box>
      )}
    </>
  );
}
