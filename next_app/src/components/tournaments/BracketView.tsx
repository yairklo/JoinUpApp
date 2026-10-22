"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import { useTheme } from "@mui/material/styles";
import BracketCell from "./BracketCell";
import { getSportTheme } from "@/utils/sports";
import type { SlotContext } from "@/utils/tournament";
import {
    BRACKET_CELL_H,
    bracketHeight,
    bracketRoundName,
    currentRoundIndex,
    isByeMatch,
    roundStride,
    roundTopOffset,
    splitThirdPlace,
    teamPathIds,
} from "@/utils/tournamentViews";
import type { BracketStage, TournamentMatch } from "@/types/tournament";

export type BracketMode = "tree" | "rounds";

export interface BracketViewProps {
    stage: BracketStage;
    sport?: string | null;
    myTeamId?: string | null;
    /** Team whose path is highlighted by default (usually my team). */
    highlightTeamId?: string | null;
    mode: BracketMode;
    onModeChange?: (mode: BracketMode) => void;
    context?: SlotContext;
    changedMatchIds?: readonly string[];
    /** Final of a completed tournament gets a trophy. */
    completed?: boolean;
    /** Match detail href; omit for non-navigating cells. */
    hrefFor?: (match: TournamentMatch) => string;
    onOpenMatch?: (match: TournamentMatch) => void;
}

const COL_GAP = 32;
const PAD_TOP = 20;
const PEEK = 24;

/** Knockout bracket (spec 9): one-sided tree on desktop, round-by-round on phones. Props only. */
export default function BracketView(props: BracketViewProps) {
    const { mode, onModeChange } = props;
    const rtl = useTheme().direction === "rtl";
    const { main, thirdPlace } = useMemo(() => splitThirdPlace(props.stage.rounds), [props.stage.rounds]);
    const [pinned, setPinned] = useState<string | null>(null);
    const [hover, setHover] = useState<string | null>(null);
    const active = pinned ?? hover ?? props.highlightTeamId ?? null;
    const pathIds = useMemo(() => teamPathIds(props.stage.rounds, active), [props.stage.rounds, active]);
    const onTeamPointer = useCallback((teamId: string | null, kind: "hover" | "pin") => {
        if (kind === "hover") setHover(teamId);
        else setPinned((cur) => (cur === teamId ? null : teamId));
    }, []);

    const common = { ...props, main, thirdPlace, rtl, active, pinned, pathIds, onTeamPointer, clearPin: () => setPinned(null) };

    return (
        <Box data-testid="bracket-view" sx={{ minWidth: 0 }}>
            {onModeChange && (
                <Stack direction="row" justifyContent="flex-end" sx={{ mb: 1 }}>
                    <Button size="small" onClick={() => onModeChange(mode === "tree" ? "rounds" : "tree")} data-testid="bracket-mode-toggle">
                        {mode === "tree" ? "תצוגת סבבים" : "תצוגת עץ"}
                    </Button>
                </Stack>
            )}
            {mode === "tree" ? <TreeView {...common} /> : <RoundsView {...common} />}
        </Box>
    );
}

interface Inner extends BracketViewProps {
    main: ReturnType<typeof splitThirdPlace>["main"];
    thirdPlace: TournamentMatch | null;
    rtl: boolean;
    active: string | null;
    pinned: string | null;
    pathIds: Set<string>;
    onTeamPointer: (teamId: string | null, kind: "hover" | "pin") => void;
    clearPin: () => void;
}

