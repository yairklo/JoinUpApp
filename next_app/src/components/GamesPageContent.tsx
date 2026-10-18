"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Container from "@mui/material/Container";
import { alpha } from "@mui/material/styles";

import MyJoinedGames from "@/components/MyJoinedGames";
import GamesByDateClient from "@/components/GamesByDateClient";
import GamesByFriendsClient from "@/components/GamesByFriendsClient";
import GamesByCityClient from "@/components/GamesByCityClient";
import SeriesSectionClient from "@/components/SeriesSectionClient";
import LoginInventoryToast from "@/components/LoginInventoryToast";
import SportFilterBar from "@/components/SportFilterBar";
import { SportFilter } from "@/utils/sports";


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

                    {/* Sticky sport filters. Phones: one full-bleed glass strip under the header.
                        Desktop: a floating glass pill that follows the scroll under the (68px)
                        header, so the filter is reachable from any rail without scrolling back. */}
                    <Box
                        sx={(t) => ({
                            position: "sticky",
                            top: { xs: 56, md: 76 },
                            zIndex: 5,
                            // !important: Stack resets direct children's margins, which would undo the full bleed
                            marginInline: { xs: "-16px !important", sm: "0 !important" },
                            alignSelf: { md: "flex-start" },
                            px: { xs: 2, md: 1.25 },
                            py: { xs: 1, md: 1 },
                            borderRadius: { md: 999 },
                            bgcolor: alpha(t.palette.background.default, 0.82),
                            backdropFilter: "saturate(180%) blur(14px)",
                            WebkitBackdropFilter: "saturate(180%) blur(14px)",
                            boxShadow: {
                                xs: `inset 0 -1px 0 ${t.palette.divider}`,
                                md: `0 0 0 1px ${t.palette.divider}, 0 8px 24px -10px rgba(15,23,42,0.18)`,
                            },
                            mb: { md: -2 },
                        })}
                    >
                        <SportFilterBar value={sportFilter} onChange={setSportFilter} />
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
            <LoginInventoryToast />
        </GameUpdateProvider>
    );
}
