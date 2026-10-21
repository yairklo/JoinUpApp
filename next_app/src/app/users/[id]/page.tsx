import Avatar from "@/components/Avatar";
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Alert from "@mui/material/Alert";

// Icons
import LocationOnIcon from '@mui/icons-material/LocationOn';
import EmailIcon from '@mui/icons-material/Email';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import UserProfileActions from "@/components/UserProfileActions";
import UserProfileSections from "@/components/UserProfileSections";
import UserProfileRating from "@/components/UserProfileRating";
import { SPORT_MAPPING } from "@/utils/sports";
import { normalizeName } from "@/utils/normalizeName";
import { auth } from "@clerk/nextjs/server";

type PublicUser = {
    id: string;
    name: string | null;
    imageUrl?: string | null;
    email?: string | null;
    city?: string | null;
    age?: number | null;
    gender?: "MALE" | "FEMALE" | null;
    sports?: { id: string; name: string; position?: string | null }[];
    positions?: { id: string; name: string; sportId: string }[];
    ratingAverage?: number | null;
    totalRatings?: number;
    profileRestricted?: boolean;
    canMessage?: boolean;
    canAddFriend?: boolean;
};

const GENDER_LABELS: Record<"MALE" | "FEMALE", string> = {
    MALE: "גבר",
    FEMALE: "אישה",
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchUser(id: string, token: string | null): Promise<PublicUser | null> {
    try {
        const res = await fetch(`${API_BASE}/api/users/${id}`, {
            cache: "no-store",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) return null;
        return res.json();
    } catch (e) {
        return null;
    }
}

export default async function UserPublicPage(props: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await props.params;
    const { getToken } = await auth();
    const token = await getToken().catch(() => null);
    const u = await fetchUser(id, token);

    if (!u) {
        return (
            <Container maxWidth="sm" sx={{ mt: 4 }}>
                <Alert severity="error">המשתמש לא נמצא</Alert>
            </Container>
        );
    }

    return (
        <main>
            <Container maxWidth="sm" sx={{ py: 6 }}>
                <Card elevation={3} sx={{ borderRadius: 3, overflow: 'visible' }}>

                    {/* Decorative Header Background */}
                    <Box
                        sx={{
                            height: 120,
                            bgcolor: 'primary.main',
                            opacity: 0.08,
                            borderTopLeftRadius: 12,
                            borderTopRightRadius: 12
                        }}
                    />

                    <CardContent sx={{ position: 'relative', pt: 0, mt: -6, textAlign: 'center' }}>

                        {/* Avatar with white border to separate from background */}
                        <Box display="flex" justifyContent="center">
                            <Box sx={{ p: 0.5, bgcolor: 'background.paper', borderRadius: '50%' }}>
                                <Avatar
                                    src={u.imageUrl}
                                    alt={normalizeName(u.name) || u.id}
                                    name={normalizeName(u.name) || u.id}
                                    size="lg" // You might want to add 'xl' size to your Avatar component later for this specific page
                                />
                            </Box>
                        </Box>

                        {/* Name & Location */}
                        <Box mt={2} mb={3}>
                            <Typography variant="h4" fontWeight="bold" gutterBottom data-testid="profile-name">
                                {normalizeName(u.name) || "משתמש"}
                            </Typography>

                            <UserProfileRating
                                ratingAverage={u.ratingAverage}
                                totalRatings={u.totalRatings}
                            />

                            {u.city ? (
                                <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5} color="text.secondary">
                                    <LocationOnIcon fontSize="small" />
                                    <Typography variant="body1">{u.city}</Typography>
                                </Stack>
                            ) : u.profileRestricted ? null : (
                                <Typography variant="body2" color="text.secondary">מיקום לא צוין</Typography>
                            )}

                            {u.profileRestricted && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    הפרופיל הזה פתוח לחברים בלבד
                                </Typography>
                            )}

                            <Box mt={2}>
                                <UserProfileActions
                                    targetUserId={id}
                                    targetUserName={normalizeName(u.name) || "משתמש"}
                                    targetUserImage={u.imageUrl}
                                    canMessage={u.canMessage !== false}
                                    canAddFriend={u.canAddFriend !== false}
                                />
                            </Box>
                        </Box>

                        <Divider sx={{ my: 3 }} />

                        {/* Details Grid */}
                        <Stack spacing={3} textAlign="left">

                            {/* Contact — only the owner receives an email, and a restricted profile has none */}
                            {!u.profileRestricted && u.email ? (
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                    יצירת קשר
                                </Typography>
                                <Stack direction="row" alignItems="center" gap={1.5} mt={1}>
                                    <EmailIcon color="action" fontSize="small" />
                                    <Typography variant="body1" data-testid="profile-email">{u.email}</Typography>
                                </Stack>
                            </Box>
                            ) : null}

                            {/* Age */}
                            {!u.profileRestricted && u.age ? (
                                <Box data-testid="profile-age">
                                    <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                        גיל
                                    </Typography>
                                    <Typography variant="body1">{u.age}</Typography>
                                </Box>
                            ) : null}

                            {/* Gender */}
                            {!u.profileRestricted && u.gender && (
                                <Box>
                                    <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                        מין
                                    </Typography>
                                    <Typography variant="body1">{GENDER_LABELS[u.gender]}</Typography>
                                </Box>
                            )}

                            {/* Sports & Positions */}
                            {!u.profileRestricted && (
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase" gutterBottom>
                                    ענפי ספורט ותפקידים
                                </Typography>
                                {(u.sports && u.sports.length > 0) ? (
                                    <Stack spacing={2} mt={1}>
                                        {u.sports.map((s) => {
                                            const hebrewName = SPORT_MAPPING[s.name] || SPORT_MAPPING[s.id] || s.name;
                                            const positions = s.position ? s.position.split(',').map(p => p.trim()).filter(Boolean) : [];
                                            return (
                                                <Box key={s.id} display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                                    <Chip 
                                                        label={hebrewName} 
                                                        color="primary" 
                                                        icon={<SportsSoccerIcon />} 
                                                    />
                                                    {positions.map((pos, i) => (
                                                        <Chip 
                                                            key={i} 
                                                            label={pos} 
                                                            size="small" 
                                                            variant="outlined" 
                                                            color="primary" 
                                                        />
                                                    ))}
                                                </Box>
                                            );
                                        })}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" color="text.secondary">-</Typography>
                                )}
                            </Box>
                            )}

                        </Stack>

                        <Divider sx={{ my: 3 }} />

                        {/* Privacy-aware sport stats, friends & match history */}
                        <UserProfileSections userId={id} />

                    </CardContent>
                </Card>
            </Container>
        </main>
    );
}