function TreeView({ main, thirdPlace, sport, myTeamId, context, changedMatchIds, completed, hrefFor, onOpenMatch, pinned, pathIds, onTeamPointer, clearPin, rtl }: Inner) {
    const theme = useTheme();
    const sportTheme = getSportTheme(sport);
    const accent = theme.palette.mode === "dark" ? sportTheme.glow : sportTheme.deep;
    const m1 = main[0]?.matches.length ?? 1;
    const small = m1 <= 4;
    const cellW = small ? 240 : 200;
    const hasTennis5 = main.some((r) => r.matches.some((m) => (m.details?.sets?.length ?? 0) >= 4));
    const w = hasTennis5 ? 240 : cellW;
    const canvasW = main.length * (w + COL_GAP) - COL_GAP;
    const canvasH = PAD_TOP + bracketHeight(m1) + (thirdPlace ? BRACKET_CELL_H + 56 : 0);
    const [zoom, setZoom] = useState<"fit" | number>(m1 >= 16 ? "fit" : 1);
    const boxRef = useRef<HTMLDivElement>(null);
    const [boxW, setBoxW] = useState(0);
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return;
        const update = () => setBoxW(el.clientWidth);
        update();
        if (typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const fit = boxW > 0 ? Math.min(1, Math.max(0.55, boxW / canvasW)) : 1;
    const scale = small ? 1 : zoom === "fit" ? fit : zoom;
    const step = (d: number) => setZoom(Math.min(1.5, Math.max(0.55, Math.round(((zoom === "fit" ? fit : zoom) + d) * 100) / 100)));
    const hideCaption = scale < 0.7;
    const roundIdx = main.length;
    const line = (on: boolean) => ({ bgcolor: on ? accent : "divider", ...(on ? { zIndex: 1 } : {}) });

    return (
        <Box>
            {!small && (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 1 }}>
                    <Button size="small" variant={zoom === "fit" ? "contained" : "outlined"} onClick={() => setZoom("fit")} data-testid="bracket-zoom-fit">
                        התאמה למסך
                    </Button>
                    <Button size="small" variant={zoom === 1 ? "contained" : "outlined"} onClick={() => setZoom(1)}>
                        100%
                    </Button>
                    <IconButton size="small" aria-label="הקטנה" onClick={() => step(-0.1)} data-testid="bracket-zoom-out">
                        <RemoveRounded fontSize="small" />
                    </IconButton>
                    <IconButton size="small" aria-label="הגדלה" onClick={() => step(0.1)} data-testid="bracket-zoom-in">
                        <AddRounded fontSize="small" />
                    </IconButton>
                    {pinned && (
                        <Button size="small" onClick={clearPin}>
                            ביטול הדגשה
                        </Button>
                    )}
                </Stack>
            )}
            <Box ref={boxRef} sx={{ overflowX: "auto", pb: 1 }} tabIndex={0} aria-label="עץ הטורניר">
                <Box sx={{ width: canvasW * scale, height: canvasH * scale, position: "relative" }}>
                    <Box
                        sx={{
                            width: canvasW,
                            height: canvasH,
                            display: "flex",
                            gap: `${COL_GAP}px`,
                            transform: `scale(${scale})`,
                            transformOrigin: rtl ? "top right" : "top left",
                        }}
                    >
                        {main.map((round, ri) => {
                            const r = ri + 1;
                            const stride = roundStride(r);
                            const off = PAD_TOP + roundTopOffset(r);
                            const isLast = ri === roundIdx - 1;
                            return (
                                <Box key={round.round} data-testid={`bracket-round-${round.round}`} sx={{ position: "relative", width: w, flexShrink: 0 }}>
                                    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ position: "absolute", top: -2, height: 18 }}>
                                        {isLast && <EmojiEventsRounded aria-hidden sx={{ fontSize: 16, color: "warning.main" }} />}
                                        <Typography variant="caption" fontWeight={700}>
                                            {bracketRoundName(round.name)}
                                        </Typography>
                                    </Stack>
                                    {round.matches.map((m, i) => {
                                        const top = off + i * stride;
                                        const centre = top + (isByeMatch(m) && r === 1 ? 18 : BRACKET_CELL_H / 2);
                                        const onPath = pathIds.has(m.id);
                                        const ghost = r === 1 && isByeMatch(m);
                                        const pairStart = i % 2 === 0 && i + 1 < round.matches.length;
                                        return (
                                            <Box key={m.id}>
                                                <Box sx={{ position: "absolute", top, insetInlineStart: 0 }}>
                                                    <BracketCell
                                                        match={m}
                                                        context={context}
                                                        sport={sport}
                                                        width={w}
                                                        ghost={ghost}
                                                        onPath={onPath}
                                                        dimmed={!!pinned && !onPath}
                                                        myTeamId={myTeamId}
                                                        hideCaption={hideCaption}
                                                        trophy={completed && isLast && !m.isThirdPlace}
                                                        changed={changedMatchIds?.includes(m.id)}
                                                        href={hrefFor?.(m)}
                                                        onOpen={onOpenMatch}
                                                        onTeamPointer={onTeamPointer}
                                                    />
                                                </Box>
                                                {!isLast && (
                                                    <Box
                                                        aria-hidden
                                                        sx={{ position: "absolute", top: centre - 1, insetInlineEnd: -COL_GAP / 2, width: COL_GAP / 2, height: 2, ...line(onPath) }}
                                                    />
                                                )}
                                                {!isLast && pairStart && (
                                                    <Box
                                                        aria-hidden
                                                        sx={{ position: "absolute", top: centre - 1, insetInlineEnd: -COL_GAP / 2 - 1, width: 2, height: stride + 2, ...line(onPath && pathIds.has(round.matches[i + 1].id)) }}
                                                    />
                                                )}
                                                {ri > 0 && (
                                                    <Box
                                                        aria-hidden
                                                        sx={{ position: "absolute", top: centre - 1, insetInlineStart: -COL_GAP / 2, width: COL_GAP / 2, height: 2, ...line(onPath) }}
                                                    />
                                                )}
                                            </Box>
                                        );
                                    })}
                                    {isLast && thirdPlace && (
                                        <Box data-testid="bracket-third-place" sx={{ position: "absolute", top: PAD_TOP + bracketHeight(m1) + 28, insetInlineStart: 0 }}>
                                            <Typography variant="caption" fontWeight={700} sx={{ display: "block", mb: 2.5 }}>
                                                🥉 משחק על המקום השלישי
                                            </Typography>
                                            <BracketCell
                                                match={thirdPlace}
                                                context={context}
                                                sport={sport}
                                                width={w}
                                                myTeamId={myTeamId}
                                                hideCaption={hideCaption}
                                                changed={changedMatchIds?.includes(thirdPlace.id)}
                                                href={hrefFor?.(thirdPlace)}
                                                onOpen={onOpenMatch}
                                                dimmed={!!pinned && !pathIds.has(thirdPlace.id)}
                                                onPath={pathIds.has(thirdPlace.id)}
                                                onTeamPointer={onTeamPointer}
                                            />
                                        </Box>
                                    )}
                                </Box>
                            );
                        })}
                    </Box>
                </Box>
            </Box>
        </Box>
    );
}

