"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { MatchSide } from "@/utils/tournament";

export interface ScoreClusterProps {
    homeScore: number | null | undefined;
    awayScore: number | null | undefined;
    homePenalties?: number | null;
    awayPenalties?: number | null;
    /** Tennis sets, home number first in each pair. Shows a mini row under the cluster. */
    sets?: ReadonlyArray<readonly [number, number]> | null;
    /** Bold the winning side's number. */
    winner?: MatchSide | null;
    /** Big scoreboard uses a colon, compact places an en dash. Default colon. */
    separator?: ":" | "–";
    size?: "lg" | "md" | "sm";
    /** Shown instead of numbers when there is no score (kickoff time, en dash). */
    placeholder?: string;
    /** Screen-reader text, e.g. from scoreAriaLabel(). The visual spans are then aria-hidden. */
    ariaLabel?: string;
    /** Default `score-cluster`. */
    testId?: string;
}

const FONT = { lg: 32, md: 20, sm: 15 } as const;
const GAP = { lg: 1.5, md: 1, sm: 0.5 } as const;
const tabular = { fontVariantNumeric: "tabular-nums" } as const;

/**
 * Score between two team labels. Per F1 1.1 the home number, separator and away number are separate flex
 * children (never one string), so home sits at the reading-start edge in RTL. Penalties trail each number
 * as a small "(4)". Tennis `sets` render as separate spans too.
 */
export default function ScoreCluster({
    homeScore,
    awayScore,
    homePenalties,
    awayPenalties,
    sets,
    winner,
    separator = ":",
    size = "md",
    placeholder,
    ariaLabel,
    testId = "score-cluster",
}: ScoreClusterProps) {
    const hasScore = homeScore != null && awayScore != null;
    const hasPens = hasScore && homePenalties != null && awayPenalties != null;
    const num = (n: number, side: MatchSide) => (
        <Typography
            component="span"
            sx={{
                ...tabular,
                fontSize: FONT[size],
                lineHeight: 1.1,
                fontWeight: winner === side ? 800 : 600,
                color: winner && winner !== side ? "text.secondary" : "text.primary",
            }}
        >
            {n}
        </Typography>
    );
    const pen = (n: number) => (
        <Typography component="span" variant="caption" color="text.secondary" sx={tabular}>
            ({n})
        </Typography>
    );
    return (
        <Stack alignItems="center" spacing={0.25} data-testid={testId} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
            {hasScore ? (
                <Stack direction="row" alignItems="center" spacing={GAP[size]} aria-hidden={ariaLabel ? true : undefined}>
                    <Stack direction="row" alignItems="baseline" spacing={0.5} data-testid={`${testId}-home`}>
                        {num(homeScore, "home")}
                        {hasPens && pen(homePenalties as number)}
                    </Stack>
                    <Typography component="span" sx={{ ...tabular, fontSize: FONT[size], lineHeight: 1.1, color: "text.secondary" }}>
                        {separator}
                    </Typography>
                    <Stack direction="row" alignItems="baseline" spacing={0.5} data-testid={`${testId}-away`}>
                        {num(awayScore, "away")}
                        {hasPens && pen(awayPenalties as number)}
                    </Stack>
                </Stack>
            ) : (
                <Typography component="span" sx={{ ...tabular, fontSize: FONT[size], color: "text.secondary", fontWeight: 600 }}>
                    {placeholder ?? "–"}
                </Typography>
            )}
            {sets && sets.length > 0 && (
                <Stack direction="row" spacing={1} aria-hidden data-testid={`${testId}-sets`}>
                    {sets.map(([h, a], i) => (
                        <Stack key={i} direction="row" alignItems="center" spacing={0.25} sx={{ ...tabular, fontSize: 12 }}>
                            <Box component="span" sx={{ fontWeight: h > a ? 800 : 400 }}>
                                {h}
                            </Box>
                            <Box component="span" sx={{ color: "text.secondary" }}>
                                –
                            </Box>
                            <Box component="span" sx={{ fontWeight: a > h ? 800 : 400 }}>
                                {a}
                            </Box>
                        </Stack>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}
