import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import Link from "next/link";
import GameLiveSection from "@/components/GameLiveSection";
import { auth, currentUser } from "@clerk/nextjs/server";
import GameActions from "@/components/GameActions";
import TeamBuilderWrapper from "@/components/TeamBuilderWrapper";
import SeriesManager from "@/components/SeriesManager";
import GameDetailsEditor from "@/components/GameDetailsEditor";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";

// MUI Imports
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
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
      game.date = formatJerusalemDate(game.start);
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
  const { getToken } = await auth();
  const token = await getToken().catch(() => null);
  const game = await fetchGame(id, token);
  const user = await currentUser();
  const userId = user?.id || "";
  const joined = !!userId && (game?.participants || []).some((p) => p.id === userId);

  if (!game) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">Game not found</Alert>
      </Container>
    );
  }

  const headerCount =
    (game.lotteryEnabled && game.lotteryPending
      ? game.totalSignups ?? game.currentPlayers
      : game.currentPlayers) || 0;

  const isOrganizer = game.organizerId === userId;
  const isManager = (game.managers || []).some((m) => m.id === userId);
  const canManageSeries = isOrganizer || isManager;

  return (
    <main>
      <Container maxWidth="lg" sx={{ py: 4 }}>
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
              lotteryEnabled: game.lotteryEnabled,
              lotteryPending: game.lotteryPending,
              totalSignups: game.totalSignups,
            }}
            viewerId={userId}
            canManageSeries={canManageSeries}
          />

          {game.fieldId && (
            <Box mt={1.5} sx={{ direction: "rtl" }}>
              <Link href={`/fields/${game.fieldId}`} style={{ textDecoration: "none" }}>
                <Typography variant="body2" color="primary" fontWeight={600}>
                  לפרופיל המגרש: לוח משחקים ושעות עומס ←
                </Typography>
              </Link>
            </Box>
          )}

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

        {/* Main Grid Layout */}
        <Grid container spacing={3}>

          {/* Left Column: Participants & Team Builder */}
          <Grid size={{ xs: 12, md: 7 }}>
            <TeamBuilderWrapper
              gameId={game.id}
              participants={game.participants}
              organizerId={game.organizerId}
              initialManagers={game.managers || []}
              maxPlayers={game.maxPlayers}
              currentUserId={userId}
              initialTeams={game.teams || []}
              lotteryData={{
                enabled: !!game.lotteryEnabled,
                pending: !!game.lotteryPending,
                overbooked: !!game.overbooked,
                at: game.lotteryAt || null,
                signups: game.totalSignups || 0
              }}
              waitlistParticipants={game.waitlistParticipants || []}
            />
          </Grid>

          {/* Right Column: Chat */}
          {joined ? (
            <Grid size={{ xs: 12, md: 5 }}>
              <Card elevation={2} sx={{ height: "100%", minHeight: 400 }}>
                <Box p={2} height="100%">
                  <Typography variant="h6" gutterBottom>
                    Chat
                  </Typography>
                  <Box sx={{ height: 1, borderTop: 1, borderColor: 'divider', pt: 2 }}>
                    <Chat roomId={game.chatRoomId || game.id} chatName={game.title || "Game Chat"} />
                  </Box>
                </Box>
              </Card>
            </Grid>
          ) : null}
        </Grid>
      </Container>
    </main>
  );
}