"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, useUser, SignInButton } from "@clerk/nextjs";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

import SeriesHeaderCard from "@/components/SeriesHeaderCard";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";
import FullPageList from "@/components/FullPageList";
import InlineErrorRow from "@/components/InlineErrorRow";
import { getLoadErrorMessage } from "@/utils/apiError";
import { useSeriesCreatedListener, useSeriesDeletedListener, SeriesPayload } from "@/context/GameUpdateContext";
import { SportFilter, sportLabel } from "@/utils/sports";

type Series = {
    id: string;
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number;
    subscriberCount: number;
    sport?: string;
    isSubscribed?: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function SeriesSectionClient({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
    const [seriesList, setSeriesList] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [isMySeriesSeeAllOpen, setIsMySeriesSeeAllOpen] = useState(false);
    const [isJoinSeriesSeeAllOpen, setIsJoinSeriesSeeAllOpen] = useState(false);
    const refetch = useCallback(() => setReloadKey((k) => k + 1), []);
    const { getToken, isSignedIn } = useAuth();
    const { user } = useUser();
    const userId = user?.id;

    useSeriesCreatedListener((series: SeriesPayload) => {
        if (sportFilter !== "ALL" && series.sport !== sportFilter) return;

        setSeriesList((prev) => {
            if (prev.some((s) => s.id === series.id)) return prev;

            const newSeries: Series = {
                id: series.id,
                name: series.name,
                fieldName: series.fieldName,
                time: series.time,
                dayOfWeek: series.dayOfWeek,
                subscriberCount: series.subscriberCount,
                sport: series.sport,
                isSubscribed: !!(userId && series.subscriberIds?.includes(userId))
            };

            return [...prev, newSeries];
        });
    });

    useSeriesDeletedListener(({ seriesId }) => {
        setSeriesList((prev) => prev.filter((s) => s.id !== seriesId));
    });

    useEffect(() => {
        let ignore = false;

        async function run() {
            setLoading(true);
            setError(null);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");

                // Fetch active series. Public access allowed typically, but good to pass token if we have it
                const res = await fetch(`${API_BASE}/api/series/active`, {
                    cache: "no-store",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) {
                    const err = new Error("Failed to fetch active series") as Error & { status?: number };
                    err.status = res.status;
                    throw err;
                }
                const data: Series[] = await res.json();

                if (!ignore) setSeriesList(data);
            } catch (err) {
                console.error("Error loading series:", err);
                if (!ignore) {
                    setSeriesList([]);
                    setError(getLoadErrorMessage(err));
                }
            } finally {
                if (!ignore) setLoading(false);
            }
        }
        run();
        return () => {
            ignore = true;
        };
    }, [getToken, reloadKey]);

    const filteredSeries = seriesList.filter((s) => {
        if (sportFilter === "ALL") return true;
        return s.sport === sportFilter;
    });

    if (loading) {
        return (
            <GamesHorizontalList title="קבוצות פעילות">
                <GameCardSkeletonRow />
            </GamesHorizontalList>
        );
    }

    if (error) {
        return (
            <GamesHorizontalList title="קבוצות פעילות">
                <Box p={2} width="100%">
                    <InlineErrorRow message={error} onRetry={refetch} />
                </Box>
            </GamesHorizontalList>
        );
    }

    const mySeries = isSignedIn ? filteredSeries.filter((s) => s.isSubscribed) : [];
    const joinableSeries = filteredSeries.filter((s) => !s.isSubscribed);

    if (mySeries.length === 0 && joinableSeries.length === 0) {
        return (
            <GamesHorizontalList title="קבוצות פעילות">
                <Box p={2} width="100%">
                    <Typography variant="body2" color="text.secondary">
                        {isSignedIn
                            ? (sportFilter !== "ALL"
                                ? `לא נמצאו קבוצות ${sportLabel(sportFilter)}`
                                : "אין עדיין קבוצות פעילות")
                            : "התחבר כדי לשחק עם חברים בקבוצה קבועה"}
                    </Typography>
                    {!isSignedIn && (
                        <SignInButton mode="modal">
                            <Button size="small" variant="outlined" sx={{ mt: 1 }}>התחבר</Button>
                        </SignInButton>
                    )}
                </Box>
            </GamesHorizontalList>
        );
    }

    const renderCard = (s: Series, key?: string) => (
        <SeriesHeaderCard
            key={key ?? s.id}
            name={s.name}
            fieldName={s.fieldName}
            time={s.time}
            dayOfWeek={s.dayOfWeek}
            subscriberCount={s.subscriberCount}
            sport={s.sport}
            isSubscribed={s.isSubscribed}
            href={`/series/${s.id}`}
        />
    );

    return (
        <>
            {mySeries.length > 0 && (
                <>
                    <GamesHorizontalList
                        title="הקבוצות שלי"
                        onSeeAll={() => setIsMySeriesSeeAllOpen(true)}
                    >
                        {mySeries.map((s) => renderCard(s))}
                    </GamesHorizontalList>

                    <FullPageList
                        open={isMySeriesSeeAllOpen}
                        onClose={() => setIsMySeriesSeeAllOpen(false)}
                        title="הקבוצות שלי"
                        items={mySeries}
                        renderItem={(s) => renderCard(s)}
                    />
                </>
            )}

            {joinableSeries.length > 0 && (
                <>
                    <GamesHorizontalList
                        title="הצטרפו לקבוצה"
                        onSeeAll={() => setIsJoinSeriesSeeAllOpen(true)}
                    >
                        {joinableSeries.map((s) => renderCard(s))}
                    </GamesHorizontalList>

                    <FullPageList
                        open={isJoinSeriesSeeAllOpen}
                        onClose={() => setIsJoinSeriesSeeAllOpen(false)}
                        title="הצטרפו לקבוצה"
                        items={joinableSeries}
                        renderItem={(s) => renderCard(s)}
                    />
                </>
            )}
        </>
    );
}
