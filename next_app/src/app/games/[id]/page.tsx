import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import Link from "next/link";
import LeaveGameButton from "@/components/LeaveGameButton";
import JoinGameButton from "@/components/JoinGameButton";
import GameHeaderCard from "@/components/GameHeaderCard";
import { currentUser } from "@clerk/nextjs/server";
import GameActions from "@/components/GameActions";

// MUI Imports
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid"; // השימוש הנכון שמצאנו
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import ListItemButton from "@mui/material/ListItemButton"; // כדי שהשורה תהיה לחיצה
import AvatarGroup from "@mui/material/AvatarGroup";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import PersonIcon from '@mui/icons-material/Person';
import AccessTimeIcon from '@mui/icons-material/AccessTime';

type Participant = { id: string; name: string | null; avatar?: string | null };
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
    return <Container sx={{ py: 4 }}><Alert severity="error">Game not found</Alert></Container>;
  }

  const headerCount =
    (game.lotteryEnabled && game.lotteryPending
      ? (game.totalSignups ?? game.currentPlayers)
      : game.currentPlayers) || 0;

  return (
    <main>
      <Container maxWidth="lg" sx={{ py: 4 }}>
        
        {/* חלק עליון - כרגע נשאיר את הקומפוננטות שלך, נעטוף רק במרווח */}
        <Box mb={4}>
            <GameHeaderCard
            time={game.time}
            durationHours={game.duration ?? 1}
            title={game.fieldName}
            currentPlayers={headerCount}
            maxPlayers={game.maxPlayers}
            >
            {joined ? <LeaveGameButton gameId={game.id} /> : <JoinGameButton gameId={game.id} />}
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

        {/* Main Grid Layout */}
        <Grid container spacing={3}>
          
          {/* Left Column: Participants (החלק המשודרג) */}
          <Grid size={{ xs: 12, md: 7 }}>
            <Card elevation={2}>
              <CardContent>
                
                {/* 1. Lottery Warning Banner */}
                {game.lotteryEnabled && game.lotteryPending && game.overbooked && (
                  <Alert severity="warning" icon={<AccessTimeIcon />} sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" fontWeight="bold">
                        Lottery Pending
                    </Typography>
                    <Typography variant="body2">
                        Draw at: {game.lotteryAt ? new Date(game.lotteryAt).toLocaleString() : "—"}
                    </Typography>
                    <Typography variant="caption">
                        Registered: {game.totalSignups ?? 0} (Max: {game.maxPlayers})
                    </Typography>
                  </Alert>
                )}

                {/* 2. Header & Avatar Group Summary */}
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={2}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">Participants</Typography>
                        <Typography variant="body2" color="text.secondary">
                            {game.participants.length} / {game.maxPlayers} confirmed
                        </Typography>
                    </Box>
                    
                    {/* Avatar Group - Quick visual summary */}
                    {game.participants.length > 0 && (
                        <AvatarGroup max={5} sx={{ '& .MuiAvatar-root': { width: 32, height: 32, fontSize: 14 } }}>
                            {game.participants.map(p => (
                                // שים לב: AvatarGroup של MUI מצפה ל-div/img עם alt ו-src, 
                                // אבל הקומפוננטה שלך מחזירה מבנה מורכב. 
                                // עדיף פה להשתמש ב-Avatar של הקומפוננטה שלך בתוך div פשוט
                                <div key={p.id}>
                                    <Avatar src={p.avatar} alt={p.name || "?"} name={p.name || "?"} size="sm" />
                                </div>
                            ))}
                        </AvatarGroup>
                    )}
                </Box>

                <Divider sx={{ mb: 2 }} />

                {/* 3. Main Participants List */}
                {game.participants.length > 0 ? (
                    <List disablePadding>
                        {game.participants.map((p) => (
                            <Link key={p.id} href={`/users/${p.id}`} passHref legacyBehavior>
                                <ListItemButton component="a" sx={{ borderRadius: 2, mb: 0.5 }}>
                                    <ListItemAvatar>
                                        <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="md" />
                                    </ListItemAvatar>
                                    <ListItemText 
                                        primary={p.name || "Unknown User"} 
                                        primaryTypographyProps={{ fontWeight: 500 }}
                                    />
                                    <Chip 
                                        label="Player" 
                                        size="small" 
                                        color="success" 
                                        variant="outlined" 
                                        icon={<PersonIcon />} 
                                    />
                                </ListItemButton>
                            </Link>
                        ))}
                    </List>
                ) : (
                    <Typography variant="body2" color="text.secondary" align="center" py={4}>
                        No participants yet. Be the first to join!
                    </Typography>
                )}

                {/* 4. Waitlist Section (Conditional) */}
                {game.lotteryEnabled && game.lotteryPending && game.overbooked && (game.waitlistParticipants?.length || 0) > 0 && (
                    <Box mt={4}>
                        <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="warning.main">
                            Waitlist / Lottery Pool
                        </Typography>
                        <List disablePadding>
                            {(game.waitlistParticipants || []).map((p) => (
                                <Link key={p.id} href={`/users/${p.id}`} passHref legacyBehavior>
                                    <ListItemButton component="a" sx={{ borderRadius: 2 }}>
                                        <ListItemAvatar>
                                            <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="sm" />
                                        </ListItemAvatar>
                                        <ListItemText 
                                            primary={p.name || p.id} 
                                            secondary="Waiting for lottery"
                                        />
                                        <Chip label="Waitlist" size="small" color="warning" variant="outlined" />
                                    </ListItemButton>
                                </Link>
                            ))}
                        </List>
                    </Box>
                )}

              </CardContent>
            </Card>
          </Grid>

          {/* Right Column: Chat (visible only to participants) */}
          {joined ? (
            <Grid size={{ xs: 12, md: 5 }}>
              <Card elevation={2} sx={{ height: '100%', minHeight: 400 }}>
                  <Box p={2} height="100%">
                      <Typography variant="h6" gutterBottom>Chat</Typography>
                      <Divider sx={{ mb: 2 }} />
                      <Chat roomId={game.id} />
                  </Box>
              </Card>
            </Grid>
          ) : null}

        </Grid>
      </Container>
    </main>
  );
}