import React, { useId } from "react";
import Box from "@mui/material/Box";
import type { SxProps, Theme } from "@mui/material/styles";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";

import SafeImage from "@/components/ui/SafeImage";
import { getSportTheme } from "@/utils/sports";

/*
 * Generated sport cover art: a deep per-sport gradient, the sport's court/pitch markings
 * drawn as thin white lines (tilted for motion), a soft glow and an oversized faint ball
 * glyph. Replaces the three repeated stock photos so every card reads as "this sport" at a
 * glance, stays crisp at any size, weighs nothing, and matches the mobile app's SportCover.
 *
 * All drawing happens in a 400x200 viewBox sliced to fill the box, so it works for short
 * card headers and tall page heroes alike.
 */

const LINE = { fill: "none", stroke: "#fff", strokeWidth: 2.2, vectorEffect: "non-scaling-stroke" as const };

function SoccerLines() {
    return (
        <g {...LINE}>
            <rect x="20" y="14" width="360" height="172" rx="2" />
            <line x1="200" y1="14" x2="200" y2="186" />
            <circle cx="200" cy="100" r="30" />
            <circle cx="200" cy="100" r="2" fill="#fff" />
            <rect x="20" y="52" width="58" height="96" />
            <rect x="20" y="78" width="22" height="44" />
            <path d="M78 82 A24 24 0 0 1 78 118" />
            <rect x="322" y="52" width="58" height="96" />
            <rect x="358" y="78" width="22" height="44" />
            <path d="M322 82 A24 24 0 0 0 322 118" />
        </g>
    );
}

function BasketballLines() {
    return (
        <g {...LINE}>
            <rect x="20" y="14" width="360" height="172" rx="2" />
            <line x1="200" y1="14" x2="200" y2="186" />
            <circle cx="200" cy="100" r="26" />
            <rect x="20" y="72" width="76" height="56" />
            <circle cx="96" cy="100" r="22" />
            <path d="M20 26 H58 A84 84 0 0 1 58 174 H20" />
            <circle cx="34" cy="100" r="5" />
            <rect x="304" y="72" width="76" height="56" />
            <circle cx="304" cy="100" r="22" />
            <path d="M380 26 H342 A84 84 0 0 0 342 174 H380" />
            <circle cx="366" cy="100" r="5" />
        </g>
    );
}

function TennisLines() {
    return (
        <g {...LINE}>
            <rect x="30" y="26" width="340" height="148" rx="1" />
            <line x1="30" y1="46" x2="370" y2="46" />
            <line x1="30" y1="154" x2="370" y2="154" />
            <line x1="112" y1="46" x2="112" y2="154" />
            <line x1="288" y1="46" x2="288" y2="154" />
            <line x1="112" y1="100" x2="288" y2="100" />
            <line x1="200" y1="18" x2="200" y2="182" strokeWidth={4} />
        </g>
    );
}

const COURTS: Record<string, () => React.ReactElement> = {
    SOCCER: SoccerLines,
    BASKETBALL: BasketballLines,
    TENNIS: TennisLines,
};

const GLYPHS = {
    SOCCER: SportsSoccerIcon,
    BASKETBALL: SportsBasketballIcon,
    TENNIS: SportsTennisIcon,
} as const;

export default function SportCover({
    sport,
    height = 132,
    children,
    sx,
    lineOpacity = 0.32,
    image,
}: {
    sport?: string | null;
    height?: number | string | Record<string, number | string>;
    children?: React.ReactNode;
    sx?: SxProps<Theme>;
    /** Court-marking opacity; raise slightly for large heroes, lower behind dense overlays. */
    lineOpacity?: number;
    /**
     * Optional photo (e.g. the field's) shown under a sport-tinted wash. The court markings and ball
     * glyph stay on top, so the sport is still obvious and cards stay distinguishable by sport.
     */
    image?: string | null;
}) {
    const id = useId().replace(/:/g, "");
    const theme = getSportTheme(sport);
    const key = sport && sport in COURTS ? sport : "SOCCER";
    const Court = COURTS[key];
    const Glyph = GLYPHS[key as keyof typeof GLYPHS];
    const photo = image && image.trim().length > 0 ? image : null;

    return (
        <Box
            sx={[
                {
                    position: "relative",
                    overflow: "hidden",
                    height,
                    isolation: "isolate",
                    background: `linear-gradient(135deg, ${theme.deep} 0%, ${theme.ink} 100%)`,
                },
                ...(Array.isArray(sx) ? sx : [sx]),
            ]}
        >
            {photo && (
                <>
                    <SafeImage
                        src={photo}
                        alt=""
                        aria-hidden
                        loading="lazy"
                        fallback={null}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <Box
                        aria-hidden
                        sx={{
                            position: "absolute",
                            inset: 0,
                            background: `linear-gradient(135deg, ${theme.deep}d9 0%, ${theme.ink}cc 100%)`,
                        }}
                    />
                </>
            )}
            <Box
                component="svg"
                aria-hidden
                viewBox="0 0 400 200"
                preserveAspectRatio="xMidYMid slice"
                sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
            >
                <defs>
                    <radialGradient id={`g-${id}`} cx="85%" cy="0%" r="75%">
                        <stop offset="0%" stopColor={theme.glow} stopOpacity="0.55" />
                        <stop offset="60%" stopColor={theme.base} stopOpacity="0.12" />
                        <stop offset="100%" stopColor={theme.base} stopOpacity="0" />
                    </radialGradient>
                    <linearGradient id={`s-${id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="55%" stopColor="#000" stopOpacity="0" />
                        <stop offset="100%" stopColor="#000" stopOpacity="0.35" />
                    </linearGradient>
                </defs>
                <rect width="400" height="200" fill={`url(#g-${id})`} />
                <g opacity={photo ? Math.max(lineOpacity, 0.45) : lineOpacity} transform="translate(200 100) rotate(-9) scale(1.18) translate(-200 -100)">
                    <Court />
                </g>
                <rect width="400" height="200" fill={`url(#s-${id})`} />
            </Box>
            <Glyph
                aria-hidden
                sx={{
                    position: "absolute",
                    fontSize: 170,
                    insetInlineStart: -34,
                    bottom: -54,
                    color: theme.glow,
                    opacity: 0.22,
                    transform: "rotate(-18deg)",
                    pointerEvents: "none",
                }}
            />
            <Box aria-hidden className="joinup-grain" sx={{ opacity: 0.35 }} />
            {children && (
                <Box sx={{ position: "absolute", inset: 0, zIndex: 1 }}>{children}</Box>
            )}
        </Box>
    );
}
