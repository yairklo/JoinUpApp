"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";
import IosShareRounded from "@mui/icons-material/IosShareRounded";
import TeamBadge from "../TeamBadge";
import TournamentStatusChip from "../TournamentStatusChip";
import { TournamentCover } from "./TournamentCard";
import { SPORT_MAPPING, getSportTheme } from "@/utils/sports";
import type { TeamLite, TournamentDetail } from "@/types/tournament";
import { FORMAT_LABEL, dateRangeLabel, shortDate, type HeroCta } from "./shellModel";

export interface ChampionInfo {
    champion: TeamLite | null;
    second: TeamLite | null;
    third: TeamLite | null;
}

async function shareLink(text: string, title: string): Promise<void> {
    const url = window.location.href.split("#")[0];
    try {
        if (navigator.share) await navigator.share({ title, text, url });
        else await navigator.clipboard.writeText(url);
    } catch {
        /* user dismissed the share sheet */
    }
}

function Champion({ t, info }: { t: TournamentDetail; info: ChampionInfo }) {
    const c = getSportTheme(t.sport);
    const [burst, setBurst] = useState(false);
    useEffect(() => {
        try {
            const key = `tournament-champion-seen-${t.id}`;
            if (localStorage.getItem(key)) return;
            localStorage.setItem(key, "1");
            if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                setBurst(true);
                const id = setTimeout(() => setBurst(false), 1200);
                return () => clearTimeout(id);
            }
        } catch {
            /* storage blocked: skip the burst */
        }
    }, [t.id]);
    if (!info.champion) return null;
    return (
        <Box
            data-testid="tournament-champion"
            sx={{ p: 3, borderRadius: 3, color: "#fff", textAlign: "center", background: `linear-gradient(135deg, ${c.ink}, ${c.deep})`, position: "relative", overflow: "hidden" }}
        >
            <Box aria-hidden sx={{ fontSize: 40, display: "inline-grid", placeItems: "center", width: 72, height: 72, borderRadius: "50%", boxShadow: `0 0 32px ${c.glow}`, animation: burst ? "champ-pop 1.2s ease-out" : "none", "@keyframes champ-pop": { "0%": { transform: "scale(.6)" }, "60%": { transform: "scale(1.2)" }, "100%": { transform: "scale(1)" } } }}>🏆</Box>
            <Typography variant="caption" sx={{ display: "block", color: c.glow }}>{`אלופת ${t.title}`}</Typography>
            <Stack alignItems="center" sx={{ my: 1, "& *": { color: "#fff !important", fontSize: "1.5rem", fontWeight: 800 } }}>
                <TeamBadge team={info.champion} size={40} lines={2} testId="champion-badge" />
            </Stack>
            {(info.second || info.third) && (
                <Stack direction="row" justifyContent="center" spacing={3} sx={{ mb: 1.5 }} data-testid="tournament-podium">
                    {info.second && <Typography variant="body2">{`🥈 ${info.second.name}`}</Typography>}
                    {info.third && <Typography variant="body2">{`🥉 ${info.third.name}`}</Typography>}
                </Stack>
            )}
            <Button
                variant="outlined"
                startIcon={<IosShareRounded />}
                onClick={() => void shareLink(`${info.champion?.name} אלופי ${t.title}! 🏆`, t.title)}
                sx={{ color: "#fff", borderColor: "rgba(255,255,255,.6)" }}
                data-testid="tournament-share"
            >
                שיתוף
            </Button>
        </Box>
    );
}

function CtaButton({ cta, onScore, large }: { cta: Exclude<HeroCta, null>; onScore: () => void; large?: boolean }) {
    const size = large ? ("large" as const) : ("medium" as const);
    if (cta.kind === "score") {
        return <Button variant="contained" size={size} onClick={onScore} data-testid="tournament-cta">{cta.label}</Button>;
    }
    if (cta.kind === "signin") {
        return <Button component={Link} href="/sign-in" variant="contained" size={size} data-testid="tournament-cta">{cta.label}</Button>;
    }
    return (
        <Stack direction="row" spacing={1}>
            {cta.kind === "register" && cta.secondary && (
                <Button component={Link} href={cta.secondary.href} variant="outlined" size={size} data-testid="tournament-cta-secondary">{cta.secondary.label}</Button>
            )}
            <Button component={Link} href={cta.href} variant="contained" size={size} data-testid="tournament-cta">{cta.label}</Button>
        </Stack>
    );
}

export interface TournamentHeroProps {
    tournament: TournamentDetail;
    cta: HeroCta;
    champion: ChampionInfo;
    liveCount: number;
    onScoreCta: () => void;
    onGoLive: () => void;
}

