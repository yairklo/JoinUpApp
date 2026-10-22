"use client";

import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { alpha, useTheme } from "@mui/material/styles";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import SportsScoreRoundedIcon from "@mui/icons-material/SportsScoreRounded";
import ReportProblemRoundedIcon from "@mui/icons-material/ReportProblemRounded";
import {
    buildGrid,
    cellOccupants,
    cellToIso,
    itemDays,
    unscheduled,
    type GridItem,
} from "@/utils/scheduleGrid";
import { isoToIsraelParts } from "@/utils/tournamentManage";

export interface ScheduleViewsProps {
    items: GridItem[];
    /** Items (keys) that sit in a conflict; draws the warning border. */
    conflictedKeys?: ReadonlySet<string>;
    durationMinutes: number;
    stepMinutes: number;
    /** Court columns that exist even with no match that day. */
    courts?: string[];
    /** Item key to scroll to and flash (conflict chip clicked). */
    focusKey?: string | null;
    /** Enables drag and the per-block menu. */
    editable?: boolean;
    /** A block was dropped on a free/occupied slot. */
    onMove?: (key: string, iso: string, court: string) => void;
    onEdit?: (key: string) => void;
    /** Opens score entry for a committed match. Shown only while the tournament is in progress. */
    onScore?: (key: string) => void;
}

const SLOT_H = 40;
const HEAD_H = 36;
const TIME_W = 56;
const DAY_FMT = new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jerusalem" });
const dayLabel = (day: string) => DAY_FMT.format(new Date(`${day}T12:00:00Z`));

