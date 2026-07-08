"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ratingsApi, GameRatingTeammate } from "@/services/api/ratings";
import Avatar from "@/components/Avatar";

import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Rating from "@mui/material/Rating";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";

export default function GameRatingsPanel({ gameId }: { gameId: string }) {
    const { getToken } = useAuth();
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState(false);
    const [teammates, setTeammates] = useState<GameRatingTeammate[]>([]);
    const [submittingId, setSubmittingId] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const data = await ratingsApi.getGameRatings(gameId, token);
                if (!active) return;
                setEligible(data.eligible);
                setTeammates(data.teammates || []);
            } catch (e) {
                console.error("Failed to load game ratings:", e);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, [gameId, getToken]);

    const handleRate = async (targetId: string, score: number) => {
        if (submittingId) return;
        setSubmittingId(targetId);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            await ratingsApi.ratePlayer(targetId, { gameId, score }, token);
            setTeammates((prev) =>
                prev.map((t) => (t.id === targetId ? { ...t, myScore: score } : t))
            );
            setSuccess(true);
        } catch (e: unknown) {
            const err = e as Error & { status?: number };
            if (err.status === 409) {
                setError("כבר דירגת שחקן זה במשחק זה");
            } else {
                setError(err.message || "שליחת הדירוג נכשלה");
            }
        } finally {
            setSubmittingId(null);
        }
    };

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" py={3}>
                <CircularProgress size={24} />
            </Box>
        );
    }

    if (!eligible || teammates.length === 0) {
        return null;
    }

    const allRated = teammates.every((t) => t.myScore != null);

    return (
        <>
            <Card variant="outlined" sx={{ borderRadius: 2, mt: 3 }} dir="rtl">
                <CardContent>
                    <Typography variant="h6" fontWeight="bold" gutterBottom>
                        דרג את חברי הקבוצה
                    </Typography>
                    {allRated ? (
                        <Alert severity="success" sx={{ mb: 2 }}>
                            תודה! דירגת את כל חברי הקבוצה.
                        </Alert>
                    ) : (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            דרג את השחקנים ששיחקו איתך במשחק זה (1–5 כוכבים).
                        </Typography>
                    )}
                    <Stack spacing={2}>
                        {teammates.map((t) => (
                            <Stack
                                key={t.id}
                                direction="row"
                                alignItems="center"
                                spacing={2}
                                sx={{ opacity: t.myScore != null ? 0.85 : 1 }}
                            >
                                <Avatar
                                    src={t.imageUrl}
                                    alt={t.name || t.id}
                                    name={t.name || undefined}
                                    size="md"
                                />
                                <Box flex={1}>
                                    <Typography variant="body1" fontWeight={600}>
                                        {t.name || "שחקן"}
                                    </Typography>
                                    <Rating
                                        value={t.myScore ?? 0}
                                        onChange={(_, v) => {
                                            if (v != null && t.myScore == null) {
                                                handleRate(t.id, v);
                                            }
                                        }}
                                        readOnly={t.myScore != null || submittingId === t.id}
                                        disabled={submittingId === t.id}
                                        size="large"
                                    />
                                </Box>
                                {submittingId === t.id && <CircularProgress size={20} />}
                            </Stack>
                        ))}
                    </Stack>
                </CardContent>
            </Card>

            <Snackbar
                open={success}
                autoHideDuration={2000}
                onClose={() => setSuccess(false)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity="success" variant="filled" onClose={() => setSuccess(false)}>
                    הדירוג נשמר
                </Alert>
            </Snackbar>

            <Snackbar
                open={!!error}
                autoHideDuration={3000}
                onClose={() => setError(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert severity="error" variant="filled" onClose={() => setError(null)}>
                    {error}
                </Alert>
            </Snackbar>
        </>
    );
}
