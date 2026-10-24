"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import StandingsTable from "../StandingsTable";
import StandingsOverrideDialog from "../StandingsOverrideDialog";
import { displayGroupName, displayStageName } from "@/utils/tournamentViews";
import UpdatedCue from "../UpdatedCue";
import { TabEmpty, TabError, TabSkeleton } from "./TabStates";
import { useStandings, useStandingsOverride, useTournament } from "@/hooks/tournaments";
import { tournamentErrorMessage } from "@/services/api/tournaments";
import type { StandingsOverrideInput, StandingsTableData, TournamentMatch } from "@/types/tournament";

export interface StandingsTabProps {
    tournamentId: string;
    /** Unused here (kept so every tab shares one props shape). */
    canScore?: boolean;
    onScoreMatch?: (match: TournamentMatch) => void;
}

/** Standings tab (spec 8): one table per stage/group, compact on phones, full from 600px. */
export default function StandingsTab({ tournamentId }: StandingsTabProps) {
    const router = useRouter();
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up("sm"));
    const { tournament } = useTournament(tournamentId);
    const { tables, loading, error, reload, updated } = useStandings(tournamentId);
    const override = useStandingsOverride(tournamentId);
    const [full, setFull] = useState(false);
    const [group, setGroup] = useState<string | null>(null);
    const [editing, setEditing] = useState<StandingsTableData | null>(null);
    const [resetting, setResetting] = useState<StandingsTableData | null>(null);
    const canManage = !!tournament?.capabilities.canManage;
    const overrideError = tournamentErrorMessage(override.error) ?? (override.error ? "לא הצלחנו לשמור את הדירוג. נסו שוב." : null);

    const saveOverride = async (input: StandingsOverrideInput) => {
        const res = await override.save(input);
        if (res) {
            setEditing(null);
            void reload();
        }
    };
    const confirmReset = async () => {
        if (!resetting) return;
        const res = await override.reset({ stageId: resetting.stageId, groupId: resetting.groupId });
        if (res) {
            setResetting(null);
            setEditing(null);
            void reload();
        }
    };

    if (loading && tables.length === 0) return <div data-testid="standings-tab"><TabSkeleton rows={7} height={48} /></div>;
    if (error && tables.length === 0) return <div data-testid="standings-tab"><TabError error={error} onRetry={reload} /></div>;
    if (tables.length === 0) return <div data-testid="standings-tab"><TabEmpty>הטבלה תופיע אחרי שייבנה לוח המשחקים</TabEmpty></div>;

    const mode = wide || full ? "full" : "compact";
    const advance = tournament?.rules?.advancePerGroup ?? null;
    const manyGroups = !wide && tables.length > 2;
    const keyOf = (t: (typeof tables)[number]) => `${t.stageId}-${t.groupId ?? "all"}`;
    const selected = manyGroups ? tables.find((t) => keyOf(t) === group) ?? tables[0] : null;
    const shown = selected ? [selected] : tables;

    return (
        <Stack spacing={2.5} data-testid="standings-tab">
            <UpdatedCue show={updated} />
            {error && <TabError error={error} onRetry={reload} />}
            {manyGroups && (
                <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 0.5 }} role="group" aria-label="בחירת בית">
                    {tables.map((t) => (
                        <Chip
                            key={keyOf(t)}
                            label={t.groupName ? `בית ${displayGroupName(t.groupName)}` : displayStageName(t.stageName)}
                            clickable
                            color={selected && keyOf(selected) === keyOf(t) ? "primary" : "default"}
                            onClick={() => setGroup(keyOf(t))}
                            data-testid={`standings-group-${t.groupId ?? t.stageId}`}
                            sx={{ flexShrink: 0 }}
                        />
                    ))}
                </Stack>
            )}
            {shown.map((t) => (
                <StandingsTable
                    key={keyOf(t)}
                    table={t}
                    myTeamId={tournament?.myTeam?.id ?? null}
                    advanceCount={t.groupId ? advance : null}
                    mode={mode}
                    sport={tournament?.sport}
                    tournamentCompleted={tournament?.status === "COMPLETED"}
                    canManage={canManage}
                    onSetManualRank={() => router.push(`/tournaments/${tournamentId}/manage`)}
                    onEditStandings={canManage ? (tb) => { override.clearError(); setEditing(tb); } : undefined}
                    onResetStandings={canManage ? (tb) => { override.clearError(); setResetting(tb); } : undefined}
                />
            ))}
            <StandingsOverrideDialog
                open={!!editing}
                table={editing}
                saving={override.pending}
                error={editing ? overrideError : null}
                onClose={() => { if (!override.pending) setEditing(null); }}
                onSave={(input) => { void saveOverride(input); }}
                onReset={editing?.manualOrder ? () => { setResetting(editing); } : undefined}
            />
            <Dialog open={!!resetting} onClose={override.pending ? undefined : () => setResetting(null)} dir="rtl" data-testid="standings-reset-dialog">
                <DialogTitle>איפוס לדירוג אוטומטי</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        לחזור לדירוג האוטומטי? הסדר הידני והתאמות הנקודות יימחקו. תוצאות המשחקים לא משתנות.
                    </Typography>
                    {resetting && overrideError && (
                        <Typography variant="body2" color="error" sx={{ mt: 1 }}>{overrideError}</Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setResetting(null)} disabled={override.pending}>ביטול</Button>
                    <Button variant="contained" onClick={() => { void confirmReset(); }} disabled={override.pending} data-testid="standings-reset-confirm">
                        איפוס
                    </Button>
                </DialogActions>
            </Dialog>
            {!wide && (
                <FormControlLabel
                    sx={{ alignSelf: "flex-start" }}
                    control={<Switch checked={full} onChange={(e) => setFull(e.target.checked)} inputProps={{ "aria-label": "כל העמודות" }} data-testid="standings-mode-toggle" />}
                    label={<Typography variant="body2">כל העמודות</Typography>}
                />
            )}
        </Stack>
    );
}
