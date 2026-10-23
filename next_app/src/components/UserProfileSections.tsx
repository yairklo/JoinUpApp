"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useAuthTokenRef } from "@/hooks/useAuthTokenRef";
import Link from "next/link";
import { usersApi, UserProfile, ProfileMatch } from "@/services/api/users";
import { SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";
import Avatar from "@/components/Avatar";
import { formatHistoryDateTime } from "@/utils/historyDate";
import MatchResultBadge from "@/components/MatchResultBadge";
import ProfileStatsSection from "@/components/ProfileStatsSection";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import LoadingMotif from "@/components/motion/LoadingMotif";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const PAGE_SIZE = 5;

export default function UserProfileSections({ userId }: { userId: string }) {
    const getTokenRef = useAuthTokenRef();
    const { user: me } = useUser();
    const isOwner = !!me?.id && me.id === userId;
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
                const token = await getTokenRef.current();
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
    }, [userId]);

    const handleLoadMore = async () => {
        setLoadingMore(true);
        try {
            const token = await getTokenRef.current();
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
                <LoadingMotif id="crowd-wave" />
            </Box>
        );
    }

    if (!profile) return null;

    const sportStats = profile.sportStats || [];
    const showFriends = profile.sections?.friends && profile.friends;
    const showHistory = profile.sections?.matchHistory && profile.matchHistory;
    const groups = profile.groups || [];

    return (
        <Box data-testid="profile-sections">
            {(showFriends || showHistory || groups.length > 0) && <Divider sx={{ my: 3 }} />}

            {/* Groups (recurring series) the user belongs to; absent when hidden */}
            {groups.length > 0 && (
                <Box mb={4}>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                        קבוצות
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        {groups.map((g) => (
                            <Chip
                                key={g.id}
                                component={Link}
                                href={`/series/${g.id}`}
                                clickable
                                icon={<GroupsRoundedIcon />}
                                label={`${g.sport ? (SPORT_EMOJI[g.sport] || "") + " " : ""}${g.title || g.fieldName}`}
                                variant="outlined"
                                color="primary"
                                sx={{ fontWeight: 600 }}
                            />
                        ))}
                    </Stack>
                </Box>
            )}

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

            {/* Match stats: hidden/private renders nothing; own view shows an empty state */}
            <Box mb={4} sx={{ "&:empty": { display: "none" } }}>
                <ProfileStatsSection userId={userId} isOwner={isOwner} />
            </Box>

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
                                                    <Box flex={1} minWidth={0}>
                                                        <Typography variant="body1" fontWeight={600}>
                                                            {m.title || sportLabel || "משחק"}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {[`${emoji} ${sportLabel}`, formatHistoryDateTime(m.date, m.time)].filter(Boolean).join(" · ")}
                                                        </Typography>
                                                    </Box>
                                                    <MatchResultBadge gameId={m.id} sport={m.sport} result={m.result} />
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
