"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import SportCover from "@/components/ui/SportCover";
import TournamentStatusChip from "../TournamentStatusChip";
import { SPORT_EMOJI, getSportTheme } from "@/utils/sports";
import type { Tournament } from "@/types/tournament";
import { closesSoon, dateRangeLabel, shortDate } from "./shellModel";

/** Cover: rich sport court cover (or custom image with sport wash). */
export function TournamentCover({ t, height }: { t: Pick<Tournament, "sport" | "imageUrl">; height: number | Record<string, number> }) {
    return <SportCover sport={t.sport} image={t.imageUrl} height={height} lineOpacity={0.34} />;
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
            sx={(theme) => ({
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                width: "100%",
                textAlign: "start",
                borderRadius: 2.5,
                overflow: "hidden",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                boxShadow: theme.shadows[1],
                opacity: t.status === "DRAFT" ? 0.85 : 1,
                transition: "transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease",
                "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: theme.shadows[3],
                    borderColor: alpha(theme.palette.primary.main, 0.4),
                },
            })}
        >
            <Box sx={{ position: "relative" }}>
                <TournamentCover t={t} height={{ xs: 124, sm: 148 }} />
                <Box sx={{ position: "absolute", top: 10, insetInlineStart: 10, zIndex: 2 }}>
                    <TournamentStatusChip status={t.status} />
                </Box>
                <Box
                    aria-hidden
                    sx={{
                        position: "absolute",
                        top: 10,
                        insetInlineEnd: 10,
                        zIndex: 2,
                        fontSize: 18,
                        bgcolor: alpha("#000", 0.45),
                        backdropFilter: "blur(6px)",
                        border: "1px solid rgba(255,255,255,0.18)",
                        borderRadius: "50%",
                        width: 36,
                        height: 36,
                        display: "grid",
                        placeItems: "center",
                    }}
                >
                    {(SPORT_EMOJI as Record<string, string>)[t.sport]}
                </Box>
            </Box>
            <Box sx={{ p: 2.25, flex: 1, display: "flex", flexDirection: "column" }}>
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 800,
                        letterSpacing: "-0.02em",
                        lineHeight: 1.25,
                        display: "-webkit-box",
                        WebkitBoxOrient: "vertical",
                        WebkitLineClamp: 2,
                        overflow: "hidden",
                    }}
                >
                    {t.title}
                </Typography>
                <Typography variant="body2" color="text.secondary" noWrap sx={{ mt: 0.75, fontWeight: 500 }}>
                    {`📅 ${dateRangeLabel(t.startsAt, t.endsAt)}${t.customLocation ? ` · 📍 ${t.customLocation}` : ""}`}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, mt: "auto", pt: 1.75 }}>
                    <Box
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={t.maxTeams}
                        aria-valuenow={approved}
                        sx={{ flex: 1, height: 7, borderRadius: 4, bgcolor: "action.hover", overflow: "hidden" }}
                    >
                        <Box sx={{ width: `${pct}%`, height: "100%", borderRadius: 4, bgcolor: full ? "text.disabled" : c.base }} />
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                        {full ? "מלא · רשימת המתנה" : `${approved}/${t.maxTeams} קבוצות`}
                    </Typography>
                </Box>
                {line && (
                    <Typography
                        variant="caption"
                        sx={{ display: "block", mt: 0.75, fontWeight: line.success ? 700 : 500 }}
                        color={line.success ? "success.main" : "text.secondary"}
                    >
                        {line.text}
                    </Typography>
                )}
            </Box>
        </ButtonBase>
    );
}