function RoundsView({ main, thirdPlace, sport, myTeamId, highlightTeamId, context, changedMatchIds, completed, hrefFor, onOpenMatch, pathIds, onTeamPointer, pinned, rtl }: Inner) {
    const pills = useMemo(() => [...main.map((r) => ({ key: String(r.round), label: bracketRoundName(r.name) })), ...(thirdPlace ? [{ key: "third", label: "מקום 3" }] : [])], [main, thirdPlace]);
    const [index, setIndex] = useState(() => currentRoundIndex(main));
    const [onlyMine, setOnlyMine] = useState(false);
    const [hideByes, setHideByes] = useState(true);
    const scroller = useRef<HTMLDivElement>(null);
    const cols = useRef<Array<HTMLDivElement | null>>([]);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const Arrow = rtl ? ArrowBackRounded : ArrowForwardRounded;

    const goTo = useCallback((i: number) => {
        setIndex(i);
        cols.current[i]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
    }, []);
    useEffect(() => {
        // open on the current round without animating the page
        cols.current[index]?.scrollIntoView({ inline: "start", block: "nearest" });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- first paint only
    }, []);
    const onScroll = () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            const root = scroller.current?.getBoundingClientRect();
            if (!root) return;
            let best = 0;
            let bestD = Infinity;
            cols.current.forEach((el, i) => {
                if (!el) return;
                const b = el.getBoundingClientRect();
                const d = Math.abs((rtl ? root.right - b.right : b.left - root.left));
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            });
            setIndex(best);
        }, 120);
    };
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const hasByes = main[0]?.matches.some(isByeMatch) ?? false;
    const filtered = (matches: TournamentMatch[], first: boolean) =>
        matches.filter((m) => (onlyMine ? pathIds.has(m.id) : true) && !(hideByes && first && isByeMatch(m)));

    const cell = (m: TournamentMatch, extra: { trophy?: boolean } = {}) => (
        <BracketCell
            key={m.id}
            match={m}
            context={context}
            sport={sport}
            width="100%"
            myTeamId={myTeamId}
            onPath={pathIds.has(m.id) && !!(pinned ?? highlightTeamId)}
            changed={changedMatchIds?.includes(m.id)}
            href={hrefFor?.(m)}
            onOpen={onOpenMatch}
            trophy={extra.trophy}
            onTeamPointer={onTeamPointer}
        />
    );

    return (
        <Box>
            <Stack direction="row" spacing={1} sx={{ overflowX: "auto", pb: 1 }} role="tablist" aria-label="סבבים">
                {pills.map((p, i) => (
                    <Chip
                        key={p.key}
                        role="tab"
                        aria-selected={i === index}
                        label={p.label}
                        clickable
                        color={i === index ? "primary" : "default"}
                        onClick={() => goTo(i)}
                        data-testid={`bracket-round-pill-${p.key}`}
                        sx={{ flexShrink: 0 }}
                    />
                ))}
            </Stack>
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
                {highlightTeamId && (
                    <Chip
                        label="המסלול של הקבוצה שלי"
                        clickable
                        variant={onlyMine ? "filled" : "outlined"}
                        color={onlyMine ? "primary" : "default"}
                        onClick={() => setOnlyMine((v) => !v)}
                        data-testid="bracket-my-path"
                    />
                )}
                {hasByes && (
                    <Chip
                        label="הסתרת פטורים"
                        clickable
                        variant={hideByes ? "filled" : "outlined"}
                        onClick={() => setHideByes((v) => !v)}
                        data-testid="bracket-hide-byes"
                    />
                )}
            </Stack>
            <Box
                ref={scroller}
                onScroll={onScroll}
                sx={{ display: "flex", gap: 1.5, overflowX: "auto", scrollSnapType: "x mandatory", pb: 1 }}
            >
                {main.map((round, ri) => {
                    const list = filtered(round.matches, ri === 0);
                    const next = main[ri + 1];
                    const isFinal = ri === main.length - 1;
                    const pairs: TournamentMatch[][] = [];
                    for (let i = 0; i < list.length; i += 2) pairs.push(list.slice(i, i + 2));
                    return (
                        <Box
                            key={round.round}
                            ref={(el: HTMLDivElement | null) => {
                                cols.current[ri] = el;
                            }}
                            data-testid={`bracket-round-${round.round}`}
                            sx={{ flex: `0 0 calc(100% - ${PEEK}px)`, scrollSnapAlign: "start", minWidth: 0 }}
                        >
                            <Stack spacing={1.5}>
                                {list.length === 0 && (
                                    <Typography variant="body2" color="text.secondary">
                                        אין משחקים בסבב הזה
                                    </Typography>
                                )}
                                {pairs.map((pair, pi) => {
                                    const target = next?.matches[Math.floor((round.matches.indexOf(pair[0])) / 2)];
                                    return (
                                        <Box key={pair[0].id}>
                                            <Stack
                                                spacing={1}
                                                sx={{ borderInlineEnd: pair.length === 2 && !isFinal ? 2 : 0, borderColor: "divider", pe: 0 }}
                                            >
                                                {pair.map((m) => (
                                                    <Box key={m.id} sx={{ pt: 2 }}>
                                                        {cell(m, { trophy: !!completed && isFinal })}
                                                    </Box>
                                                ))}
                                            </Stack>
                                            {target && !onlyMine && (
                                                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.75 }}>
                                                    <Arrow aria-hidden sx={{ fontSize: 14, color: "text.secondary" }} />
                                                    <Typography variant="caption" color="text.secondary" data-testid={`bracket-next-${pi}`}>
                                                        {pair.length === 2 ? `המנצחות נפגשות במשחק #${target.number}` : `המנצחת עולה למשחק #${target.number}`}
                                                    </Typography>
                                                </Stack>
                                            )}
                                        </Box>
                                    );
                                })}
                            </Stack>
                        </Box>
                    );
                })}
                {thirdPlace && (
                    <Box
                        ref={(el: HTMLDivElement | null) => {
                            cols.current[main.length] = el;
                        }}
                        data-testid="bracket-third-place"
                        sx={{ flex: `0 0 calc(100% - ${PEEK}px)`, scrollSnapAlign: "start", pt: 2 }}
                    >
                        {cell(thirdPlace)}
                    </Box>
                )}
            </Box>
        </Box>
    );
}
