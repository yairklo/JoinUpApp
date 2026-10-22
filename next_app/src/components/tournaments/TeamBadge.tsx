"use client";

import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { TeamLite } from "@/types/tournament";

export interface TeamBadgeProps {
    /** `null` renders only the placeholder ring + `fallbackName`. */
    team: Pick<TeamLite, "name" | "color" | "logoUrl"> | null;
    /** Logo size in px (spec 0.7). Without a logo a 10px swatch is used regardless. Default 24. */
    size?: 24 | 32 | 40;
    /** Name clamp: 1 line in tables, 2 in cards. Default 1. */
    lines?: 1 | 2;
    hideName?: boolean;
    /** Dashed ring instead of the swatch + italic secondary text (an unresolved slot, spec 0.4). */
    placeholder?: boolean;
    /** Used when `team` is null (placeholder text). */
    fallbackName?: string;
    /** Winner: weight 800. Loser: `text.secondary`. */
    emphasis?: "winner" | "loser";
    /** Cancelled matches strike the name through. */
    strikeThrough?: boolean;
    /** Default `team-badge`. */
    testId?: string;
}

/** Team logo (circle, 1px divider ring) or 10px colour swatch with ring, followed by the name (spec 0.7, F1 1.2). */
export default function TeamBadge({
    team,
    size = 24,
    lines = 1,
    hideName,
    placeholder,
    fallbackName,
    emphasis,
    strikeThrough,
    testId = "team-badge",
}: TeamBadgeProps) {
    const name = team?.name ?? fallbackName ?? "";
    const isPlaceholder = placeholder || !team;
    const mark =
        isPlaceholder || !team ? (
            <Box
                aria-hidden
                sx={{ width: 10, height: 10, flexShrink: 0, borderRadius: "50%", border: "1px dashed", borderColor: "text.disabled" }}
            />
        ) : team.logoUrl ? (
            <Avatar src={team.logoUrl} alt="" sx={{ width: size, height: size, flexShrink: 0, border: 1, borderColor: "divider" }} />
        ) : (
            <Box
                aria-hidden
                sx={{
                    width: 10,
                    height: 10,
                    flexShrink: 0,
                    borderRadius: "50%",
                    border: 1,
                    borderColor: "divider",
                    bgcolor: team.color || "text.disabled",
                }}
            />
        );
    return (
        <Stack direction="row" alignItems="center" spacing={1} data-testid={testId} sx={{ minWidth: 0 }}>
            {mark}
            {!hideName && (
                <Typography
                    component="span"
                    variant="body2"
                    title={name}
                    sx={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: lines,
                        wordBreak: "break-word",
                        fontWeight: emphasis === "winner" ? 800 : 600,
                        fontStyle: isPlaceholder ? "italic" : "normal",
                        color: isPlaceholder || emphasis === "loser" ? "text.secondary" : "text.primary",
                        textDecoration: strikeThrough ? "line-through" : "none",
                    }}
                >
                    {name}
                </Typography>
            )}
        </Stack>
    );
}