/** Schedule preview / editor: by-day list or court grid with drag and drop (spec 11.2). */
export default function ScheduleViews({ items, conflictedKeys, durationMinutes, stepMinutes, courts, focusKey, editable, onMove, onEdit, onScore }: ScheduleViewsProps) {
    const theme = useTheme();
    const wide = useMediaQuery(theme.breakpoints.up(900));
    const [view, setView] = useState<"day" | "grid" | null>(null);
    const mode = view ?? (wide ? "grid" : "day");
    const days = useMemo(() => itemDays(items), [items]);
    const [day, setDay] = useState<string | null>(null);
    const activeDay = day && days.includes(day) ? day : days[0] ?? "";
    const loose = unscheduled(items);

    useEffect(() => {
        if (!focusKey) return;
        const found = items.find((i) => i.key === focusKey);
        const p = found?.scheduledAt ? isoToIsraelParts(found.scheduledAt) : null;
        if (p && p.date !== activeDay) setDay(p.date);
        const t = setTimeout(() => document.getElementById(`schedule-block-${focusKey}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 50);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the focus target changes
    }, [focusKey]);

    return (
        <Box data-testid="schedule-views">
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={mode}
                    onChange={(_, v) => v && setView(v)}
                    aria-label="תצוגה"
                    sx={(theme) => ({
                        p: 0.5,
                        gap: 0.5,
                        borderRadius: 999,
                        bgcolor: alpha(theme.palette.text.primary, theme.palette.mode === "dark" ? 0.08 : 0.05),
                        "& .MuiToggleButtonGroup-grouped": { border: 0, borderRadius: "999px !important", mx: 0, px: 1.75, fontWeight: 700, textTransform: "none", color: "text.secondary" },
                        "& .MuiToggleButtonGroup-grouped.Mui-selected, & .MuiToggleButtonGroup-grouped.Mui-selected:hover": {
                            bgcolor: theme.palette.mode === "dark" ? alpha(theme.palette.primary.main, 0.24) : theme.palette.background.paper,
                            color: theme.palette.mode === "dark" ? theme.palette.primary.light : "text.primary",
                            boxShadow: theme.palette.mode === "dark" ? "none" : theme.shadows[2],
                        },
                    })}
                >
                    <ToggleButton value="day" data-testid="schedule-view-day">לפי יום</ToggleButton>
                    <ToggleButton value="grid" data-testid="schedule-view-grid">לוח מגרשים</ToggleButton>
                </ToggleButtonGroup>
                <Box sx={{ display: "flex", gap: 0.75, overflowX: "auto" }}>
                    {days.map((d) => (
                        <Chip key={d} label={dayLabel(d)} color={d === activeDay ? "primary" : "default"} onClick={() => setDay(d)} data-testid={`schedule-day-${d}`} />
                    ))}
                </Box>
            </Stack>

            {items.length === 0 && <Typography color="text.secondary">אין משחקים בלוח.</Typography>}

            {mode === "day" ? (
                <DayList items={items.filter((i) => i.scheduledAt && isoToIsraelParts(i.scheduledAt)?.date === activeDay)} conflictedKeys={conflictedKeys} focusKey={focusKey} editable={editable} onEdit={onEdit} onScore={onScore} />
            ) : (
                <CourtGrid
                    items={items}
                    day={activeDay}
                    conflictedKeys={conflictedKeys}
                    durationMinutes={durationMinutes}
                    stepMinutes={stepMinutes}
                    courts={courts}
                    focusKey={focusKey}
                    editable={editable}
                    onMove={onMove}
                    onEdit={onEdit}
                    onScore={onScore}
                />
            )}

            {loose.length > 0 && (
                <Box sx={{ mt: 2 }} data-testid="schedule-unscheduled">
                    <Typography variant="subtitle2" fontWeight={800}>לא משובצים</Typography>
                    <DayList items={loose} conflictedKeys={conflictedKeys} focusKey={focusKey} editable={editable} onEdit={onEdit} onScore={onScore} />
                </Box>
            )}
        </Box>
    );
}

function blockLabel(it: GridItem): string {
    return `#${it.number} ${it.home} – ${it.away}`;
}

function DayList({ items, conflictedKeys, focusKey, editable, onEdit, onScore }: { items: GridItem[]; conflictedKeys?: ReadonlySet<string>; focusKey?: string | null; editable?: boolean; onEdit?: (key: string) => void; onScore?: (key: string) => void }) {
    const sorted = [...items].sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? "") || a.number - b.number);
    return (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
            {sorted.map((it) => {
                const time = it.scheduledAt ? isoToIsraelParts(it.scheduledAt)?.time : null;
                const conflict = conflictedKeys?.has(it.key);
                return (
                    <Stack
                        key={it.key}
                        component="li"
                        id={`schedule-block-${it.key}`}
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        data-testid={`schedule-match-block-${it.key}`}
                        sx={{
                            minHeight: 60,
                            py: 1,
                            px: 1.25,
                            mb: 1,
                            border: 1,
                            borderColor: conflict ? "warning.main" : "divider",
                            outline: conflict ? "1px solid" : "none",
                            outlineColor: "warning.main",
                            bgcolor: focusKey === it.key ? "action.selected" : "background.paper",
                            borderRadius: 2.5,
                        }}
                    >
                        <Box sx={{ width: 56, flexShrink: 0, textAlign: "center", py: 0.25, borderInlineEnd: 1, borderColor: "divider", me: 0.5 }}>
                            <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.3 }}>{time ?? "–"}</Typography>
                            {it.court && (
                                <Typography variant="caption" color="text.secondary" display="block" noWrap sx={{ lineHeight: 1.3 }}>
                                    {`מגרש ${it.court}`}
                                </Typography>
                            )}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }} title={blockLabel(it)}>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" sx={{ lineHeight: 1.3 }}>
                                {`#${it.number}`}
                            </Typography>
                            <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.35, wordBreak: "break-word" }}>
                                {it.home}
                                <Box component="span" sx={{ color: "text.disabled", mx: 0.75 }}>–</Box>
                                {it.away}
                            </Typography>
                        </Box>
                        {conflict && <ReportProblemRoundedIcon fontSize="small" color="warning" aria-label="התנגשות" />}
                        {onScore && (
                            <IconButton aria-label={`הזנת תוצאה למשחק ${it.number}`} onClick={() => onScore(it.key)} data-testid={`schedule-score-${it.key}`} sx={{ width: 44, height: 44 }}>
                                <SportsScoreRoundedIcon fontSize="small" />
                            </IconButton>
                        )}
                        {editable && onEdit && (
                            <IconButton aria-label={`עריכת משחק ${it.number}`} onClick={() => onEdit(it.key)} sx={{ width: 44, height: 44 }}>
                                <EditRoundedIcon fontSize="small" />
                            </IconButton>
                        )}
                    </Stack>
                );
            })}
        </Box>
    );
}

