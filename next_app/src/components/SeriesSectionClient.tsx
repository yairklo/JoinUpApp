"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";

import SeriesHeaderCard from "@/components/SeriesHeaderCard";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";
import FullPageList from "@/components/FullPageList";
import InlineErrorRow from "@/components/InlineErrorRow";
import { getLoadErrorMessage } from "@/utils/apiError";
import { useSeriesCreatedListener, useSeriesDeletedListener, SeriesPayload } from "@/context/GameUpdateContext";
import { SportFilter, sportLabel } from "@/utils/sports";
import EmptyState from "@/components/ui/EmptyState";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";

type Series = {
    id: string;
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number;
    subscriberCount: number;
    sport?: string;
    imageUrl?: string | null;
    fieldImage?: string | null;
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
                // Keep whatever list is already on screen (e.g. a background
                // refetch that failed) instead of wiping it out from under
                // the user -- the error state below only replaces the rail
                // when there was nothing to show in the first place.
                if (!ignore) {
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

    // Only show the full skeleton for a true initial load -- a background
    // refetch (reloadKey bump, socket-triggered refresh) keeps whatever
    // series are already rendered instead of blanking the rail.
    if (loading && filteredSeries.length === 0) {
        return (
            <GamesHorizontalList title="קבוצות פעילות">
                <GameCardSkeletonRow />
            </GamesHorizontalList>
        );
    }

    if (error && filteredSeries.length === 0) {
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
        if (!isSignedIn) return null;
        return (
            <GamesHorizontalList title="קבוצות פעילות" staticContent>
                <Box width="100%">
                    <EmptyState
                        compact
                        accent="#6366f1"
                        icon={<EventRepeatRoundedIcon />}
                        title={sportFilter !== "ALL" ? `אין קבוצות ${sportLabel(sportFilter)} פעילות` : "אין עדיין קבוצות פעילות"}
                        description="קבוצה קבועה = אותו משחק, כל שבוע, בלי לתאם מחדש."
                    />
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
            coverImage={s.imageUrl || s.fieldImage}
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
                        isRefreshing={loading}
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
                        isRefreshing={loading}
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

            {/* A background refetch (reloadKey bump, socket-triggered refresh) that fails while
                series are already on screen doesn't replace the rail (see the render logic
                above), but it should still surface *something* -- otherwise the list can go
                silently stale with no indication and no way to retry. */}
            <Snackbar
                open={!!error}
                autoHideDuration={6000}
                onClose={() => setError(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                <Alert
                    severity="warning"
                    variant="filled"
                    onClose={() => setError(null)}
                    action={
                        <Button color="inherit" size="small" onClick={() => { setError(null); refetch(); }}>
                            נסה שוב
                        </Button>
                    }
                >
                    {error}
                </Alert>
            </Snackbar>
        </>
    );
}
