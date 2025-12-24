import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import Link from "next/link";
import LeaveGameButton from "@/components/LeaveGameButton";
import JoinGameButton from "@/components/JoinGameButton";
import GameHeaderCard from "@/components/GameHeaderCard";
import { currentUser } from "@clerk/nextjs/server";
import GameActions from "@/components/GameActions";
import GameParticipantsList from "@/components/GameParticipantsList";
import TeamBuilderWrapper from "@/components/TeamBuilderWrapper";

// MUI Imports
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid"; // Using Grid2 for 'size' prop support
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import AccessTimeIcon from "@mui/icons-material/AccessTime";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; name?: string; avatar?: string; role?: string };

type Game = {
  id: string;
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

  return (
    <main>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Header Section */}
        <Box mb={4}>
          <GameHeaderCard
            time={game.time}
            durationHours={game.duration ?? 1}
            title={game.fieldName}
            currentPlayers={headerCount}
            maxPlayers={game.maxPlayers}
          >
            {joined ? (
              <LeaveGameButton gameId={game.id} />
            ) : (
              <JoinGameButton gameId={game.id} />
            )}
          </GameHeaderCard>

          <Box mt={2}>
            <GameActions
              gameId={game.id}
              fieldName={game.fieldName}
              lat={game.fieldLat ?? null}
              lng={game.fieldLng ?? null}
            />
          </Box>
        </Box>

        {/* Main Grid Layout - Corrected usage with 'size' prop */}
        <Grid container spacing={3}>
          
          {/* Left Column: Participants & Team Builder */}
          <TeamBuilderWrapper 
            gameId={game.id}
            participants={game.participants}
            organizerId={game.organizerId}
            initialManagers={game.managers || []}
            maxPlayers={game.maxPlayers}
            currentUserId={userId}
            lotteryData={{
                enabled: !!game.lotteryEnabled,
                pending: !!game.lotteryPending,
                overbooked: !!game.overbooked,
                at: game.lotteryAt || null,
                signups: game.totalSignups || 0
            }}
            waitlistParticipants={game.waitlistParticipants || []}
          />

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