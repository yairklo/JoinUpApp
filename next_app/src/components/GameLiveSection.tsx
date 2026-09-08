"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import PendingJoinRequests from "@/components/PendingJoinRequests";
import TeamBuilderWrapper from "@/components/TeamBuilderWrapper";
import GameRatingsPanel from "@/components/GameRatingsPanel";
import Chat from "@/components/Chat";
import { useSocket } from "@/context/SocketContext";
import { normalizeIncomingGame } from "@/utils/timezone";
import { gamesApi } from "@/services/api/games";
import { useAuth } from "@clerk/nextjs";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; name?: string; avatar?: string; role?: string };
type Team = { id: string; name: string; color: string; playerIds: string[] };

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
  organizerId: string;
  chatRoomId?: string;
  overbooked?: boolean;
  lotteryAt?: string | null;
  managers?: Manager[];
  teams?: Team[];
  waitlistParticipants?: Participant[];
  pickSessionStatus?: string | null;
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

  // Sync state when server data updates (e.g. after edit + router.refresh)
  useEffect(() => {
    setGame((prev) => ({ ...prev, ...initialGame }));
  }, [
    initialGame.time,
    initialGame.date,
    initialGame.duration,
    initialGame.title,
    initialGame.fieldName,
    initialGame.fieldLocation,
    initialGame.maxPlayers,
    initialGame.sport,
    initialGame.teamSize,
    initialGame.price,
    initialGame.registrationOpensAt,
    initialGame.joinPolicy,
    initialGame.lotteryEnabled
  ]);

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
      const body = await gamesApi.confirmWaitlist(game.id, accept, token || "");
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
      const body = await gamesApi.leave(game.id, token || "");
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
        // `game.date` can be in either DD/MM/YYYY (the initial SSR fetch, see games/[id]/page.tsx)
        // or ISO YYYY-MM-DD (normalizeIncomingGame, used for optimistic join/leave updates and
        // socket "game:updated" pushes -- see next_app/src/utils/timezone.ts). Without this guard,
        // a join/leave briefly renders the raw ISO string until a subsequent refetch overwrites it
        // with the SSR-formatted value. Same defensive pattern already used in GamesByDateClient /
        // GamesByCityClient / GamesByFriendsClient / MyJoinedGames for this exact ambiguity.
        date={game.date && game.date.includes('-') ? game.date.split('-').reverse().join('/') : game.date}
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
        fullWidth
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

      <Grid container spacing={{ xs: 3, md: 4 }} mt={0.5}>
        <Grid size={{ xs: 12, md: 7 }}>
          <TeamBuilderWrapper
            gameId={game.id}
            participants={game.participants}
            organizerId={game.organizerId}
            initialManagers={game.managers || []}
            maxPlayers={game.maxPlayers}
            currentUserId={viewerId}
            initialTeams={game.teams || []}
            lotteryData={{
              enabled: !!game.lotteryEnabled,
              pending: !!game.lotteryPending,
              overbooked: !!game.overbooked,
              at: game.lotteryAt || null,
              signups: game.totalSignups || 0,
            }}
            waitlistParticipants={game.waitlistParticipants || []}
            pickSessionStatus={game.pickSessionStatus || null}
          />
          {joined && <GameRatingsPanel gameId={game.id} />}
        </Grid>

        {joined ? (
          <Grid size={{ xs: 12, md: 5 }}>
            <Card
              elevation={0}
              sx={{
                height: "100%",
                minHeight: 400,
                border: "1px solid",
                borderColor: "rgba(148,163,184,0.16)",
                boxShadow: "inset 0 1px 0 0 rgba(255,255,255,0.06), 0 1px 3px rgba(15,23,42,0.06)",
              }}
            >
              <Box p={{ xs: 2.5, md: 3 }} height="100%">
                <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em" }}>
                  צ&apos;אט המשחק
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  שוחחו עם שאר המשתתפים בזמן אמת
                </Typography>
                <Box sx={{ height: 1, borderTop: 1, borderColor: "divider", pt: 2 }}>
                  <Chat roomId={game.chatRoomId || game.id} chatName={game.title || "Game Chat"} hideHeaderName />
                </Box>
              </Box>
            </Card>
          </Grid>
        ) : null}
      </Grid>
    </>
  );
}
