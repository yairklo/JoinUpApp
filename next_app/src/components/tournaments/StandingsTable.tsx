"use client";

import { Fragment, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PanToolAltRounded from "@mui/icons-material/PanToolAltRounded";
import { alpha } from "@mui/material/styles";
import type { SxProps, Theme } from "@mui/material/styles";
import TeamBadge from "./TeamBadge";
import { formatGd, isQualifier, rankLabel } from "@/utils/tournamentViews";
import type { StandingsRow, StandingsTableData } from "@/types/tournament";

export interface StandingsTableProps {
    table: StandingsTableData;
    myTeamId?: string | null;
    /** Rows with rank <= advanceCount get the qualification marker. */
    advanceCount?: number | null;
    /** compact (5 columns, tap a row for W/D/L) or full (10 columns). */
    mode?: "compact" | "full";
    canManage?: boolean;
    onSetManualRank?: (table: StandingsTableData) => void;
    /** The tournament is COMPLETED (a complete league table then crowns row 1). */
    tournamentCompleted?: boolean;
    sport?: "SOCCER" | "BASKETBALL" | "TENNIS";
}

const RANK_W = 32;
const tabular = { fontVariantNumeric: "tabular-nums" } as const;

const COLS: Array<{ key: "played" | "won" | "drawn" | "lost" | "gf" | "ga" | "gd" | "points"; head: string; title: string; compact: boolean; w: number }> = [
    { key: "played", head: "מש׳", title: "משחקים", compact: true, w: 34 },
    { key: "won", head: "נ׳", title: "ניצחונות", compact: false, w: 34 },
    { key: "drawn", head: "ת׳", title: "תיקו", compact: false, w: 34 },
    { key: "lost", head: "ה׳", title: "הפסדים", compact: false, w: 34 },
    { key: "gf", head: "זכות", title: "זכות", compact: false, w: 42 },
    { key: "ga", head: "חובה", title: "חובה", compact: false, w: 42 },
    { key: "gd", head: "הפרש", title: "הפרש", compact: true, w: 42 },
    { key: "points", head: "נק׳", title: "נקודות", compact: true, w: 42 },
];

function titleOf(t: StandingsTableData): string {
    return t.groupName ? `בית ${t.groupName}` : t.stageName;
}

/** One standings table (spec 8). Compact on phones, full from 600px. Props only. */
export default function StandingsTable({
    table,
    myTeamId,
    advanceCount,
    mode = "full",
    canManage,
    onSetManualRank,
    tournamentCompleted,
    sport,
}: StandingsTableProps) {
    const [open, setOpen] = useState<string | null>(null);
    const compact = mode === "compact";
    const cols = COLS.filter((c) => !compact || c.compact);
    const played = table.rows.some((r) => r.played > 0);
    const hasZone = !!advanceCount && advanceCount > 0 && table.stageType !== "KNOCKOUT";
    const crown = table.complete && tournamentCompleted && !table.groupId;
    const idPart = table.groupId ?? "all";
    const colLabel = (k: string, d: string) => (sport === "BASKETBALL" && k === "gf" ? "סלי זכות" : sport === "BASKETBALL" && k === "ga" ? "סלי חובה" : d);
    const gfGaTitle = sport === "TENNIS" ? "משחקונים" : undefined;

    const stickyCell = (left: number): SxProps<Theme> => ({
        position: "sticky",
        insetInlineStart: left,
        bgcolor: "background.paper",
        zIndex: 1,
    });

    const rowSx = (row: StandingsRow): SxProps<Theme> => (theme) => ({
        height: 50,
        cursor: compact ? "pointer" : "default",
        bgcolor: row.team.id === myTeamId ? alpha(theme.palette.primary.main, 0.08) : undefined,
        "& > td, & > th": {
            borderBottom: `1px solid ${alpha(theme.palette.divider, 0.5)}`,
            py: 0,
            px: 0.75,
            ...tabular,
        },
        "&:last-of-type > td, &:last-of-type > th": {
            borderBottom: "none",
        },
        "& > td:first-of-type": {
            boxShadow: hasZone && isQualifier(row, advanceCount) ? `inset 3px 0 0 ${theme.palette.success.main}` : undefined,
        },
        // dashed divider after the last qualifier
        ...(hasZone && row.rank === advanceCount
            ? { "& > td, & > th": { borderBottom: `2px dashed ${theme.palette.divider}`, py: 0, px: 0.75, ...tabular } }
            : {}),
    });

    return (
        <Box data-testid={`standings-table-${table.stageId}-${idPart}`} sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle1" fontWeight={800}>
                    {titleOf(table)}
                </Typography>
                {!table.complete && (
                    <Typography variant="caption" color="text.secondary" fontWeight={500}>
                        {played ? "הטבלה עדיין לא סופית" : "עוד לא שוחקו משחקים"}
                    </Typography>
                )}
            </Stack>

            {table.needsManualRank && (
                <Alert
                    severity="warning"
                    sx={{ mb: 1.5, borderRadius: 2 }}
                    data-testid="standings-needs-manual-rank"
                    action={
                        canManage && onSetManualRank ? (
                            <Button color="inherit" size="small" onClick={() => onSetManualRank(table)}>
                                קביעת סדר
                            </Button>
                        ) : undefined
                    }
                >
                    יש שוויון שהשוברים לא הכריעו. הדירוג יעודכן אחרי שהמארגן יקבע את הסדר.
                </Alert>
            )}

            <TableContainer
                sx={(theme) => ({
                    overflowX: compact ? "visible" : "auto",
                    maxWidth: "100%",
                    borderRadius: 2.5,
                    border: "1px solid",
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    boxShadow: theme.shadows[1],
                })}
            >
                <Table size="small" sx={{ tableLayout: compact ? "fixed" : "auto", minWidth: compact ? 0 : 520 }} aria-label={titleOf(table)}>
                    <TableHead>
                        <TableRow
                            sx={(theme) => ({
                                height: 38,
                                bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.04 : 0.025),
                                "& th": {
                                    py: 0,
                                    px: 0.75,
                                    typography: "caption",
                                    fontWeight: 700,
                                    color: "text.secondary",
                                    borderBottomColor: "divider",
                                },
                            })}
                        >
                            <TableCell sx={{ width: RANK_W, textAlign: "center", ...(stickyCell(0) as object), bgcolor: "inherit" }} title="דירוג">
                                #
                            </TableCell>
                            <TableCell sx={{ ...(stickyCell(RANK_W) as object), bgcolor: "inherit", width: compact ? undefined : 140, minWidth: compact ? 0 : 140 }}>
                                קבוצה
                            </TableCell>
                            {cols.map((c) => (
                                <TableCell
                                    key={c.key}
                                    title={c.key === "gf" || c.key === "ga" ? gfGaTitle ?? colLabel(c.key, c.title) : colLabel(c.key, c.title)}
                                    sx={{ width: c.w, textAlign: "center" }}
                                >
                                    {c.head}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {table.rows.map((row) => {
                            const mine = row.team.id === myTeamId;
                            const expanded = compact && open === row.team.id;
                            return (
                                <Fragment key={row.team.id}>
                                    <TableRow
                                        hover={compact}
                                        data-testid={`standings-row-${row.team.id}`}
                                        data-mine={mine ? "true" : undefined}
                                        aria-expanded={compact ? expanded : undefined}
                                        tabIndex={compact ? 0 : undefined}
                                        onClick={compact ? () => setOpen(expanded ? null : row.team.id) : undefined}
                                        onKeyDown={
                                            compact
                                                ? (e) => {
                                                      if (e.key === "Enter" || e.key === " ") {
                                                          e.preventDefault();
                                                          setOpen(expanded ? null : row.team.id);
                                                      }
                                                  }
                                                : undefined
                                        }
                                        sx={rowSx(row)}
                                    >
                                        <TableCell sx={{ width: RANK_W, textAlign: "center", ...(stickyCell(0) as object), bgcolor: "inherit" }}>
                                            <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.25}>
                                                {row.manualRank != null && (
                                                    <Tooltip title="הסדר נקבע ידנית ע״י מארגן הטורניר">
                                                        <PanToolAltRounded sx={{ fontSize: 14 }} aria-label="הסדר נקבע ידנית" />
                                                    </Tooltip>
                                                )}
                                                {row.tied ? (
                                                    <Tooltip title="שוויון מלא בכל שוברי השוויון">
                                                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ...tabular, fontWeight: 700 }}>
                                                            {rankLabel(row)}
                                                        </Typography>
                                                    </Tooltip>
                                                ) : (
                                                    <Typography component="span" variant="body2" sx={{ ...tabular, fontWeight: 700 }}>
                                                        {rankLabel(row)}
                                                    </Typography>
                                                )}
                                            </Stack>
                                        </TableCell>
                                        <TableCell sx={{ ...(stickyCell(RANK_W) as object), bgcolor: "inherit", maxWidth: compact ? undefined : 140, minWidth: 0 }}>
                                            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                                                {crown && row.rank === 1 && <span aria-label="מנצחת הליגה" role="img">🏆</span>}
                                                <TeamBadge team={row.team} emphasis={mine ? "winner" : undefined} testId={`standings-team-${row.team.id}`} />
                                                {!compact && table.complete && isQualifier(row, advanceCount) && hasZone && (
                                                    <Chip label="עולה" size="small" color="success" variant="outlined" sx={{ display: { xs: "none", sm: "inline-flex" } }} />
                                                )}
                                            </Stack>
                                        </TableCell>
                                        {cols.map((c) => (
                                            <TableCell
                                                key={c.key}
                                                sx={{ textAlign: "center", typography: "body2", fontWeight: c.key === "points" ? 800 : 500 }}
                                            >
                                                {c.key === "gd" ? <bdi dir="ltr">{formatGd(row.gd)}</bdi> : row[c.key]}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                    {expanded && (
                                        <TableRow data-testid={`standings-row-detail-${row.team.id}`}>
                                            <TableCell colSpan={cols.length + 2} sx={{ py: 0.75, px: 1.5, borderBottom: "none" }}>
                                                <Typography variant="caption" color="text.secondary" sx={tabular}>
                                                    {`${row.won} נ׳ · ${row.drawn} ת׳ · ${row.lost} ה׳ · שערים `}
                                                    <bdi dir="ltr">{`${row.gf}:${row.ga}`}</bdi>
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </Fragment>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>

            {hasZone && (
                <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 1 }}>
                    <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "success.main" }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        עולות לשלב הבא
                    </Typography>
                </Stack>
            )}
        </Box>
    );
}
