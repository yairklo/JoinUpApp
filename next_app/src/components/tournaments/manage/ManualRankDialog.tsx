"use client";

import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TeamBadge from "../TeamBadge";
import { manualRankPatches, tiedRows } from "@/utils/tournamentManage";
import { displayGroupName } from "@/utils/tournamentViews";
import type { StandingsTableData } from "@/types/tournament";
import ReorderList from "./ReorderList";

export interface ManualRankDialogProps {
    open: boolean;
    table: StandingsTableData | null;
    saving: boolean;
    error?: string | null;
    onSave: (patches: Array<{ teamId: string; manualRank: number }>) => void;
    onClose: () => void;
}

/** Break a tie the standings cannot separate (spec 11.1): reorder only the tied teams. */
export default function ManualRankDialog({ open, table, saving, error, onSave, onClose }: ManualRankDialogProps) {
    const tied = useMemo(() => tiedRows(table?.rows ?? []), [table]);
    const [order, setOrder] = useState<string[]>([]);
    useEffect(() => {
        if (open) setOrder(tied.map((r) => r.team.id));
    }, [open, tied]);
    const byId = new Map(tied.map((r) => [r.team.id, r]));
    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth dir="rtl" data-testid="manual-rank-dialog">
            <DialogTitle>{`קביעת סדר בשוויון${table?.groupName ? ` · ${displayGroupName(table.groupName)}` : ""}`}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    הקבוצות שוות בכל שוברי השוויון. הסדר שתקבעו יקבע מי עולה לשלב הבא.
                </Typography>
                {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
                <ReorderList
                    testId="manual-rank-list"
                    disabled={saving}
                    startAt={tied.length ? Math.min(...tied.map((r) => r.rank)) : 1}
                    onChange={setOrder}
                    items={order.map((id) => {
                        const r = byId.get(id);
                        return {
                            id,
                            label: r?.team.name ?? "",
                            content: r ? (
                                <Stack>
                                    <TeamBadge team={r.team} />
                                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                        {`מש׳ ${r.played} · נק׳ ${r.points} · ${r.gf}:${r.ga}`}
                                    </Typography>
                                </Stack>
                            ) : null,
                        };
                    })}
                />
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>ביטול</Button>
                <Button
                    variant="contained"
                    disabled={saving || order.length < 2}
                    startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                    onClick={() => onSave(manualRankPatches(tied, order))}
                    data-testid="manual-rank-save"
                >
                    שמירה
                </Button>
            </DialogActions>
        </Dialog>
    );
}
