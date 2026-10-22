"use client";

import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import type { ConflictGroups } from "@/utils/tournamentManage";

export interface ConflictsPanelProps {
    groups: ConflictGroups;
    /** Match chip clicked: scroll to and highlight that match (id or preview key). */
    onSelectMatch?: (id: string) => void;
}

/** Plain-language conflicts list (spec 11.2). Never shows the server's English message. */
export default function ConflictsPanel({ groups, onSelectMatch }: ConflictsPanelProps) {
    if (groups.total === 0) return null;
    return (
        <Box data-testid="schedule-conflicts" sx={{ border: 1, borderColor: "warning.main", borderRadius: 3, p: 1.5 }}>
            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>{`התנגשויות (${groups.total})`}</Typography>
            <Stack spacing={1.25}>
                {groups.items.map((c, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="flex-start" data-testid={`schedule-conflict-${i}`}>
                        <ReportProblemRoundedIcon fontSize="small" color="warning" aria-hidden sx={{ mt: 0.25 }} />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" fontWeight={700}>{c.title}</Typography>
                            <Typography variant="body2" color="text.secondary">{c.body}</Typography>
                            <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                                {c.matchIds.map((id, k) => (
                                    <Chip
                                        key={id}
                                        size="small"
                                        label={c.numbers[k] !== undefined ? `#${c.numbers[k]}` : "משחק"}
                                        onClick={onSelectMatch ? () => onSelectMatch(id) : undefined}
                                        sx={{ height: 32 }}
                                    />
                                ))}
                            </Stack>
                        </Box>
                    </Stack>
                ))}
            </Stack>
        </Box>
    );
}
