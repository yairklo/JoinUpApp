"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import TournamentStatusChip from "../TournamentStatusChip";
import { SPORT_EMOJI, getSportTheme } from "@/utils/sports";
import type { Tournament } from "@/types/tournament";
import { closesSoon, dateRangeLabel, shortDate } from "./shellModel";

/** Cover: the image, or a sport gradient (SPORT_THEME ink/deep) when there is none. */
export function TournamentCover({ t, height }: { t: Pick<Tournament, "sport" | "imageUrl">; height: number | Record<string, number> }) {
    const c = getSportTheme(t.sport);
    return (
        <Box
            aria-hidden
            sx={{
                height,
                backgroundImage: t.imageUrl ? `url(${t.imageUrl})` : `linear-gradient(135deg, ${c.ink}, ${c.deep})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        />
    );
}

function bottomLine(t: Tournament): { text: string; success?: boolean } | null {
    switch (t.status) {
        case "REGISTRATION_OPEN":
            return t.registrationClosesAt
                ? { text: `ההרשמה פתוחה עד ${shortDate(t.registrationClosesAt)}`, success: closesSoon(t.registrationClosesAt) }
                : { text: "ההרשמה פתוחה" };
        case "CANCELLED":
            return { text: "הטורניר בוטל" };
        case "DRAFT":
            return { text: "טיוטה: רק מנהלי הטורניר רואים אותה" };
        default:
            return null;
    }
}

export default function TournamentCard({ t }: { t: Tournament }) {
    const c = getSportTheme(t.sport);
    const approved = t.approvedTeams ?? 0;
    const full = t.maxTeams > 0 && approved >= t.maxTeams;
    const pct = t.maxTeams > 0 ? Math.min(100, Math.round((approved / t.maxTeams) * 100)) : 0;
    const line = bottomLine(t);
    return (
        <ButtonBase
            component={Link}
            href={`/tournaments/${t.id}`}
            data-testid={`tournament-card-${t.id}`}
            aria-label={t.title}
            sx={{
                display: "block",
                width: "100%",
                textAlign: "start",
                borderRadius: 3,
                overflow: "hidden",
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                opacity: t.status === "DRAFT" ? 0.85 : 1,
                transition: "box-shadow .15s",
                "&:hover": { boxShadow: 3 },
            }}
        >
            <Box sx={{ position: "relative" }}>
                <TournamentCover t={t} height={{ xs: 120, sm: 150 }} />
                <Box sx={{ position: "absolute", top: 8, insetInlineStart: 8 }}>
                    <TournamentStatusChip status={t.status} />
                </Box>
                <Box
                    aria-hidden
                    sx={{ position: "absolute", top: 8, insetInlineEnd: 8, fontSize: 20, bgcolor: alpha("#000", 0.35), borderRadius: "50%", width: 34, height: 34, display: "grid", placeItems: "center" }}
                >
                    {(SPORT_EMOJI as Record<string, string>)[t.sport]}
                </Box>
            </Box>
            <Box sx={{ p: 2 }}>
                <Typography
                    variant="h6"
                    sx={{ fontWeight: 800, lineHeight: 1.25, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, overflow: "hidden" }}
                >
                    {t.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.5 }}>
                    {`📅 ${dateRangeLabel(t.startsAt, t.endsAt)}${t.customLocation ? ` · 📍 ${t.customLocation}` : ""}`}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 1.5 }}>
                    <Box
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={t.maxTeams}
                        aria-valuenow={approved}
                        sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}
                    >
                        <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: full ? "text.disabled" : c.base }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {full ? "מלא · רשימת המתנה" : `${approved}/${t.maxTeams} קבוצות`}
                    </Typography>
                </Box>
                {line && (
                    <Typography variant="caption" sx={{ display: "block", mt: 0.5 }} color={line.success ? "success.main" : "text.secondary"}>
                        {line.text}
                    </Typography>
                )}
            </Box>
        </ButtonBase>
    );
}
