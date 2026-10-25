"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import NextLink from "next/link";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SportsEsportsRoundedIcon from "@mui/icons-material/SportsEsportsRounded";
import HowToRegRoundedIcon from "@mui/icons-material/HowToRegRounded";
import ChatBubbleRoundedIcon from "@mui/icons-material/ChatBubbleRounded";
import GameHero from "@/components/GameHero";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import PendingJoinRequests from "@/components/PendingJoinRequests";
import TeamBuilderWrapper from "@/components/TeamBuilderWrapper";
import GameRatingsPanel from "@/components/GameRatingsPanel";
import GameResultSection from "@/components/gameResult/GameResultSection";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import Chat from "@/components/Chat";
import { useSocket } from "@/context/SocketContext";
import { canLeaveGame } from "@/utils/leaveGame";
import { getGameVisibility } from "@/utils/gameStatus";
import { normalizeIncomingGame } from "@/utils/timezone";
import { gamesApi } from "@/services/api/games";
import { useAuth } from "@clerk/nextjs";
import { lotteryViewerCopy, resolveNotSelectedJoinLabel } from "@joinup/shared/gameViewerCopy";

type Participant = { id: string; name: string | null; avatar?: string | null };

const adminPillSx = {
  flexShrink: 0,
  borderRadius: 999,
  px: 1.5,
  fontWeight: 800,
  whiteSpace: "nowrap",
  color: "#fff",
  bgcolor: "rgba(255,255,255,0.1)",
  "&:hover": { bgcolor: "rgba(255,255,255,0.18)" },
  "& .MuiButton-startIcon": { marginInlineStart: 0, marginInlineEnd: "6px" },
} as const;
type Manager = { id: string; name?: string; avatar?: string; role?: string };
type Team = { id: string; name: string; color: string; playerIds: string[] };

