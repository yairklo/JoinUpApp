import GameLiveSection from "@/components/GameLiveSection";
import { auth } from "@clerk/nextjs/server";
import GameActions from "@/components/GameActions";
import SeriesManager from "@/components/SeriesManager";
import GameDetailsEditor from "@/components/GameDetailsEditor";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";

// MUI Imports
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Divider from "@mui/material/Divider";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; name?: string; avatar?: string; role?: string };
type Team = { id: string; name: string; color: string; playerIds: string[] };

type Game = {
  id: string;
  seriesId: string | null;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  start: string;
  date: string;
  time: string;
  duration?: number;
  description: string;
  welcomeMessage?: string;
  maxPlayers: number;
  currentPlayers: number;
  participants: Participant[];
  fieldLat?: number | null;
  fieldLng?: number | null;
  lotteryEnabled?: boolean;
  lotteryAt?: string | null;
  lotteryPending?: boolean;
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
  joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | null;
  waitlistOfferPending?: boolean;
  teamSize?: number | null;
  price?: number | null;
  chatRoomId?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchGame(id: string, token?: string | null): Promise<Game | null> {
  try {
    const res = await fetch(`${API_BASE}/api/games/${id}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const game = await res.json();
    if (game && game.start) {
      // Display format is DD/MM/YYYY across the app (see GamesByCityClient, GamesByDateClient,
      // search/page, MyJoinedGames) -- formatJerusalemDate itself returns ISO (YYYY-MM-DD).
      const isoDate = formatJerusalemDate(game.start);
      game.date = isoDate.split('-').reverse().join('/');
      game.time = formatJerusalemTime(game.start);
    }
    return game;
  } catch (e) {
    return null;
  }
}

export default async function GameDetails(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { getToken, userId: authUserId } = await auth();
  const token = await getToken().catch(() => null);
  const game = await fetchGame(id, token);
  const userId = authUserId || "";

  if (!game) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">המשחק לא נמצא</Alert>
      </Container>
    );
  }

  const headerCount =
    (game.lotteryEnabled && game.lotteryPending
      ? game.totalSignups ?? game.currentPlayers
      : game.currentPlayers) || 0;

  const isOrganizer = game.organizerId === userId;
  const isManager = (game.managers || []).some((m) => m.id === userId && (m.role === 'MANAGER' || m.role === 'MODERATOR'));
  const canManageSeries = isOrganizer || isManager;

  return (
    <main>
      <Container maxWidth="lg" sx={{ py: { xs: 2.5, md: 4 }, px: { xs: 2, sm: 3 } }}>
        {/* Header Section */}
        <Box mb={4}>
          <GameLiveSection
            initialGame={{
              id: game.id,
              time: game.time,
              date: game.date,
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
              lotteryEnabled: game.lotteryEnabled,
              lotteryPending: game.lotteryPending,
              totalSignups: game.totalSignups,
              organizerId: game.organizerId,
              chatRoomId: game.chatRoomId,
              overbooked: game.overbooked,
              lotteryAt: game.lotteryAt,
              managers: game.managers,
              teams: game.teams,
              waitlistParticipants: game.waitlistParticipants,
              pickSessionStatus: (game as { pickSessionStatus?: string }).pickSessionStatus,
              fieldId: game.fieldId,
            }}
            viewerId={userId}
            canManageSeries={canManageSeries}
          />

          <Box mt={2}>
            <GameActions
              gameId={game.id}
              fieldName={game.fieldName}
              lat={game.fieldLat ?? null}
              lng={game.fieldLng ?? null}
            />

            <GameDetailsEditor
              gameId={game.id}
              initialTime={game.time}
              initialDate={game.date}
              initialMaxPlayers={game.maxPlayers}
              initialSport={game.sport}
              initialRegistrationOpensAt={game.registrationOpensAt}
              initialFriendsOnlyUntil={game.friendsOnlyUntil}
              initialIsFriendsOnly={!!game.isFriendsOnly}
              initialJoinPolicy={game.joinPolicy}
              initialTitle={game.title}
              initialTeamSize={game.teamSize}
              initialPrice={game.price}
              initialDuration={game.duration}
              initialDescription={game.description}
              initialWelcomeMessage={game.welcomeMessage}
              initialFieldId={game.fieldId}
              initialFieldName={game.fieldName}
              initialFieldLocation={game.fieldLocation}
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
          </Box>
        </Box>

      </Container>
    </main>
  );
}