import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import Link from "next/link";
import LeaveGameButton from "@/components/LeaveGameButton";
import JoinGameButton from "@/components/JoinGameButton";
import GameHeaderCard from "@/components/GameHeaderCard";
import { currentUser } from "@clerk/nextjs/server";
import GameActions from "@/components/GameActions";
import TeamBuilderWrapper from "@/components/TeamBuilderWrapper";
import SeriesManager from "@/components/SeriesManager";
import GameDetailsEditor from "@/components/GameDetailsEditor";

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
  teamSize?: number | null;
  price?: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchGame(id: string): Promise<Game | null> {
  try {
    const res = await fetch(`${API_BASE}/api/games/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

export default async function GameDetails(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const game = await fetchGame(id);
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
          <GameHeaderCard
            time={game.time}
            date={game.date}
            durationHours={game.duration ?? 1}
            title={game.title || game.fieldName}
            subtitle={game.title ? `${game.fieldName} • ${game.fieldLocation}` : game.fieldLocation}
            currentPlayers={headerCount}
            maxPlayers={game.maxPlayers}
            sport={game.sport}
            teamSize={game.teamSize}
            price={game.price}
          >
            {joined ? (
              <LeaveGameButton gameId={game.id} />
            ) : (
              <JoinGameButton
                gameId={game.id}
                registrationOpensAt={game.registrationOpensAt}
              />
            )}
          </GameHeaderCard>

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
                    <Chat roomId={game.id} />
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