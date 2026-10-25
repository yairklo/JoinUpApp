import GameLiveSection from "@/components/GameLiveSection";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import GameActions from "@/components/GameActions";
import GuestJoinBar from "@/components/GuestJoinBar";
import SectionErrorBoundary from "@/components/SectionErrorBoundary";
import CancelGameButton from "@/components/CancelGameButton";
import SeriesManager from "@/components/SeriesManager";
import GameDetailsEditor from "@/components/GameDetailsEditor";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";
import { formatHebrewWhen } from "@joinup/shared/gameViewerCopy";
import type { FriendsOnlyLinkPolicy } from "@/types/game";
import { isGameFinished } from "@/utils/gameStatus";

// MUI Imports
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import GameManagePanel from "@/components/GameManagePanel";
import Link from "next/link";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; name?: string; avatar?: string; role?: string };
type Team = { id: string; name: string; color: string; playerIds: string[] };

type Game = {
  id: string;
  seriesId: string | null;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  imageUrl?: string | null;
  seriesImageUrl?: string | null;
  fieldImage?: string | null;
  start: string;
  date: string;
  time: string;
  duration?: number;
  description: string;
  welcomeMessage?: string;
  membersOnlyPriority?: boolean;
  guestRegistrationOpensAt?: string | null;
  guestWelcomeMessage?: string | null;
  guestDescription?: string | null;
  guestPrice?: number | null;
  /** Present on members-priority games: the viewer is an insider (member/organizer/manager). */
  viewerIsInsider?: boolean;
  maxPlayers: number;
  currentPlayers: number;
  participants: Participant[];
  fieldLat?: number | null;
  fieldLng?: number | null;
  customLat?: number | null;
  customLng?: number | null;
  customLocation?: string | null;
  lotteryEnabled?: boolean;
  lotteryAt?: string | null;
  lotteryExecutedAt?: string | null;
  lotteryPending?: boolean;
  organizerInLottery?: boolean;
  overbooked?: boolean;
  totalSignups?: number;
  waitlistCount?: number;
  waitlistParticipants?: Participant[];
  organizerId: string;
  managers: Manager[];
  teams: Team[];
  sport?: string;
  registrationOpensAt?: string | null;
  title?: string | null;
  friendsOnlyUntil?: string | null;
  isFriendsOnly?: boolean;
  friendsOnlyLinkPolicy?: FriendsOnlyLinkPolicy;
  viewerJoinRequiresApproval?: boolean;
  joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | "NOT_SELECTED" | null;
  waitlistOfferPending?: boolean;
  teamSize?: number | null;
  price?: number | null;
  chatRoomId?: string;
  pendingRequestCount?: number;
  status?: "OPEN" | "COMPLETED" | "CANCELLED";
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type FetchGameResult = { game: Game } | { friendsOnly: true } | null;

async function fetchGame(id: string, token?: string | null): Promise<FetchGameResult> {
  try {
    const res = await fetch(`${API_BASE}/api/games/${id}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (res.status === 403) {
      // A friends-only game whose link is blocked for this viewer.
      const body = await res.json().catch(() => ({}));
      return body?.code === "GAME_FRIENDS_ONLY" ? { friendsOnly: true } : null;
    }
    if (!res.ok) return null;
    const game = await res.json();
    if (game && game.start) {
      // Display format is DD/MM/YYYY across the app (see GamesByCityClient, GamesByDateClient,
      // search/page, MyJoinedGames) -- formatJerusalemDate itself returns ISO (YYYY-MM-DD).
      const isoDate = formatJerusalemDate(game.start);
      game.date = isoDate.split('-').reverse().join('/');
      game.time = formatJerusalemTime(game.start);
    }
    return { game };
  } catch (e) {
    return null;
  }
}

export default async function GameDetails(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { getToken, userId: authUserId } = await auth();
  // Game details (roster, location) are for signed-in users only.
  if (!authUserId) redirect(`/sign-in?redirect_url=/games/${id}`);
  const token = await getToken().catch(() => null);
  const result = await fetchGame(id, token);
  const userId = authUserId || "";

  if (result && "friendsOnly" in result) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="info" data-testid="game-friends-only">
          המשחק הזה פתוח לחברים של המארגן בלבד.
          {!userId && " אם אתה חבר של המארגן, התחבר כדי לראות אותו."}
        </Alert>
      </Container>
    );
  }

  const game = result?.game;
  if (!game) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">המשחק לא נמצא</Alert>
      </Container>
    );
  }

  const drawInProgress = !!game.lotteryEnabled
    && game.lotteryExecutedAt === null
    && !!game.lotteryAt
    && game.lotteryPending === false;
  const headerCount =
    (game.lotteryEnabled && (game.lotteryPending || drawInProgress)
      ? game.totalSignups ?? game.currentPlayers
      : game.currentPlayers) || 0;

  const isOrganizer = game.organizerId === userId;
  const isManager = (game.managers || []).some((m) => m.id === userId && (m.role === 'MANAGER' || m.role === 'MODERATOR'));
  const canManageSeries = isOrganizer || isManager;
  // Only joined players get the side-by-side roster + chat layout; everyone else sees a single
  // column, so a narrower container keeps the hero and roster from stretching across the page.
  const viewerJoined = !!userId && (game.participants || []).some((p) => p.id === userId);

  return (
    <main>
      <Container
        maxWidth={viewerJoined ? "lg" : "md"}
        sx={{
          py: { xs: 2.5, md: 4 },
          px: { xs: 2, sm: 3 },
          pb: !userId
            ? { xs: "calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px) + 80px)", md: 10 }
            : { xs: 2.5, md: 4 },
        }}
      >
        {/* Header Section */}
        <Box mb={4}>
          <SectionErrorBoundary label="פרטי המשחק">
          <GameLiveSection
            initialGame={{
              id: game.id,
              time: game.time,
              date: game.date,
              start: game.start,
              duration: game.duration,
              title: game.title,
              fieldName: game.fieldName,
              fieldLocation: game.fieldLocation,
              currentPlayers: headerCount,
              maxPlayers: game.maxPlayers,
              sport: game.sport,
              teamSize: game.teamSize,
              price: game.price,
              participants: game.participants,
              registrationOpensAt: game.registrationOpensAt,
              joinPolicy: game.joinPolicy,
              viewerParticipationStatus: game.viewerParticipationStatus,
              waitlistOfferPending: game.waitlistOfferPending,
              viewerJoinRequiresApproval: game.viewerJoinRequiresApproval,
              lotteryEnabled: game.lotteryEnabled,
              lotteryPending: game.lotteryPending,
              lotteryExecutedAt: game.lotteryExecutedAt,
              organizerInLottery: game.organizerInLottery,
              membersOnlyPriority: game.membersOnlyPriority,
              guestRegistrationOpensAt: game.guestRegistrationOpensAt,
              viewerIsInsider: game.viewerIsInsider,
              totalSignups: game.totalSignups,
              organizerId: game.organizerId,
              chatRoomId: game.chatRoomId,
              overbooked: game.overbooked,
              lotteryAt: game.lotteryAt,
              managers: game.managers,
              teams: game.teams,
              waitlistParticipants: game.waitlistParticipants,
              pickSessionStatus: (game as { pickSessionStatus?: string }).pickSessionStatus,
              status: game.status,
              fieldId: game.fieldId,
              seriesId: game.seriesId,
              pendingRequestCount: game.pendingRequestCount,
              // Same fallback the feed cards use: the game's own photo, then its group's, then the field's.
              coverImage: game.imageUrl || game.seriesImageUrl || game.fieldImage || null,
            }}
            viewerId={userId}
            canManageSeries={canManageSeries}
          />
          </SectionErrorBoundary>

          {game.membersOnlyPriority && game.viewerIsInsider === false
            && (game.guestDescription || game.guestPrice != null || game.guestRegistrationOpensAt) && (
            <Box mt={2} p={1.5} borderRadius={1} sx={{ bgcolor: "action.hover" }} data-testid="game-guest-info">
              <Typography variant="subtitle2" fontWeight="bold">לאורחים</Typography>
              {game.guestDescription && (
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{game.guestDescription}</Typography>
              )}
              {game.guestPrice != null && (
                <Typography variant="body2">מחיר לאורחים: ₪{game.guestPrice}</Typography>
              )}
              {game.guestRegistrationOpensAt && new Date(game.guestRegistrationOpensAt) > new Date() && (
                <Typography variant="body2">
                  ההרשמה לאורחים נפתחת ב-{formatHebrewWhen(game.guestRegistrationOpensAt) ?? ""}
                </Typography>
              )}
            </Box>
          )}

          <Box mt={2}>
            <SectionErrorBoundary label="ניווט והצגת המגרש">
              <GameActions
                gameId={game.id}
                fieldName={game.fieldName}
                lat={game.fieldLat ?? null}
                lng={game.fieldLng ?? null}
                address={game.fieldLocation}
                customLat={game.customLat ?? null}
                customLng={game.customLng ?? null}
                customLocation={game.customLocation}
              />
            </SectionErrorBoundary>

            {canManageSeries && (
              <GameManagePanel>
                <GameDetailsEditor
                    gameId={game.id}
                    initialTime={game.time}
                    initialDate={game.date}
                    initialMaxPlayers={game.maxPlayers}
                    initialSport={game.sport}
                    initialRegistrationOpensAt={game.registrationOpensAt}
                    initialFriendsOnlyUntil={game.friendsOnlyUntil}
                    initialIsFriendsOnly={!!game.isFriendsOnly}
                    initialFriendsOnlyLinkPolicy={game.friendsOnlyLinkPolicy}
                    initialJoinPolicy={game.joinPolicy}
                    initialTitle={game.title}
                    initialTeamSize={game.teamSize}
                    initialPrice={game.price}
                    initialDuration={game.duration}
                    initialDescription={game.description}
                    initialWelcomeMessage={game.welcomeMessage}
                    isSeriesGame={!!game.seriesId}
                    initialMembersOnlyPriority={game.membersOnlyPriority}
                    initialGuestRegistrationOpensAt={game.guestRegistrationOpensAt}
                    initialGuestWelcomeMessage={game.guestWelcomeMessage}
                    initialGuestDescription={game.guestDescription}
                    initialGuestPrice={game.guestPrice}
                    initialFieldId={game.fieldId}
                    initialFieldName={game.fieldName}
                    initialFieldLocation={game.fieldLocation}
                    initialImageUrl={game.imageUrl}
                    canManage={canManageSeries}
                  />

                  <Divider sx={{ my: 2 }} />

                  <SeriesManager
                    gameId={game.id}
                    seriesId={game.seriesId}
                    canManage={canManageSeries}
                    gameData={{
                      time: game.time,
                      date: game.date
                    }}
                  />

                  {isOrganizer && game.status !== "CANCELLED" && game.status !== "COMPLETED" && (
                    <>
                      <Divider sx={{ my: 2 }} />
                      <CancelGameButton gameId={game.id} isSeriesGame={!!game.seriesId} />
                    </>
                  )}
              </GameManagePanel>
            )}
          </Box>
        </Box>

        {!userId && game.status !== "CANCELLED" && !isGameFinished(game) && <GuestJoinBar />}

      </Container>
    </main>
  );
}