function CourtGrid({ items, day, conflictedKeys, durationMinutes, stepMinutes, courts, focusKey, editable, onMove, onEdit, onScore }: Omit<ScheduleViewsProps, "durationMinutes" | "stepMinutes"> & { day: string; durationMinutes: number; stepMinutes: number }) {
    const grid = useMemo(
        () => buildGrid(items, day, { step: stepMinutes, durationMinutes, extraCourts: courts }),
        [items, day, stepMinutes, durationMinutes, courts]
    );
    const span = Math.max(1, Math.ceil(durationMinutes / grid.step));
    const [drag, setDrag] = useState<string | null>(null);
    const [target, setTarget] = useState<{ col: number; row: number } | null>(null);
    const hover = drag && target ? cellOccupants(grid, target.col, target.row, span, drag) : [];

    const rows = Array.from({ length: grid.slots }, (_, r) => r);
    return (
        <Box sx={{ overflow: "auto", maxHeight: "70vh", border: 1, borderColor: "divider", borderRadius: 2 }} data-testid="schedule-grid">
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: `${TIME_W}px repeat(${grid.courts.length}, minmax(140px, 1fr))`,
                    gridTemplateRows: `${HEAD_H}px repeat(${grid.slots}, ${SLOT_H}px)`,
                    position: "relative",
                }}
            >
                <Box sx={{ position: "sticky", top: 0, insetInlineStart: 0, zIndex: 3, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }} />
                {grid.courts.map((c, i) => (
                    <Box key={c || i} sx={{ gridColumn: i + 2, gridRow: 1, position: "sticky", top: 0, zIndex: 2, bgcolor: "background.paper", borderBottom: 1, borderInlineStart: 1, borderColor: "divider", display: "flex", alignItems: "center", px: 1 }}>
                        <Typography variant="caption" fontWeight={700} noWrap>{c || "ללא מגרש"}</Typography>
                    </Box>
                ))}
                {rows.map((r) => {
                    const min = grid.startMin + r * grid.step;
                    const hh = `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
                    return (
                        <Box key={`t${r}`} sx={{ gridColumn: 1, gridRow: r + 2, position: "sticky", insetInlineStart: 0, zIndex: 1, bgcolor: "background.paper", px: 1, display: "flex", alignItems: "flex-start" }}>
                            <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>{hh}</Typography>
                        </Box>
                    );
                })}
                {rows.flatMap((r) =>
                    grid.courts.map((c, ci) => {
                        const active = drag && target && target.col === ci && r >= target.row && r < target.row + span;
                        return (
                            <Box
                                key={`c${r}-${ci}`}
                                data-testid={`schedule-cell-${ci}-${r}`}
                                onDragOver={(e: React.DragEvent) => {
                                    if (!drag) return;
                                    e.preventDefault();
                                    if (!target || target.col !== ci || target.row !== r) setTarget({ col: ci, row: r });
                                }}
                                onDrop={(e: React.DragEvent) => {
                                    e.preventDefault();
                                    const iso = cellToIso(day, grid, r);
                                    if (drag && iso && onMove) onMove(drag, iso, c);
                                    setDrag(null);
                                    setTarget(null);
                                }}
                                sx={{
                                    gridColumn: ci + 2,
                                    gridRow: r + 2,
                                    borderTop: 1,
                                    borderInlineStart: 1,
                                    borderColor: "divider",
                                    bgcolor: active ? (hover.length ? "warning.light" : "success.light") : "transparent",
                                    opacity: active ? 0.5 : 1,
                                }}
                            />
                        );
                    })
                )}
                {grid.cells.map(({ item, col, row, span: sp }) => {
                    const conflict = conflictedKeys?.has(item.key);
                    return (
                        <Box
                            key={item.key}
                            id={`schedule-block-${item.key}`}
                            data-testid={`schedule-match-block-${item.key}`}
                            draggable={!!editable}
                            onDragStart={(e: React.DragEvent) => {
                                setDrag(item.key);
                                e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                                setDrag(null);
                                setTarget(null);
                            }}
                            sx={{
                                gridColumn: col + 2,
                                gridRow: `${row + 2} / span ${sp}`,
                                zIndex: 1,
                                m: "2px",
                                p: 0.75,
                                borderRadius: 1.5,
                                overflow: "hidden",
                                bgcolor: focusKey === item.key ? "action.selected" : "action.hover",
                                border: conflict ? "2px solid" : "1px solid",
                                borderColor: conflict ? "warning.main" : "divider",
                                cursor: editable ? "grab" : "default",
                                opacity: drag === item.key ? 0.4 : 1,
                                pointerEvents: drag && drag !== item.key ? "none" : "auto",
                            }}
                        >
                            <Stack direction="row" alignItems="center" spacing={0.5}>
                                <Typography variant="caption" fontWeight={800}>{`#${item.number}`}</Typography>
                                {conflict && <ReportProblemRoundedIcon sx={{ fontSize: 14 }} color="warning" aria-label="התנגשות" />}
                                {item.stage && <Chip size="small" label={item.stage} sx={{ height: 18, fontSize: 10 }} />}
                                <Box sx={{ flex: 1 }} />
                                {onScore && (
                                    <Tooltip title="הזנת תוצאה">
                                        <IconButton size="small" aria-label={`הזנת תוצאה למשחק ${item.number}`} onClick={() => onScore(item.key)} data-testid={`schedule-score-${item.key}`} sx={{ width: 28, height: 28 }}>
                                            <SportsScoreRoundedIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                                {editable && onEdit && (
                                    <Tooltip title="העברה…">
                                        <IconButton size="small" aria-label={`העברת משחק ${item.number}`} onClick={() => onEdit(item.key)} sx={{ width: 28, height: 28 }}>
                                            <EditRoundedIcon sx={{ fontSize: 16 }} />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Stack>
                            <Typography variant="caption" display="block" noWrap title={item.home}>{item.home}</Typography>
                            <Typography variant="caption" display="block" noWrap title={item.away}>{item.away}</Typography>
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}
