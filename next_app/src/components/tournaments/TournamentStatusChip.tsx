"use client";

import Chip from "@mui/material/Chip";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import { TOURNAMENT_STATUS_TOKENS, type TournamentLocale } from "@/utils/tournament";
import type { TournamentStatus } from "@/types/tournament";

export interface TournamentStatusChipProps {
    status: TournamentStatus;
    locale?: TournamentLocale;
    /** Default `tournament-status-chip`. */
    testId?: string;
}

/** Tournament status as a small MUI Chip: text plus colour, never colour alone (spec 0.3). */
export default function TournamentStatusChip({ status, locale = "he", testId = "tournament-status-chip" }: TournamentStatusChipProps) {
    const token = TOURNAMENT_STATUS_TOKENS[status];
    if (!token) return null;
    return (
        <Chip
            size="small"
            data-testid={testId}
            data-status={status}
            color={token.color}
            variant={token.variant}
            label={token.label[locale]}
            icon={token.icon === "trophy" ? <EmojiEventsRounded /> : undefined}
            sx={{ fontWeight: 700 }}
        />
    );
}
