"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import { keyframes } from "@mui/material/styles";
import { MATCH_STATUS_TOKENS, type TournamentLocale } from "@/utils/tournament";
import type { MatchStatus } from "@/types/tournament";

const pulse = keyframes`0%{opacity:1}50%{opacity:.35}100%{opacity:1}`;

export interface MatchStatusChipProps {
    status: MatchStatus;
    locale?: TournamentLocale;
    /** Default `match-status-chip`. */
    testId?: string;
}

/**
 * Match status chip (spec 0.3). Renders nothing for SCHEDULED and FINISHED (the time / score is the signal).
 * LIVE gets a 6px dot that pulses unless the user prefers reduced motion.
 */
export default function MatchStatusChip({ status, locale = "he", testId = "match-status-chip" }: MatchStatusChipProps) {
    const token = MATCH_STATUS_TOKENS[status];
    if (!token) return null;
    return (
        <Chip
            size="small"
            data-testid={testId}
            data-status={status}
            color={token.color}
            variant={token.variant}
            label={token.label[locale]}
            icon={
                token.icon === "liveDot" ? (
                    <Box
                        component="span"
                        aria-hidden
                        sx={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            bgcolor: "currentColor",
                            animation: `${pulse} 1.4s ease-in-out infinite`,
                            "@media (prefers-reduced-motion: reduce)": { animation: "none" },
                        }}
                    />
                ) : undefined
            }
            sx={{ fontWeight: 700, "& .MuiChip-icon": { ml: 1, mr: -0.25 } }}
        />
    );
}
