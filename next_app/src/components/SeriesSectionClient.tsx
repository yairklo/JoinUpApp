"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

import SeriesHeaderCard from "@/components/SeriesHeaderCard";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import FullPageList from "@/components/FullPageList";

type Series = {
    id: string;
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number;
    subscriberCount: number;
    sport?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

import { SportFilter } from "@/utils/sports";

export default function SeriesSectionClient({ sportFilter = "ALL" }: { sportFilter?: SportFilter }) {
    const [seriesList, setSeriesList] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);
    const { getToken } = useAuth();

    useEffect(() => {
        let ignore = false;

        async function run() {
            setLoading(true);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");

                // Fetch active series. Public access allowed typically, but good to pass token if we have it
                const res = await fetch(`${API_BASE}/api/series/active`, {
                    cache: "no-store",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) throw new Error("Failed to fetch active series");
                const data: Series[] = await res.json();

                if (!ignore) setSeriesList(data);
            } catch (err) {
                console.error("Error loading series:", err);
                if (!ignore) setSeriesList([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }
        run();
        return () => {
            ignore = true;
        };
    }, [getToken]);

    const filteredSeries = seriesList.filter((s) => {
        if (sportFilter === "ALL") return true;
        return s.sport === sportFilter;
    });

    if (loading) {
        /* Optional: loading state or just return null to not jump layout */
        return null;
    }

    if (filteredSeries.length === 0) return null;

    return (
        <>
            <GamesHorizontalList
                title="הצטרף לסדרה"
                onSeeAll={() => setIsSeeAllOpen(true)}
            >
                {filteredSeries.map((s) => (
                    <SeriesHeaderCard
                        key={s.id}
                        name={s.name}
                        fieldName={s.fieldName}
                        time={s.time}
                        dayOfWeek={s.dayOfWeek}
                        subscriberCount={s.subscriberCount}
                        sport={s.sport}
                    >
                        <Button
                            component={Link}
                            href={`/series/${s.id}`}
                            variant="outlined"
                            color="secondary"
                            size="small"
                            fullWidth
                            endIcon={<ArrowForwardIcon />}
                        >
                            View Series
                        </Button>
                    </SeriesHeaderCard>
                ))}
            </GamesHorizontalList>

            <FullPageList
                open={isSeeAllOpen}
                onClose={() => setIsSeeAllOpen(false)}
                title="הצטרף לסדרה"
                items={filteredSeries}
                renderItem={(s) => (
                    <SeriesHeaderCard
                        key={s.id}
                        name={s.name}
                        fieldName={s.fieldName}
                        time={s.time}
                        dayOfWeek={s.dayOfWeek}
                        subscriberCount={s.subscriberCount}
                        sport={s.sport}
                    >
                        <Link href={`/series/${s.id}`} passHref legacyBehavior>
                            <Button
                                component="a"
                                variant="outlined"
                                color="secondary"
                                size="small"
                                fullWidth
                                endIcon={<ArrowForwardIcon />}
                            >
                                View Series
                            </Button>
                        </Link>
                    </SeriesHeaderCard>
                )}
            />
        </>
    );
}
