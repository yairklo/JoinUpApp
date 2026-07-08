"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { usersApi, UserProfile, ProfileMatch } from "@/services/api/users";
import { SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";
import Avatar from "@/components/Avatar";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const PAGE_SIZE = 5;

export default function UserProfileSections({ userId }: { userId: string }) {
    const { getToken } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    // Match history pagination
    const [matches, setMatches] = useState<ProfileMatch[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const token = await getToken();
                const data = await usersApi.getProfile(userId, token || undefined);
                if (!active) return;
                setProfile(data);
                const initial = data.matchHistory || [];
                setMatches(initial);
                setHasMore(initial.length === PAGE_SIZE);
            } catch (e) {
                console.error("Failed to load profile sections:", e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [userId, getToken]);

    const handleLoadMore = async () => {
        setLoadingMore(true);
        try {
            const token = await getToken();
            const next = await usersApi.getMatchHistory(userId, matches.length, PAGE_SIZE, token || undefined);
            setMatches((prev) => [...prev, ...next]);
            setHasMore(next.length === PAGE_SIZE);
        } catch (e) {
            console.error("Failed to load more matches:", e);
        } finally {
            setLoadingMore(false);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" py={3}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (!profile) return null;

    const sportStats = profile.sportStats || [];
    const showFriends = profile.sections?.friends && profile.friends;
    const showHistory = profile.sections?.matchHistory && profile.matchHistory;

    return (
        <Box>
            {(showFriends || showHistory) && <Divider sx={{ my: 3 }} />}

            {/* Friends */}
            {showFriends && (
                <Box mb={4}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                        חברים
                    </Typography>
                    {profile.friends!.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">אין חברים להצגה</Typography>
                    ) : (
                        <Stack direction="row" spacing={2} sx={{ overflowX: "auto", pb: 1 }}>
                            {profile.friends!.map((f) => (
                                <Link key={f.id} href={`/users/${f.id}`} style={{ textDecoration: "none" }}>
                                    <Stack alignItems="center" spacing={0.5} sx={{ minWidth: 72 }}>
                                        <Avatar src={f.imageUrl} alt={f.name || f.id} name={f.name || undefined} size="lg" />
                                        <Typography variant="caption" color="text.primary" noWrap sx={{ maxWidth: 72 }}>
                                            {f.name || "משתמש"}
                                        </Typography>
                                    </Stack>
                                </Link>
                            ))}
                        </Stack>
                    )}
                </Box>
            )}

            {/* Match history */}
            {showHistory && (
                <Box mb={2}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                        היסטוריית משחקים
                    </Typography>

                    {/* Sport stats chips — contextualized right above the match feed */}
                    {sportStats.length > 0 && (
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                            {sportStats.map((s) => (
                                <Chip
                                    key={s.sport}
                                    label={`${SPORT_EMOJI[s.sport] || "🏅"} ${SPORT_MAPPING[s.sport] || s.sport} · ${s.count}`}
                                    color="primary"
                                    variant="outlined"
                                    sx={{ fontWeight: 600 }}
                                />
                            ))}
                        </Stack>
                    )}

                    {matches.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">אין משחקים קודמים</Typography>
                    ) : (
                        <Stack spacing={1.5}>
                            {matches.map((m) => {
                                const sportLabel = m.sport ? SPORT_MAPPING[m.sport] || m.sport : "";
                                const emoji = m.sport ? SPORT_EMOJI[m.sport] || "🏅" : "🏅";
                                return (
                                    <Link key={m.id} href={`/games/${m.id}`} style={{ textDecoration: "none" }}>
                                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                                            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
                                                <Stack direction="row" alignItems="center" spacing={1.5}>
                                                    <SportsSoccerIcon color="primary" fontSize="small" />
                                                    <Box flex={1}>
                                                        <Typography variant="body1" fontWeight={600}>
                                                            {m.title || sportLabel || "משחק"}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {[`${emoji} ${sportLabel}`, m.date, m.time].filter(Boolean).join(" · ")}
                                                        </Typography>
                                                    </Box>
                                                </Stack>
                                            </CardContent>
                                        </Card>
                                    </Link>
                                );
                            })}
                        </Stack>
                    )}

                    {hasMore && (
                        <Box display="flex" justifyContent="center" mt={2}>
                            <Button
                                variant="outlined"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                                startIcon={loadingMore ? <CircularProgress size={16} /> : <ExpandMoreIcon />}
                            >
                                הצג משחקים נוספים
                            </Button>
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    );
}
