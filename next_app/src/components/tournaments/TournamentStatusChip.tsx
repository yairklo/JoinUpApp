"use client";

import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import { TOURNAMENT_STATUS_TOKENS, type TournamentLocale } from "@/utils/tournament";
import type { TournamentStatus } from "@/types/tournament";

export interface TournamentStatusChipProps {
    status: TournamentStatus;
    locale?: TournamentLocale;
    /** Default `tournament-status-chip`. */
    testId?: string;
    /**
     * Set when the chip is overlaid on a cover image/gradient. Outlined tokens (DRAFT, CANCELLED)
     * have a transparent background and wash out on media, so they get a solid paper fill, a
     * darkened label and a subtle border/blur instead.
     */
    onMedia?: boolean;
}

/** Tournament status as a small MUI Chip: text plus colour, never colour alone (spec 0.3). */
export default function TournamentStatusChip({ status, locale = "he", testId = "tournament-status-chip", onMedia = false }: TournamentStatusChipProps) {
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
            sx={[
                { fontWeight: 700 },
                onMedia && token.variant === "outlined"
                    ? (theme) => {
                          const tone = token.color === "default" ? undefined : theme.palette[token.color];
                          const label = tone ? (theme.palette.mode === "dark" ? tone.light : tone.dark) : theme.palette.text.primary;
                          return {
                              bgcolor: "background.paper",
                              color: label,
                              borderColor: alpha(tone?.main ?? theme.palette.text.primary, 0.5),
                              backdropFilter: "blur(6px)",
                              "& .MuiChip-icon": { color: label },
                          };
                      }
                    : null,
            ]}
        />
    );
}
