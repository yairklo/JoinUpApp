"use client";

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getStatLabel } from "@joinup/shared/matchStats";
import type { MatchHistoryResult } from "@/types/matchResult";
import { outcomeSx } from "@/components/matchOutcomeStyles";
import {
    OUTCOME_LABEL_HE,
    OUTCOME_LETTER_HE,
    formatStatText,
    orderedStatKeys,
    parseScore,
} from "@/utils/matchStatsFormat";

interface Props {
    gameId: string;
    sport?: string | null;
    result: MatchHistoryResult | null | undefined;
}

/**
 * Outcome pill + up to 2 of the player's stats for one match-history row (design spec section 4).
 * Renders nothing when there is no result or nothing to show. The score is rendered as separate
 * flex children (never "3-2") so my score stays at the reading-start edge in RTL.
 */
export default function MatchResultBadge({ gameId, sport, result }: Props) {
    if (!result) return null;
    const score = parseScore(result.score);
    const rounds = result.rounds;
    const roundTotal = rounds ? rounds.wins + rounds.draws + rounds.losses : 0;
    const sportKey = sport || "";
    const statKeys = orderedStatKeys(sportKey, result.myStats || {}).slice(0, 2);
    if (!score && statKeys.length === 0 && roundTotal === 0) return null;

    const statTexts = statKeys.map((k) => formatStatText(sportKey, k, result.myStats[k]));
    const outcomeLabel = result.outcome ? OUTCOME_LABEL_HE[result.outcome] : "";
    const ariaLabel = [
        score ? `${outcomeLabel} ${score[0]}–${score[1]}`.trim() : "",
        ...statKeys.map((k) => `${result.myStats[k]} ${getStatLabel(sportKey, k, "he", result.myStats[k])}`),
    ]
        .filter(Boolean)
        .join(", ");

    return (
        <Stack
            data-testid={`history-result-badge-${gameId}`}
            role="img"
            aria-label={ariaLabel}
            alignItems="center"
            spacing={0.25}
            sx={{ flexShrink: 0, maxWidth: { xs: 96, sm: 112 } }}
        >
            {roundTotal > 0 && !score && (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.5}
                    aria-label={`${rounds!.wins} ניצחונות, ${rounds!.draws} תיקו, ${rounds!.losses} הפסדים בסיבובים`}
                    sx={{ height: 28, px: 1.25, borderRadius: 999, fontSize: 13, fontWeight: 700, bgcolor: "action.hover" }}
                >
                    <span>{rounds!.wins}</span>
                    <span>–</span>
                    <span>{rounds!.draws}</span>
                    <span>–</span>
                    <span>{rounds!.losses}</span>
                </Stack>
            )}
            {score && (
                <Stack
                    direction="row"
                    alignItems="center"
                    spacing={0.75}
                    aria-hidden
                    sx={[
                        {
                            height: 28,
                            px: 1.25,
                            borderRadius: 999,
                            fontSize: 13,
                            fontWeight: 700,
                            fontVariantNumeric: "tabular-nums",
                        },
                        outcomeSx(result.outcome),
                    ]}
                >
                    {result.outcome && <span>{OUTCOME_LETTER_HE[result.outcome]}</span>}
                    <span>{score[0]}</span>
                    <span>–</span>
                    <span>{score[1]}</span>
                </Stack>
            )}
            {statTexts.length > 0 && (
                <Box aria-hidden sx={{ maxWidth: "100%" }}>
                    {statTexts.map((t, i) => (
                        <Typography
                            key={statKeys[i]}
                            variant="caption"
                            color="text.secondary"
                            noWrap
                            display={{ xs: i === 0 ? "block" : "none", sm: "block" }}
                            textAlign="center"
                            title={t}
                        >
                            {t}
                        </Typography>
                    ))}
                </Box>
            )}
        </Stack>
    );
}
