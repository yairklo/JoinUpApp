import Avatar from "@/components/Avatar";
import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import SeriesSubscribeButton from "@/components/SeriesSubscribeButton";
import SeriesSettingsEditor from "@/components/SeriesSettingsEditor";

// MUI Imports
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import ListItemAvatar from "@mui/material/ListItemAvatar";

// Icons
import EventIcon from "@mui/icons-material/Event";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsIcon from "@mui/icons-material/Groups";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type SeriesDetails = {
    id: string;
    title?: string | null;
    fieldName: string;
    fieldLocation: string;
    time: string;
    dayOfWeek: number | null;
    type: 'WEEKLY' | 'CUSTOM';
    autoOpenRegistrationHours: number | null;
    organizer: { id: string; name: string | null; avatar: string | null };
    subscribers: {
        userId: string;
        user: { id: string; name: string | null; avatar: string | null }
    }[];
    upcomingGames: {
        id: string;
        date: string;
        currentPlayers: number;
        maxPlayers: number;
    }[];
};

async function fetchSeries(id: string): Promise<SeriesDetails | null> {
    try {
        const res = await fetch(`${API_BASE}/api/series/${id}`, { cache: "no-store" });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        return null;
    }
}

export default async function SeriesPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const series = await fetchSeries(id);
    const user = await currentUser();

    if (!series) {
        return (
            <Container sx={{ py: 4 }}>
                <Alert severity="error">Series not found</Alert>
            </Container>
        );
    }

    const isSubscribed = user ? series.subscribers.some(s => s.userId === user.id) : false;
    const isOrganizer = user?.id === series.organizer.id;
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = series.dayOfWeek !== null ? days[series.dayOfWeek] : "Custom Dates";

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>

            {/* 1. Series Header */}
            <Card sx={{ mb: 4, overflow: 'visible' }}>
                <Box sx={{ bgcolor: 'primary.main', height: 100, position: 'relative' }} />
                <CardContent sx={{ pt: 0, mt: -6, position: 'relative' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="flex-end" flexWrap="wrap">
                        <Box>
                            <Box sx={{ p: 0.5, bgcolor: 'background.paper', borderRadius: '50%', display: 'inline-block', mb: 2 }}>
                                {/* תיקון: שימוש ב-size ו-name במקום sx */}
                                <Avatar
                                    src={series.organizer.avatar}
                                    name={series.organizer.name || "Organizer"}
                                    alt={series.organizer.name || "Organizer"}
                                    size="lg"
                                />
                            </Box>
                            <Typography variant="h4" fontWeight="bold">
                                {series.title || series.fieldName}
                            </Typography>
                            <Stack direction="row" spacing={2} sx={{ mt: 1, color: 'text.secondary' }}>
                                {series.title && (
                                    <Box display="flex" alignItems="center" gap={0.5}>
                                        <Typography variant="body2">{series.fieldName}</Typography>
                                    </Box>
                                )}
                                <Box display="flex" alignItems="center" gap={0.5}>
                                    <AccessTimeIcon fontSize="small" />
                                    <Typography variant="body2">{dayName} at {series.time}</Typography>
                                </Box>
                                <Box display="flex" alignItems="center" gap={0.5}>
                                    <LocationOnIcon fontSize="small" />
                                    <Typography variant="body2">{series.fieldLocation}</Typography>
                                </Box>
                            </Stack>
                        </Box>

                        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                            {isOrganizer && (
                                <SeriesSettingsEditor
                                    seriesId={series.id}
                                    initialAutoOpenHours={series.autoOpenRegistrationHours}
                                    initialTitle={series.title}
                                    canManage={true}
                                />
                            )}
                            <SeriesSubscribeButton
                                seriesId={series.id}
                                initialSubscribed={isSubscribed}
                            />
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            <Grid container spacing={4}>

                {/* 2. Regulars List */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom display="flex" alignItems="center" gap={1}>
                        <GroupsIcon color="primary" />
                        The Regulars ({series.subscribers.length})
                    </Typography>
                    <Card elevation={2}>
                        <CardContent>
                            {series.subscribers.length > 0 ? (
                                <Grid container spacing={2}>
                                    {series.subscribers.map((sub) => (
                                        <Grid size={{ xs: 6, sm: 4 }} key={sub.userId}>
                                            <Box display="flex" alignItems="center" gap={1.5} p={1} borderRadius={2} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                                                {/* תיקון: שימוש ב-size ו-name במקום sx */}
                                                <Avatar
                                                    src={sub.user.avatar}
                                                    name={sub.user.name || "User"}
                                                    alt={sub.user.name || "User"}
                                                    size="md"
                                                />
                                                <Typography variant="body2" fontWeight={500} noWrap>
                                                    {sub.user.name}
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Typography variant="body2" color="text.secondary" align="center" py={3}>
                                    No regulars yet. Be the first to join!
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* 3. Upcoming Games Schedule */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom display="flex" alignItems="center" gap={1}>
                        <EventIcon color="primary" />
                        Upcoming Games
                    </Typography>
                    <Card elevation={2}>
                        <List disablePadding>
                            {series.upcomingGames.map((game, index) => (
                                <Box key={game.id}>
                                    <Link href={`/games/${game.id}`} style={{ textDecoration: 'none', color: 'inherit', width: '100%' }}>
                                        <ListItemButton>
                                            <ListItemAvatar>
                                                <Box
                                                    sx={{
                                                        width: 50, height: 50, borderRadius: 2, bgcolor: 'primary.50', color: 'primary.main',
                                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                                    }}
                                                >
                                                    <Typography variant="caption" fontWeight="bold" sx={{ lineHeight: 1 }}>
                                                        {new Date(game.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                                    </Typography>
                                                    <Typography variant="h6" fontWeight="bold" sx={{ lineHeight: 1 }}>
                                                        {new Date(game.date).getDate()}
                                                    </Typography>
                                                </Box>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={new Date(game.date).toLocaleDateString('en-US', { weekday: 'long' })}
                                                secondary={`${game.currentPlayers} / ${game.maxPlayers} Players`}
                                                primaryTypographyProps={{ fontWeight: 'bold' }}
                                            />
                                            <ArrowForwardIcon color="action" fontSize="small" />
                                        </ListItemButton>
                                    </Link>
                                    {index < series.upcomingGames.length - 1 && <Divider variant="inset" component="li" />}
                                </Box>
                            ))}
                            {series.upcomingGames.length === 0 && (
                                <Box p={3} textAlign="center">
                                    <Typography variant="body2" color="text.secondary">
                                        No upcoming games scheduled.
                                    </Typography>
                                </Box>
                            )}
                        </List>
                    </Card>
                </Grid>

            </Grid>
        </Container>
    );
}