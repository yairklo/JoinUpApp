"use client";

import { useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import InfoOutlined from "@mui/icons-material/InfoOutlined";
import { alpha } from "@mui/material/styles";
import UpdatedCue from "../UpdatedCue";
import { TabEmpty, TabError } from "./TabStates";
import { getStatLabel } from "@joinup/shared/matchStats";
import { useLeaders, useTournament } from "@/hooks/tournaments";
import { leaderPositions } from "@/utils/tournamentViews";
import type { TournamentMatch } from "@/types/tournament";

export interface TopPlayersTabProps {
    tournamentId: string;
    /** Unused here (kept so every tab shares one props shape). */
    canScore?: boolean;
    onScoreMatch?: (match: TournamentMatch) => void;
}

const TOP = 10;
const MORE = 25;

/** Top players tab (spec 13): neutral list (no medals), key switcher, "show more". */
export default function TopPlayersTab({ tournamentId }: TopPlayersTabProps) {
    const { tournament } = useTournament(tournamentId);
    const [key, setKey] = useState<string | undefined>(undefined);
    const [all, setAll] = useState(false);
    const { data, leaders, loading, error, reload, updated } = useLeaders(tournamentId, { key, limit: all ? MORE : TOP });
    const myTeamName = tournament?.myTeam?.name;
    const label = data?.label.he ?? "";
    const keys = data?.keys ?? [];
    const positions = leaderPositions(leaders);

    return (
        <Stack spacing={2} data-testid="leaders-tab" sx={{ maxWidth: 640, mx: "auto", width: "100%" }}>
            <Box>
                <Typography variant="h6" fontWeight={800}>
                    שחקנים בולטים
                </Typography>
                <Stack direction="row" spacing={0.5} alignItems="center">
                    <InfoOutlined aria-hidden sx={{ fontSize: 14, color: "text.secondary" }} />
                    <Typography variant="caption" color="text.secondary">
                        לפי דיווחי מנהלי הטורניר. שחקנים שבחרו להסתיר סטטיסטיקות לא מופיעים.
                    </Typography>
                </Stack>
            </Box>
            <UpdatedCue show={updated} />
            {keys.length > 1 && (
                <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} role="group" aria-label="סוג סטטיסטיקה">
                    {keys.map((k) => (
                        <Chip
                            key={k}
                            label={k === data?.key ? label : tournament ? getStatLabel(tournament.sport, k, "he", 2) : k}
                            clickable
                            color={k === data?.key ? "primary" : "default"}
                            onClick={() => {
                                setKey(k);
                                setAll(false);
                            }}
                            data-testid={`leaders-key-${k}`}
                            sx={{ flexShrink: 0 }}
                        />
                    ))}
                </Stack>
            )}

            {loading && !data ? (
                <Stack spacing={1} data-testid="leaders-loading" aria-busy="true">
                    {Array.from({ length: 5 }, (_, i) => (
                        <Skeleton key={i} variant="rounded" height={56} />
                    ))}
                </Stack>
            ) : error && !data ? (
                <TabError error={error} onRetry={reload} />
            ) : keys.length === 0 ? (
                <TabEmpty testId="leaders-empty">עוד אין סטטיסטיקות. הן יופיעו כאן אחרי שמנהלי הטורניר יזינו אותן.</TabEmpty>
            ) : leaders.length === 0 ? (
                <TabEmpty testId="leaders-empty">{`אף אחד עוד לא רשם ${label}`}</TabEmpty>
            ) : (
                <Stack component="ol" sx={{ listStyle: "none", m: 0, p: 0 }}>
                    {leaders.map((r, i) => {
                        const mine = !!myTeamName && r.teamName === myTeamName;
                        return (
                            <Stack
                                component="li"
                                key={r.userId}
                                direction="row"
                                alignItems="center"
                                spacing={1.5}
                                data-testid={`leaders-row-${r.userId}`}
                                sx={(theme) => ({
                                    minHeight: 56,
                                    px: 1,
                                    borderRadius: 2,
                                    bgcolor: mine ? alpha(theme.palette.primary.main, 0.08) : undefined,
                                })}
                            >
                                <Typography variant="body2" color="text.secondary" sx={{ width: 24, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                                    <bdi dir="ltr">{positions[i]}</bdi>
                                </Typography>
                                <Avatar src={r.imageUrl ?? undefined} alt="" sx={{ width: 40, height: 40 }} />
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="body2" fontWeight={700} noWrap title={r.name}>
                                        {r.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary" noWrap component="div" title={r.teamName}>
                                        {r.teamName}
                                    </Typography>
                                </Box>
                                <Box sx={{ textAlign: "end" }}>
                                    <Typography sx={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{r.value}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {`ב-${r.matches} משחקים`}
                                    </Typography>
                                </Box>
                            </Stack>
                        );
                    })}
                </Stack>
            )}
            {!all && leaders.length >= TOP && (
                <Button onClick={() => setAll(true)} sx={{ alignSelf: "center" }}>
                    הצגת עוד
                </Button>
            )}
        </Stack>
    );
}