/** Hero (spec 2.1/2.2): cover, status, meta, progress, role-aware CTA, champion moment. Phones get a sticky bottom CTA. */
export default function TournamentHero({ tournament: t, cta, champion, liveCount, onScoreCta, onGoLive }: TournamentHeroProps) {
    const c = getSportTheme(t.sport);
    const total = t.counts.matchesTotal;
    const done = t.counts.matchesFinished;
    const caption =
        t.status === "REGISTRATION_OPEN"
            ? `${t.registrationClosesAt ? `ההרשמה פתוחה עד ${shortDate(t.registrationClosesAt)} · ` : "ההרשמה פתוחה · "}${t.counts.teamsApproved}/${t.maxTeams} קבוצות`
            : t.status === "REGISTRATION_CLOSED"
              ? total > 0 ? "ההרשמה נסגרה · לוח המשחקים פורסם" : "ההרשמה נסגרה · לוח המשחקים יפורסם בקרוב"
              : null;
    return (
        <Box data-testid="tournament-hero" component="header">
            {t.status === "DRAFT" && (
                <Alert severity="warning" sx={{ mb: 1.5 }} data-testid="tournament-draft-strip">
                    טיוטה: רק מנהלי הטורניר רואים אותה
                </Alert>
            )}
            <Box sx={{ borderRadius: 3, overflow: "hidden", border: 1, borderColor: "divider" }}>
                <TournamentCover t={t} height={{ xs: 160, md: 220 }} />
                <Box sx={{ p: { xs: 2, md: 3 } }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                        <span data-testid="tournament-status"><TournamentStatusChip status={t.status} /></span>
                        <Typography variant="body2" color="text.secondary">
                            {`${(SPORT_MAPPING as Record<string, string>)[t.sport] ?? t.sport} · ${FORMAT_LABEL[t.format]}`}
                        </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
                        <Typography variant="h4" component="h1" sx={{ fontWeight: 800, fontSize: { xs: "1.5rem", md: "2.25rem" } }}>
                            {t.title}
                        </Typography>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
                            <IconButton aria-label="שיתוף הטורניר" onClick={() => void shareLink(t.title, t.title)}>
                                <IosShareRounded />
                            </IconButton>
                            {cta && <Box sx={{ display: { xs: "none", md: "block" } }}><CtaButton cta={cta} onScore={onScoreCta} large /></Box>}
                        </Stack>
                    </Stack>
                    <Typography color="text.secondary" sx={{ mt: 1 }}>
                        {`📅 ${dateRangeLabel(t.startsAt, t.endsAt)}${t.customLocation ? ` · 📍 ${t.customLocation}` : ""} · 👥 ${t.counts.teamsApproved} קבוצות`}
                    </Typography>
                    {caption && <Typography variant="body2" sx={{ mt: 0.5 }} data-testid="tournament-caption">{caption}</Typography>}
                    {t.status === "IN_PROGRESS" && (
                        <Box sx={{ mt: 1.5 }}>
                            {liveCount > 0 && (
                                <Chip
                                    size="small"
                                    color="error"
                                    clickable
                                    onClick={onGoLive}
                                    label={`${liveCount} ${liveCount === 1 ? "משחק חי עכשיו" : "משחקים חיים עכשיו"}`}
                                    sx={{ mb: 1, fontWeight: 700 }}
                                />
                            )}
                            <Box
                                role="progressbar"
                                aria-valuemin={0}
                                aria-valuemax={total}
                                aria-valuenow={done}
                                data-testid="tournament-progress"
                                sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}
                            >
                                <Box sx={{ width: total ? `${(done / total) * 100}%` : 0, height: "100%", bgcolor: c.base }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary">{`${done}/${total} משחקים שוחקו`}</Typography>
                        </Box>
                    )}
                </Box>
            </Box>
            {t.status === "CANCELLED" && (
                <Alert severity="warning" sx={{ mt: 1.5 }}>
                    הטורניר בוטל. המשחקים שלא שוחקו בוטלו.
                </Alert>
            )}
            {t.status === "COMPLETED" && champion.champion && (
                <Box sx={{ mt: 2 }}>
                    <Champion t={t} info={champion} />
                </Box>
            )}
            {t.status === "COMPLETED" && !champion.champion && (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.5 }} color="text.secondary">
                    <EmojiEventsRounded fontSize="small" />
                    <Typography variant="body2">הטורניר הסתיים</Typography>
                </Stack>
            )}
            {cta && (
                <Box
                    sx={{
                        display: { xs: "flex", md: "none" },
                        position: "fixed",
                        insetInline: 0,
                        bottom: 0,
                        zIndex: 1100,
                        p: 1.5,
                        pb: "calc(12px + env(safe-area-inset-bottom))",
                        bgcolor: "background.paper",
                        borderTop: 1,
                        borderColor: "divider",
                        justifyContent: "center",
                        "& .MuiButton-root": { minHeight: 52, flex: 1 },
                        "& .MuiStack-root": { width: "100%" },
                    }}
                    data-testid="tournament-cta-bar"
                >
                    <CtaButton cta={cta} onScore={onScoreCta} large />
                </Box>
            )}
        </Box>
    );
}
