import React from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";

/**
 * One empty/zero-state pattern for the whole app: tinted icon tile, a short title that says
 * what's missing, an optional one-line hint, and at most one primary + one secondary action.
 * `compact` lays it out as a single row to sit inside a horizontal rail without towering
 * over the cards around it; the default stacks centered for full-page/section states.
 */
export default function EmptyState({
    icon,
    title,
    description,
    actions,
    compact = false,
    accent,
}: {
    icon: React.ReactNode;
    title: string;
    description?: string;
    actions?: React.ReactNode;
    compact?: boolean;
    /** Icon tile color; defaults to the theme primary. */
    accent?: string;
}) {
    return (
        <Box
            sx={(t) => {
                const c = accent || t.palette.primary.main;
                return {
                    width: "100%",
                    borderRadius: 5,
                    border: "1px dashed",
                    borderColor: alpha(t.palette.text.primary, 0.14),
                    bgcolor: alpha(t.palette.background.paper, t.palette.mode === "dark" ? 0.5 : 0.7),
                    px: compact ? 2 : 3,
                    py: compact ? 2 : 4,
                    display: "flex",
                    flexDirection: compact ? { xs: "column", sm: "row" } : "column",
                    alignItems: compact ? { xs: "flex-start", sm: "center" } : "center",
                    textAlign: compact ? "start" : "center",
                    gap: compact ? 1.75 : 1.5,
                    "& .empty-icon": {
                        bgcolor: alpha(c, 0.1),
                        color: c,
                    },
                };
            }}
        >
            <Box
                className="empty-icon"
                aria-hidden
                sx={{
                    width: compact ? 44 : 56,
                    height: compact ? 44 : 56,
                    borderRadius: compact ? "14px" : "18px",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    "& svg": { fontSize: compact ? 22 : 28 },
                }}
            >
                {icon}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: compact ? "0.95rem" : "1.05rem", lineHeight: 1.3 }}>
                    {title}
                </Typography>
                {description && (
                    <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mt: 0.5, lineHeight: 1.5, maxWidth: compact ? "none" : 380, mx: compact ? 0 : "auto" }}
                    >
                        {description}
                    </Typography>
                )}
            </Box>
            {actions && (
                <Stack direction="row" spacing={1} sx={{ flexShrink: 0, mt: compact ? 0 : 1 }}>
                    {actions}
                </Stack>
            )}
        </Box>
    );
}
