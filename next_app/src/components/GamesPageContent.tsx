"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Container from "@mui/material/Container";

import MyJoinedGames from "@/components/MyJoinedGames";
import GamesByDateClient from "@/components/GamesByDateClient";
import GamesByFriendsClient from "@/components/GamesByFriendsClient";
import GamesByCityClient from "@/components/GamesByCityClient";
import SeriesSectionClient from "@/components/SeriesSectionClient";
import { SportFilter, SPORT_MAPPING } from "@/utils/sports";

const FILTERS: { label: string; value: SportFilter }[] = [
    { label: "הכל", value: "ALL" },
    { label: SPORT_MAPPING.SOCCER, value: "SOCCER" },
    { label: SPORT_MAPPING.BASKETBALL, value: "BASKETBALL" },
    { label: SPORT_MAPPING.TENNIS, value: "TENNIS" },
];

export default function GamesPageContent({
    initialDate,
    fieldId,
}: {
    initialDate: string;
    fieldId?: string;
}) {
    const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");

    return (
        <Container maxWidth="md">
            <Stack spacing={4} id="games-feed" sx={{ scrollMarginTop: "20px" }}>

                {/* Filter Section */}
                <Box display="flex" gap={1} flexWrap="wrap" sx={{ mb: -2 }}>
                    {FILTERS.map((f) => (
                        <Chip
                            key={f.value}
                            label={f.label}
                            clickable
                            color={sportFilter === f.value ? "primary" : "default"}
                            onClick={() => setSportFilter(f.value)}
                            variant={sportFilter === f.value ? "filled" : "outlined"}
                        />
                    ))}
                </Box>

                {/* My Games */}
                <Box>
                    <MyJoinedGames sportFilter={sportFilter} />
                </Box>

                {/* Series List */}
                <Box>
                    <SeriesSectionClient sportFilter={sportFilter} />
                </Box>

                {/* Games by City */}
                <Box>
                    <GamesByCityClient sportFilter={sportFilter} />
                </Box>

                {/* Games with Friends */}
                <Box>
                    <GamesByFriendsClient sportFilter={sportFilter} />
                </Box>

                {/* All Games List */}
                <Box>
                    <GamesByDateClient
                        initialDate={initialDate}
                        fieldId={fieldId}
                        sportFilter={sportFilter}
                    />
                </Box>

            </Stack>
        </Container>
    );
}
