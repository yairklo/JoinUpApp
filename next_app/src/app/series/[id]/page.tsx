import Avatar from "@/components/Avatar";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import SeriesSubscribeButton from "@/components/SeriesSubscribeButton";
import MuteNotificationsButton from "@/components/notifications/MuteNotificationsButton";
import SeriesSettingsEditor from "@/components/SeriesSettingsEditor";
import SeriesMembersPanel from "@/components/SeriesMembersPanel";
import SeriesMemberMenu from "@/components/SeriesMemberMenu";
import SeriesJoinRequestsPanel from "@/components/SeriesJoinRequestsPanel";
import type { FriendsOnlyLinkPolicy } from "@/types/game";
import GameLocationMap from "@/components/GameLocationMap";
import OpenInMapLinks from "@/components/OpenInMapLinks";
import { buildMapLinks } from "@joinup/shared/mapLinks";

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

// This page is a Server Component (runs in UTC on the host); day/month/weekday must be derived in
// Jerusalem time explicitly, or a game just after local midnight renders on the previous day.
const JERUSALEM_TZ = "Asia/Jerusalem";

type SeriesDetails = {
    id: string;
    title?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    fieldId?: string | null;
    fieldName: string;
    fieldLocation: string;
    fieldLat?: number | null;
    fieldLng?: number | null;
    time: string;
    duration: number;
    dayOfWeek: number | null;
    type: 'WEEKLY' | 'CUSTOM';
    autoOpenRegistrationHours: number | null;
    registrationOpenDayOfWeek?: number | null;
    registrationOpenTime?: string | null;
    maxPlayers: number;
    price: number;
    sport: string;
    isOpenToJoin: boolean;
    isFriendsOnly: boolean;
    friendsOnlyLinkPolicy?: FriendsOnlyLinkPolicy;
    /** REQUEST: a friends-only group seen by an outsider (joining sends a request). */
    viewerAccess?: 'FULL' | 'REQUEST';
    /** Members-priority group: joining as a non-member sends a request the managers approve. */
    viewerJoinRequiresApproval?: boolean;
    viewerJoinRequestStatus?: 'PENDING' | 'REJECTED' | null;
    /** Managers only. */
    pendingJoinRequestCount?: number;
    joinPolicy: 'INSTANT' | 'REQUIRES_APPROVAL';
    lotteryEnabled: boolean;
    organizerInLottery: boolean;
    teamSize: number | null;
    welcomeMessage: string | null;
    membersOnlyPriority?: boolean;
    guestRegistrationOpenHours?: number | null;
    guestWelcomeMessage?: string | null;
    guestDescription?: string | null;
    guestPrice?: number | null;
    /** The viewer is the organizer or a member (guests see the guest description / price). */
    viewerIsMember?: boolean;
    organizer: { id: string; name: string | null; avatar: string | null };
    subscribers: {
        userId: string;
        role?: string;
        user: { id: string; name: string | null; avatar: string | null }
    }[];
    upcomingGames: {
        id: string;
        date: string;
        /** Jerusalem wall-clock HH:mm, computed by the API. */
        time?: string;
        currentPlayers: number;
        maxPlayers: number;
    }[];
};

type FetchSeriesResult = { series: SeriesDetails } | { friendsOnly: true } | null;

