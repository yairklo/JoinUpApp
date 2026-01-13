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

type PublicUser = {
    id: string;
    name: string | null;
    imageUrl?: string | null;
    email?: string | null;
    city?: string | null;
    age?: number | null;
    sports?: { id: string; name: string; position?: string | null }[];
    positions?: { id: string; name: string; sportId: string }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchUser(id: string): Promise<PublicUser | null> {
    try {
        const res = await fetch(`${API_BASE}/api/users/${id}`, {
            cache: "no-store",
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
    const u = await fetchUser(id);

    if (!u) {
        return (
            <Container maxWidth="sm" sx={{ mt: 4 }}>
                <Alert severity="error">User not found</Alert>
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
                                    alt={u.name || u.id}
                                    name={u.name || u.id}
                                    size="lg" // You might want to add 'xl' size to your Avatar component later for this specific page
                                />
                            </Box>
                        </Box>

                        {/* Name & Location */}
                        <Box mt={2} mb={3}>
                            <Typography variant="h4" fontWeight="bold" gutterBottom>
                                {u.name || "Unknown User"}
                            </Typography>

                            {u.city ? (
                                <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5} color="text.secondary">
                                    <LocationOnIcon fontSize="small" />
                                    <Typography variant="body1">{u.city}</Typography>
                                </Stack>
                            ) : (
                                <Typography variant="body2" color="text.secondary">Location not specified</Typography>
                            )}

                            <Box mt={2}>
                                <UserProfileActions targetUserId={id} />
                            </Box>
                        </Box>

                        <Divider sx={{ my: 3 }} />

                        {/* Details Grid */}
                        <Stack spacing={3} textAlign="left">

                            {/* Contact */}
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                    Contact
                                </Typography>
                                <Stack direction="row" alignItems="center" gap={1.5} mt={1}>
                                    <EmailIcon color="action" fontSize="small" />
                                    <Typography variant="body1">{u.email || "No email visible"}</Typography>
                                </Stack>
                            </Box>

                            {/* Sports */}
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                    Sports
                                </Typography>
                                <Box mt={1} display="flex" gap={1} flexWrap="wrap">
                                    {(u.sports && u.sports.length > 0) ? (
                                        u.sports.map((s) => (
                                            <Chip
                                                key={s.id}
                                                label={s.position ? `${s.name} (${s.position})` : s.name}
                                                icon={<SportsSoccerIcon />}
                                                color="primary"
                                                variant="outlined"
                                            />
                                        ))
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">-</Typography>
                                    )}
                                </Box>
                            </Box>

                            {/* Age */}
                            {u.age && (
                                <Box>
                                    <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                        Age
                                    </Typography>
                                    <Typography variant="body1">{u.age}</Typography>
                                </Box>
                            )}

                            {/* Positions */}
                            <Box>
                                <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase">
                                    Positions
                                </Typography>
                                <Box mt={1} display="flex" gap={1} flexWrap="wrap">
                                    {(u.positions && u.positions.length > 0) ? (
                                        u.positions.map((p) => (
                                            <Chip
                                                key={p.id}
                                                label={p.name}
                                                size="small"
                                                variant="outlined"
                                            />
                                        ))
                                    ) : (
                                        <Typography variant="body2" color="text.secondary">-</Typography>
                                    )}
                                </Box>
                            </Box>

                        </Stack>

                    </CardContent>
                </Card>
            </Container>
        </main>
    );
}