"use client";

import React from "react";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import TuneRoundedIcon from "@mui/icons-material/TuneRounded";

/**
 * Manager-only control panel shell on the game page (edit details, weekly group, cancel).
 * Client component because its header gradient reads the theme through an `sx` callback, which a
 * server component (games/[id]/page.tsx) cannot pass across the client boundary.
 * Keeps id="game-manage": the manager bar in GameLiveSection scrolls here.
 */
export default function GameManagePanel({ children }: { children: React.ReactNode }) {
    return (
        <Card
            id="game-manage"
            elevation={0}
            dir="rtl"
            sx={{ mt: 2, borderRadius: 5, border: "1px solid", borderColor: "divider", overflow: "hidden", scrollMarginTop: 80 }}
        >
            <Box
                sx={(t) => ({
                    px: { xs: 2, sm: 2.5 },
                    py: 1.75,
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    // Theme contrast text: white on the light-mode green, dark ink on dark mode's brighter green.
                    color: t.palette.primary.contrastText,
                    background: `linear-gradient(135deg, ${t.palette.primary.dark} 0%, ${t.palette.primary.main} 100%)`,
                })}
            >
                <Box
                    sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        bgcolor: "rgba(255,255,255,0.18)",
                    }}
                >
                    <TuneRoundedIcon fontSize="small" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h6" fontWeight={800} lineHeight={1.2}>
                        לוח ניהול
                    </Typography>
                    <Typography variant="body2" sx={{ opacity: 0.85 }}>
                        עריכת פרטים, קבוצה שבועית וביטול המשחק
                    </Typography>
                </Box>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 2.5 } }}>{children}</Box>
        </Card>
    );
}