export type LiveGame = {
  id: string;
  time: string;
  date?: string;
  start?: string;
  duration?: number;
  title?: string | null;
  fieldId?: string;
  seriesId?: string | null;
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
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | "NOT_SELECTED" | null;
  waitlistOfferPending?: boolean;
  viewerJoinRequiresApproval?: boolean;
  lotteryEnabled?: boolean;
  lotteryPending?: boolean;
  lotteryExecutedAt?: string | null;
  organizerInLottery?: boolean;
  membersOnlyPriority?: boolean;
  guestRegistrationOpensAt?: string | null;
  viewerIsInsider?: boolean;
  totalSignups?: number;
  organizerId: string;
  chatRoomId?: string;
  overbooked?: boolean;
  lotteryAt?: string | null;
  managers?: Manager[];
  teams?: Team[];
  waitlistParticipants?: Participant[];
  pickSessionStatus?: string | null;
  status?: "OPEN" | "COMPLETED" | "CANCELLED";
  /** Game, series or field photo for the hero (resolved by the page). */
  coverImage?: string | null;
  /** Join requests awaiting a manager decision (REQUIRES_APPROVAL games). */
  pendingRequestCount?: number;
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
    initialGame.lotteryEnabled,
    initialGame.coverImage
  ]);

  const { getToken } = useAuth();
  const [waitlistActionLoading, setWaitlistActionLoading] = useState(false);
  const [waitlistError, setWaitlistError] = useState<string | null>(null);

  // The server-rendered `initialGame` can be stale: coming back from another page of the game
  // (e.g. team management) via back/forward restores the cached render from when this page was
  // first opened, and any `game:updated` broadcast that fired while this component was unmounted
  // was missed. So re-read the full game (participants, counts, viewer status) whenever the section
  // mounts, the tab becomes visible again, the page is restored from the back/forward cache, or
  // the socket reconnects -- instead of trusting the partial in-memory state until a leave/rejoin.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const refreshInFlight = useRef(false);
  const lastPushAt = useRef(0);
  const hiddenAt = useRef(0);
  const refreshFromServer = useCallback(async () => {
    // Triggers overlap (mount + socket connect + visibility): one request at a time is enough.
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const startedAt = Date.now();
    try {
      const token = await getTokenRef.current().catch(() => "");
      const fresh = await gamesApi.getById(initialGame.id, token || undefined);
      // A socket push that arrived while this request was in flight is newer than the response.
      if (lastPushAt.current > startedAt) return;
      if (fresh && fresh.id === initialGame.id) {
        setGame((prev) => ({ ...prev, ...normalizeIncomingGame(fresh as unknown as LiveGame) }));
      }
    } catch {
      // Keep whatever we already show; the next trigger will retry.
    } finally {
      refreshInFlight.current = false;
    }
  }, [initialGame.id]);

  useEffect(() => {
    void refreshFromServer();
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) void refreshFromServer();
    };
    // Only refresh after the tab was really away: a quick tab flick is covered by the live socket.
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
      } else if (hiddenAt.current && Date.now() - hiddenAt.current > 15_000) {
        void refreshFromServer();
      }
    };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    socket?.on("connect", refreshFromServer);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
      socket?.off("connect", refreshFromServer);
    };
  }, [refreshFromServer, socket]);

  useEffect(() => {
    if (!socket) return;
    const handler = (updated: LiveGame) => {
      if (updated?.id === initialGame.id) {
        lastPushAt.current = Date.now();
        setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
      }
    };
    socket.on("game:updated", handler);
    return () => {
      socket.off("game:updated", handler);
    };
  }, [socket, initialGame.id]);

  const mergeAndSet = (updated?: any) => {
    // A join/leave/waitlist result is newer than any refresh that started before it.
    if (updated) lastPushAt.current = Date.now();
    if (updated) setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
  };

  // "נהל משחק" jumps to the management panel already on this same page rather than navigating
  // anywhere -- the button alone reads as a dead click, so pair the jump with a brief highlight
  // on the target so cause and effect are unambiguous.
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    el.style.transition = "box-shadow 0.3s ease";
    el.style.boxShadow = "0 0 0 3px var(--mui-palette-primary-main, #059669)";
    window.setTimeout(() => {
      el.style.boxShadow = "";
    }, 1400);
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
  // lotteryExecutedAt === null is the server saying the draw has not run. Undefined means
  // this payload did not include the field (do not hide real free seats).
  const drawInProgress = !!game.lotteryEnabled
    && game.lotteryExecutedAt === null
    && !!game.lotteryAt
    && game.lotteryPending === false;
  const headerCount =
    (game.lotteryEnabled && (game.lotteryPending || drawInProgress)
      ? game.totalSignups ?? game.currentPlayers
      : game.currentPlayers) || 0;

  const { finished, showJoinCtas } = getGameVisibility(game);
  const isWaitlistOfferPending = game.waitlistOfferPending === true && !finished;
  const isWaitlisted = game.viewerParticipationStatus === "WAITLISTED" && !finished;
  const lotteryCopy = lotteryViewerCopy({
    lotteryEnabled: game.lotteryEnabled,
    lotteryPending: game.lotteryPending,
    lotteryExecutedAt: game.lotteryExecutedAt,
    lotteryAt: game.lotteryAt,
    viewerParticipationStatus: game.viewerParticipationStatus,
    // `participants` is the confirmed roster. `currentPlayers` is sometimes the
    // pre-draw signup total (the page header), which would hide free seats.
    seatsFree: (game.participants?.length || 0) < (game.maxPlayers || 0),
    viewerIsOrganizer: !!viewerId && viewerId === game.organizerId,
    organizerInLottery: game.organizerInLottery,
  });
  const isLotteryPool = lotteryCopy?.kind === "pool" && !finished;
  const isLotteryDrawing = lotteryCopy?.kind === "drawing" && !finished;
  const notSelectedJoinLabel = resolveNotSelectedJoinLabel(lotteryCopy, {
    requiresApproval: !!game.viewerJoinRequiresApproval,
  });

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

      {/* ── Lottery pool: this banner is what a WAITLISTED member sees while the draw is pending. ── */}
      {isLotteryPool && lotteryCopy && !isWaitlistOfferPending && (
        <Alert
          severity="info"
          dir="rtl"
          data-testid="lottery-pool-banner"
          sx={{
            mb: 2,
            borderRadius: 2,
            "& .MuiAlert-message": { width: "100%" },
          }}
        >
          <AlertTitle sx={{ fontWeight: "bold" }}>{lotteryCopy.title}</AlertTitle>
          {lotteryCopy.detail && (
            <Typography variant="body2" mb={1.5}>
              {lotteryCopy.detail}
            </Typography>
          )}
          {waitlistError && (
            <Typography variant="caption" color="error" display="block" mb={1}>
              {waitlistError}
            </Typography>
          )}
          <Button
            variant="outlined"
            color="error"
            size="small"
            disabled={waitlistActionLoading}
            onClick={leaveWaitlist}
            data-testid="lottery-cancel"
          >
            {lotteryCopy.cancelLabel}
          </Button>
        </Alert>
      )}

      {isLotteryDrawing && lotteryCopy && !isWaitlistOfferPending && (
        <Alert
          severity="info"
          dir="rtl"
          data-testid="lottery-drawing-banner"
          sx={{
            mb: 2,
            borderRadius: 2,
            "& .MuiAlert-message": { width: "100%" },
          }}
        >
          <AlertTitle sx={{ fontWeight: "bold", mb: 0 }}>{lotteryCopy.title}</AlertTitle>
        </Alert>
      )}

      {lotteryCopy?.kind === "not_selected" && !finished && (
        <Alert
          severity="warning"
          dir="rtl"
          data-testid="lottery-not-selected-banner"
          sx={{
            mb: 2,
            borderRadius: 2,
            "& .MuiAlert-message": { width: "100%" },
          }}
        >
          <AlertTitle sx={{ fontWeight: "bold" }}>{lotteryCopy.title}</AlertTitle>
          {showJoinCtas && lotteryCopy.detail && (
            <Typography variant="body2">{lotteryCopy.detail}</Typography>
          )}
        </Alert>
      )}

      {lotteryCopy?.kind === "selected" && !finished && (
        <Alert
          severity="success"
          dir="rtl"
          data-testid="lottery-selected-banner"
          sx={{ mb: 2, borderRadius: 2 }}
        >
          <AlertTitle sx={{ fontWeight: "bold", mb: 0 }}>{lotteryCopy.title}</AlertTitle>
        </Alert>
      )}

      {/* ── Waitlist Status Banner (user waiting, no active offer yet) ── */}
      {isWaitlisted && !isWaitlistOfferPending && !isLotteryPool && !isLotteryDrawing && (
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
          {waitlistError && (
            <Typography variant="caption" color="error" display="block" mb={1}>
              {waitlistError}
            </Typography>
          )}
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

      {game.status === "CANCELLED" && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>המשחק בוטל</AlertTitle>
          המארגן ביטל את המשחק, ולכן לא ניתן להצטרף אליו.
        </Alert>
      )}

      <GameHero
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
        fieldHref={game.fieldId ? `/fields/${game.fieldId}` : undefined}
        seriesHref={game.seriesId ? `/series/${game.seriesId}` : undefined}
        finished={finished}
        currentPlayers={headerCount}
        maxPlayers={game.maxPlayers}
        sport={game.sport}
        teamSize={game.teamSize}
        price={game.price}
        coverImage={game.coverImage}
        viewerState={
          joined
            ? "joined"
            : isLotteryDrawing
              ? "drawing"
              : isLotteryPool
                ? "lottery"
                : isWaitlisted || isWaitlistOfferPending
                  ? "waitlisted"
                  : game.viewerParticipationStatus === "PENDING"
                    ? "pending"
                    : null
        }
      >
        {!showJoinCtas ? null : !viewerId ? (
          // Signed-out guest: joining needs an account, so the CTA goes to sign-in and back here.
          <Button
            component={NextLink}
            href={`/sign-in?redirect_url=/games/${game.id}`}
            variant="contained"
            fullWidth
            data-testid="guest-join-cta"
            sx={{ fontWeight: 800, borderRadius: 999 }}
          >
            הצטרף
          </Button>
        ) : joined ? (
          canLeaveGame(game, viewerId) ? (
          <LeaveGameButton
            gameId={game.id}
            currentPlayers={game.participants?.length || 0}
            onLeft={mergeAndSet}
            alwaysConfirm
            leaveLabel="בטל השתתפות"
          />
          ) : null
        ) : !isWaitlistOfferPending && !isWaitlisted ? (
          <JoinGameButton
            gameId={game.id}
            registrationOpensAt={game.registrationOpensAt}
            joinPolicy={game.joinPolicy}
            viewerParticipationStatus={game.viewerParticipationStatus}
            waitlistOfferPending={game.waitlistOfferPending}
            lotteryEnabled={!!game.lotteryEnabled}
            lotteryPending={!!game.lotteryPending}
            lotteryExecutedAt={game.lotteryExecutedAt}
            lotteryAt={game.lotteryAt}
            guestRegistrationOpensAt={game.guestRegistrationOpensAt}
            viewerIsInsider={game.viewerIsInsider}
            joinLabel={notSelectedJoinLabel}
            onJoined={mergeAndSet}
            onRequestSent={mergeAndSet}
          />
        ) : null}
      </GameHero>

      {canManageSeries && (
        <Box
          dir="rtl"
          sx={(t) => ({
            mt: 2,
            p: 1,
            pr: 1.5,
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            gap: 1,
            color: "#fff",
            bgcolor: t.palette.mode === "dark" ? alpha("#fff", 0.06) : "#0f172a",
            border: "1px solid",
            borderColor: t.palette.mode === "dark" ? alpha("#fff", 0.1) : "transparent",
            boxShadow: t.palette.mode === "dark" ? "none" : "0 12px 28px -16px rgba(15,23,42,0.6)",
          })}
        >
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0, color: "#fbbf24" }}>
            <AdminPanelSettingsRoundedIcon fontSize="small" />
            <Typography variant="caption" fontWeight={900} sx={{ display: { xs: "none", sm: "block" } }}>
              מצב מנהל
            </Typography>
          </Stack>
          <Stack
            direction="row"
            spacing={0.75}
            sx={{ flex: 1, minWidth: 0, overflowX: "auto", scrollbarWidth: "none", "&::-webkit-scrollbar": { display: "none" } }}
          >
            <Button size="small" startIcon={<EditRoundedIcon />} onClick={() => scrollToSection("game-manage")} sx={adminPillSx}>
              עריכת פרטים
            </Button>
            <Button
              size="small"
              component={NextLink}
              href={`/games/${game.id}/team-management`}
              startIcon={<SportsEsportsRoundedIcon />}
              sx={adminPillSx}
            >
              ניהול קבוצות
            </Button>
            {(game.pendingRequestCount ?? 0) > 0 && (
              <Button
                size="small"
                startIcon={<HowToRegRoundedIcon />}
                onClick={() => scrollToSection("game-requests")}
                sx={{ ...adminPillSx, bgcolor: "#fbbf24", color: "#1f1300", "&:hover": { bgcolor: "#f59e0b" } }}
              >
                בקשות ({game.pendingRequestCount})
              </Button>
            )}
          </Stack>
        </Box>
      )}

      {canManageSeries && (
        <Box mt={2} id="game-requests">
          <PendingJoinRequests
            gameId={game.id}
            onDecision={mergeAndSet}
            lotteryEnabled={game.lotteryEnabled}
            lotteryPending={game.lotteryPending}
            lotteryExecutedAt={game.lotteryExecutedAt}
            lotteryAt={game.lotteryAt}
          />
        </Box>
      )}

      <Box mt={2}>
        <SectionErrorBoundary label="תוצאת המשחק">
          <GameResultSection
            gameId={game.id}
            sport={game.sport}
            gameTitle={game.title || game.fieldName}
            gameDate={game.date && game.date.includes("-") ? game.date.split("-").reverse().join("/") : game.date}
            teams={game.teams || []}
            viewerId={viewerId}
            viewerParticipationStatus={game.viewerParticipationStatus}
          />
        </SectionErrorBoundary>
      </Box>

      <Grid container spacing={{ xs: 3, md: 4 }} mt={0.5}>
        <Grid size={{ xs: 12, md: joined ? 7 : 12 }}>
          <TeamBuilderWrapper
            gameId={game.id}
            participants={game.participants}
            organizerId={game.organizerId}
            initialManagers={game.managers || []}
            finished={finished}
            maxPlayers={game.maxPlayers}
            confirmedCount={drawInProgress ? (game.totalSignups ?? game.currentPlayers) : game.currentPlayers}
            currentUserId={viewerId}
            initialTeams={game.teams || []}
            lotteryData={{
              enabled: !!game.lotteryEnabled,
              pending: !!game.lotteryPending,
              overbooked: !!game.overbooked,
              at: game.lotteryAt || null,
              executedAt: game.lotteryExecutedAt,
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
                // Bounded independently of the left column's content height (participants
                // list can grow arbitrarily long) -- without a cap here, a long roster
                // stretches this card to match via the Grid row's default stretch
                // alignment, pushing the message input far below the fold.
                height: { xs: "min(75vh, 560px)", md: "min(100%, 640px)" },
                minHeight: 400,
                display: "flex",
                flexDirection: "column",
                borderRadius: 5,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="center" p={{ xs: 2, md: 2.5 }} sx={{ flexShrink: 0 }}>
                <Box
                  sx={(t) => ({
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    color: "primary.main",
                    bgcolor: alpha(t.palette.primary.main, 0.1),
                  })}
                >
                  <ChatBubbleRoundedIcon fontSize="small" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={0.75} alignItems="center">
                    <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                      צ&apos;אט המשחק
                    </Typography>
                    <Box
                      aria-hidden
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        bgcolor: "success.main",
                        boxShadow: (t) => `0 0 0 3px ${alpha(t.palette.success.main, 0.2)}`,
                      }}
                    />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    שוחחו עם שאר השחקנים בזמן אמת
                  </Typography>
                </Box>
              </Stack>
              <Box sx={{ flex: 1, minHeight: 0, borderTop: 1, borderColor: "divider" }}>
                <Chat roomId={game.chatRoomId || game.id} chatName={game.title || "Game Chat"} hideHeaderName />
              </Box>
            </Card>
          </Grid>
        ) : null}
      </Grid>
    </>
  );
}