async function fetchSeries(id: string, token?: string | null): Promise<FetchSeriesResult> {
    try {
        // Signed in, so friends and members of a friends-only group are recognized.
        const res = await fetch(`${API_BASE}/api/series/${id}`, {
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.status === 403) {
            const body = await res.json().catch(() => ({}));
            return body?.code === "SERIES_FRIENDS_ONLY" ? { friendsOnly: true } : null;
        }
        if (!res.ok) return null;
        return { series: await res.json() };
    } catch (e) {
        return null;
    }
}

export default async function SeriesPage(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
    const { userId, getToken } = await auth();
    // Group details (members, schedule) are for signed-in users only.
    if (!userId) redirect(`/sign-in?redirect_url=/series/${id}`);
    const token = await getToken().catch(() => null);
    const result = await fetchSeries(id, token);

    if (result && "friendsOnly" in result) {
        return (
            <Container sx={{ py: 4 }}>
                <Alert severity="info" data-testid="series-friends-only">
                    הקבוצה הזו פתוחה לחברים של המארגן בלבד.
                    {!userId && " אם אתה חבר של המארגן, התחבר כדי לראות אותה."}
                </Alert>
            </Container>
        );
    }

    const series = result?.series;
    if (!series) {
        return (
            <Container sx={{ py: 4 }}>
                <Alert severity="error">הקבוצה לא נמצאה</Alert>
            </Container>
        );
    }

    const isSubscribed = userId ? series.subscribers.some(s => s.userId === userId) : false;
    const isOrganizer = userId === series.organizer.id;
    const isManager = userId ? series.subscribers.some(s => s.userId === userId && s.role === 'MANAGER') : false;
    const canManage = isOrganizer || isManager;
    const days = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
    const dayName = series.dayOfWeek !== null ? days[series.dayOfWeek] : "תאריכים מותאמים";

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
                            <Typography variant="h4" fontWeight="bold" data-testid="series-title">
                                {series.title || series.fieldName}
                            </Typography>
                            <Stack direction="row" spacing={2} sx={{ mt: 1, color: 'text.secondary' }} flexWrap="wrap" useFlexGap>
                                {series.title && (
                                    <Box
                                        component={series.fieldId ? Link : "div"}
                                        href={series.fieldId ? `/fields/${series.fieldId}` : undefined}
                                        display="flex"
                                        alignItems="center"
                                        gap={0.5}
                                        sx={series.fieldId ? { color: "primary.main", fontWeight: 700, textDecoration: "none", "&:hover": { textDecoration: "underline" } } : undefined}
                                    >
                                        <Typography variant="body2" fontWeight="inherit" color="inherit">{series.fieldName}</Typography>
                                    </Box>
                                )}
                                <Box
                                    component={series.fieldId ? Link : "div"}
                                    href={series.fieldId ? `/fields/${series.fieldId}` : undefined}
                                    display="flex"
                                    alignItems="center"
                                    gap={0.5}
                                    sx={series.fieldId ? { color: "primary.main", fontWeight: 700, textDecoration: "none", "&:hover": { textDecoration: "underline" } } : undefined}
                                >
                                    <LocationOnIcon fontSize="small" />
                                    <Typography variant="body2" fontWeight="inherit" color="inherit">{series.fieldLocation}</Typography>
                                </Box>
                                <Box display="flex" alignItems="center" gap={0.5}>
                                    <AccessTimeIcon fontSize="small" />
                                    <Typography variant="body2">יום {dayName} בשעה {series.time}</Typography>
                                </Box>
                            </Stack>
                            {series.description && (
                                <Typography variant="body2" sx={{ mt: 1.5, whiteSpace: 'pre-wrap' }} data-testid="series-description">
                                    {series.description}
                                </Typography>
                            )}
                            {series.membersOnlyPriority && !series.viewerIsMember && (series.guestDescription || series.guestPrice != null) && (
                                <Box sx={{ mt: 1.5, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }} data-testid="series-guest-info">
                                    <Typography variant="subtitle2" fontWeight="bold">לאורחים</Typography>
                                    {series.guestDescription && (
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{series.guestDescription}</Typography>
                                    )}
                                    {series.guestPrice != null && (
                                        <Typography variant="body2">מחיר לאורחים: ₪{series.guestPrice}</Typography>
                                    )}
                                </Box>
                            )}
                        </Box>

                        <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
                            {canManage && (
                                <SeriesSettingsEditor
                                    seriesId={series.id}
                                    seriesType={series.type}
                                    initialAutoOpenHours={series.autoOpenRegistrationHours}
                                    initialRegOpenDay={series.registrationOpenDayOfWeek ?? null}
                                    initialRegOpenTime={series.registrationOpenTime ?? null}
                                    initialTitle={series.title}
                                    initialDescription={series.description}
                                    initialImageUrl={series.imageUrl}
                                    initialFieldId={series.fieldId}
                                    initialFieldName={series.fieldName}
                                    initialFieldLocation={series.fieldLocation}
                                    initialDayOfWeek={series.dayOfWeek}
                                    initialTime={series.time}
                                    initialDuration={series.duration}
                                    initialMaxPlayers={series.maxPlayers}
                                    initialPrice={series.price}
                                    initialSport={series.sport}
                                    initialIsFriendsOnly={series.isFriendsOnly}
                                    initialFriendsOnlyLinkPolicy={series.friendsOnlyLinkPolicy}
                                    initialJoinPolicy={series.joinPolicy}
                                    initialLotteryEnabled={series.lotteryEnabled}
                                    initialOrganizerInLottery={series.organizerInLottery}
                                    initialTeamSize={series.teamSize}
                                    initialWelcomeMessage={series.welcomeMessage}
                                    initialMembersOnlyPriority={series.membersOnlyPriority}
                                    initialGuestRegistrationOpenHours={series.guestRegistrationOpenHours}
                                    initialGuestWelcomeMessage={series.guestWelcomeMessage}
                                    initialGuestDescription={series.guestDescription}
                                    initialGuestPrice={series.guestPrice}
                                    canManage={true}
                                />
                            )}
                            <SeriesSubscribeButton
                                seriesId={series.id}
                                initialSubscribed={isSubscribed}
                                viewerAccess={series.viewerAccess === 'REQUEST' || series.viewerJoinRequiresApproval ? 'REQUEST' : 'FULL'}
                                initialRequestStatus={series.viewerJoinRequestStatus ?? null}
                            />
                            {isSubscribed && (
                                <MuteNotificationsButton targetType="SERIES" targetId={series.id} muteLabel="השתק התראות קבוצה" />
                            )}
                        </Box>
                    </Box>
                </CardContent>
            </Card>

            {buildMapLinks({
                lat: series.fieldLat,
                lng: series.fieldLng,
                address: series.fieldLocation,
                name: series.fieldName,
            }) && (
                <Card sx={{ mb: 4, overflow: "hidden" }}>
                    {typeof series.fieldLat === "number" && typeof series.fieldLng === "number" && (
                        <GameLocationMap lat={series.fieldLat} lng={series.fieldLng} title={series.fieldName} height={240} />
                    )}
                    <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        flexWrap="wrap"
                        sx={{
                            p: 2,
                            borderTop: typeof series.fieldLat === "number" && typeof series.fieldLng === "number" ? "1px solid" : "none",
                            borderColor: "divider",
                            "& > *": { minHeight: 44 },
                        }}
                    >
                        <OpenInMapLinks
                            location={{
                                lat: series.fieldLat,
                                lng: series.fieldLng,
                                address: series.fieldLocation,
                                name: series.fieldName,
                            }}
                        />
                    </Stack>
                </Card>
            )}

            <Grid container spacing={4}>

                {/* 2. Regulars List */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Typography variant="h6" component="h2" fontWeight="bold" gutterBottom display="flex" alignItems="center" gap={1}>
                        <GroupsIcon color="primary" />
                        חברי הקבוצה הקבועים ({series.subscribers.length})
                    </Typography>
                    <Card elevation={2}>
                        <CardContent>
                            {canManage && (series.pendingJoinRequestCount ?? 0) > 0 && (
                                <SeriesJoinRequestsPanel seriesId={series.id} />
                            )}
                            {series.subscribers.length > 0 ? (
                                <Grid container spacing={2}>
                                    {series.subscribers.map((sub) => (
                                        <Grid size={{ xs: 6, sm: 4 }} key={sub.userId}>
                                            <SeriesMemberMenu
                                                userId={sub.userId}
                                                name={sub.user.name}
                                                avatar={sub.user.avatar}
                                                isMe={sub.userId === userId}
                                            />
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Typography variant="body2" color="text.secondary" align="center" py={3}>
                                    אין חברים קבועים בקבוצה עדיין. אפשר להצטרף לקבוצה, או להשתתף במשחק בודד מהרשימה.
                                </Typography>
                            )}
                            <SeriesMembersPanel
                                seriesId={series.id}
                                seriesTitle={series.title || series.fieldName}
                                subscribers={series.subscribers}
                                organizerId={series.organizer.id}
                                canManage={canManage}
                                isOrganizer={isOrganizer}
                            />
                        </CardContent>
                    </Card>
                </Grid>

                {/* 3. Upcoming Games Schedule */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom display="flex" alignItems="center" gap={1}>
                        <EventIcon color="primary" />
                        משחקים קרובים
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                        השתתפות במשחק ספציפי אינה מצטרפת אותך לקבוצה הקבועה.
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
                                                        {new Date(game.date).toLocaleDateString('he-IL', { month: 'short', timeZone: JERUSALEM_TZ })}
                                                    </Typography>
                                                    <Typography variant="h6" fontWeight="bold" sx={{ lineHeight: 1 }}>
                                                        {new Date(game.date).toLocaleDateString('he-IL', { day: 'numeric', timeZone: JERUSALEM_TZ })}
                                                    </Typography>
                                                </Box>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={new Date(game.date).toLocaleDateString('he-IL', { weekday: 'long', timeZone: JERUSALEM_TZ })}
                                                secondary={`${game.currentPlayers} / ${game.maxPlayers} שחקנים · ${game.time || series.time}`}
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
                                        אין משחקים קרובים מתוזמנים.
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