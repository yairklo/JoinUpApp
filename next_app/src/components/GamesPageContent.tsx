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
import { SportFilter, SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";

const FILTERS: { label: string; value: SportFilter }[] = [
    { label: "הכל", value: "ALL" },
    { label: SPORT_MAPPING.SOCCER, value: "SOCCER" },
    { label: SPORT_MAPPING.BASKETBALL, value: "BASKETBALL" },
    { label: SPORT_MAPPING.TENNIS, value: "TENNIS" },
];

import { GameUpdateProvider } from "@/context/GameUpdateContext";

export default function GamesPageContent({
    initialDate,
    fieldId,
}: {
    initialDate: string;
    fieldId?: string;
}) {
    const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");

    return (
        <GameUpdateProvider>
            <Container
                maxWidth="md"
                sx={{
                    px: { xs: 2, sm: 3 },
                    pb: { xs: 2, md: 4 },
                }}
            >
                <Stack spacing={{ xs: 2.5, md: 4 }} id="games-feed" sx={{ scrollMarginTop: "72px" }}>

                    {/* Sticky sport filters on mobile */}
                    <Box
                        sx={{
                            position: { xs: "sticky", md: "static" },
                            top: { xs: 56, md: "auto" },
                            zIndex: 5,
                            mx: { xs: -2, sm: 0 },
                            px: { xs: 2, sm: 0 },
                            py: { xs: 1, md: 0 },
                            bgcolor: { xs: "background.default", md: "transparent" },
                            borderBottom: { xs: 1, md: 0 },
                            borderColor: "divider",
                            mb: { xs: 0, md: -2 },
                        }}
                    >
                        <Box
                            display="flex"
                            gap={1}
                            sx={{
                                overflowX: "auto",
                                scrollbarWidth: "none",
                                "&::-webkit-scrollbar": { display: "none" },
                                WebkitOverflowScrolling: "touch",
                                pb: 0.25,
                            }}
                        >
                            {FILTERS.map((f) => {
                                const selected = sportFilter === f.value;
                                const emoji = f.value !== "ALL" ? SPORT_EMOJI[f.value] : undefined;
                                return (
                                    <Chip
                                        key={f.value}
                                        label={emoji ? `${emoji} ${f.label}` : f.label}
                                        clickable
                                        color={selected ? "primary" : "default"}
                                        onClick={() => setSportFilter(f.value)}
                                        variant={selected ? "filled" : "outlined"}
                                        sx={{
                                            flexShrink: 0,
                                            px: 0.5,
                                            height: 34,
                                            fontSize: "0.875rem",
                                            bgcolor: selected ? undefined : "background.paper",
                                            boxShadow: selected ? 2 : 0,
                                        }}
                                    />
                                );
                            })}
                        </Box>
                    </Box>

                    <Box>
                        <MyJoinedGames sportFilter={sportFilter} />
                    </Box>

                    <Box>
                        <SeriesSectionClient sportFilter={sportFilter} />
                    </Box>

                    <Box>
                        <GamesByCityClient sportFilter={sportFilter} />
                    </Box>

                    <Box>
                        <GamesByFriendsClient sportFilter={sportFilter} />
                    </Box>

                    <Box>
                        <GamesByDateClient
                            initialDate={initialDate}
                            fieldId={fieldId}
                            sportFilter={sportFilter}
                        />
                    </Box>

                </Stack>
            </Container>
        </GameUpdateProvider>
    );
}
