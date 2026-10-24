"use client";

import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import TeamBadge from "./TeamBadge";
import ReorderList from "./manage/ReorderList";
import { displayGroupName, displayStageName } from "@/utils/tournamentViews";
import type { StandingsOverrideInput, StandingsRow, StandingsTableData } from "@/types/tournament";

export interface StandingsOverrideDialogProps {
    open: boolean;
    table: StandingsTableData | null;
    saving: boolean;
    error?: string | null;
    onSave: (input: StandingsOverrideInput) => void;
    onReset?: () => void;
    onClose: () => void;
}

type Draft = { points: string; reason: string };

function draftFromRow(row: StandingsRow): Draft {
    const d = row.pointsAdjustment;
    return { points: typeof d === "number" && d !== 0 ? String(d) : "", reason: row.adjustmentReason ?? "" };
}

/** Empty is 0. Anything else must be a non-zero integer in range, or `null` when the text is not a number yet. */
function parsePoints(raw: string): number | null {
    const s = raw.trim().replace("−", "-");
    if (!s) return 0;
    if (!/^-?\d+$/.test(s)) return null;
    const n = Number(s);
    if (n < -100 || n > 100) return null;
    return n;
}

function titleOf(table: StandingsTableData): string {
    return table.groupName ? `בית ${displayGroupName(table.groupName)}` : displayStageName(table.stageName);
}

/**
 * Manager editor for one group/league table.
 * Saving publishes `teamOrder` until reset. Points adjustments are added to the automatic
 * points and do not change the order. New match results keep updating the automatic columns.
 */
export default function StandingsOverrideDialog({ open, table, saving, error, onSave, onReset, onClose }: StandingsOverrideDialogProps) {
    const [order, setOrder] = useState<string[]>([]);
    const [drafts, setDrafts] = useState<Record<string, Draft>>({});
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !table) return;
        setOrder(table.rows.map((r) => r.team.id));
        setDrafts(Object.fromEntries(table.rows.map((r) => [r.team.id, draftFromRow(r)])));
        setLocalError(null);
    }, [open, table]);

    const byId = new Map((table?.rows ?? []).map((r) => [r.team.id, r]));

    const save = () => {
        if (!table) return;
        const adjustments: StandingsOverrideInput["adjustments"] = [];
        for (const id of order) {
            const draft = drafts[id] ?? { points: "", reason: "" };
            const points = parsePoints(draft.points);
            if (points === null) {
                setLocalError("התאמת הנקודות צריכה להיות מספר שלם בין 100− ל-100, או ריק.");
                return;
            }
            if (points !== 0 && !draft.reason.trim()) {
                setLocalError("כשמשנים נקודות צריך לכתוב סיבה, למשל קנס או הפסד טכני.");
                return;
            }
            if (points !== 0) adjustments.push({ teamId: id, points, reason: draft.reason.trim() });
        }
        setLocalError(null);
        onSave({ stageId: table.stageId, groupId: table.groupId, teamOrder: order, adjustments });
    };

    const setDraft = (id: string, patch: Partial<Draft>) => {
        setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { points: "", reason: "" }), ...patch } }));
    };

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth dir="rtl" data-testid="standings-override-dialog">
            <DialogTitle>{table ? `עריכת דירוג · ${titleOf(table)}` : "עריכת דירוג"}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                    הסדר שתשמרו נשאר עד לאיפוס, גם אחרי תוצאות חדשות. משחקים, שערים ונקודות אוטומטיות ממשיכים להתעדכן. התאמת נקודות מתווספת לנקודות האוטומטיות ולא משנה את הסדר.
                </Typography>
                {(localError || error) && (
                    <Alert severity="error" sx={{ mb: 1.5 }}>
                        {localError || error}
                    </Alert>
                )}
                <ReorderList
                    testId="standings-override-list"
                    disabled={saving}
                    onChange={setOrder}
                    items={order.map((id) => {
                        const row = byId.get(id);
                        const draft = drafts[id] ?? { points: "", reason: "" };
                        return {
                            id,
                            label: row?.team.name ?? "",
                            content: row ? (
                                <Stack spacing={0.75} sx={{ py: 0.75, minWidth: 0 }}>
                                    <TeamBadge team={row.team} />
                                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                        {`אוטומטי: ${row.autoPoints ?? row.points} נק׳ · מש׳ ${row.played}`}
                                    </Typography>
                                    <Stack direction="row" spacing={1}>
                                        <TextField
                                            label="התאמת נקודות"
                                            size="small"
                                            value={draft.points}
                                            disabled={saving}
                                            onChange={(e) => setDraft(id, { points: e.target.value })}
                                            inputProps={{ inputMode: "numeric", "data-testid": `standings-override-points-${id}`, dir: "ltr" }}
                                            sx={{ width: 140 }}
                                        />
                                        <TextField
                                            label="סיבה"
                                            size="small"
                                            value={draft.reason}
                                            disabled={saving}
                                            onChange={(e) => setDraft(id, { reason: e.target.value })}
                                            placeholder="קנס, הפסד טכני…"
                                            inputProps={{ maxLength: 200, "data-testid": `standings-override-reason-${id}` }}
                                            sx={{ flex: 1 }}
                                        />
                                    </Stack>
                                </Stack>
                            ) : null,
                        };
                    })}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, justifyContent: "space-between" }}>
                {table?.manualOrder && onReset ? (
                    <Button color="inherit" disabled={saving} onClick={onReset} data-testid="standings-override-reset">
                        איפוס לדירוג אוטומטי
                    </Button>
                ) : (
                    <span />
                )}
                <Stack direction="row" spacing={1}>
                    <Button onClick={onClose} disabled={saving}>ביטול</Button>
                    <Button
                        variant="contained"
                        disabled={saving || order.length === 0}
                        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
                        onClick={save}
                        data-testid="standings-override-save"
                    >
                        שמירה
                    </Button>
                </Stack>
            </DialogActions>
        </Dialog>
    );
}
