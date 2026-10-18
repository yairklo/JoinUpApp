"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { motion, useReducedMotion } from "framer-motion";
import AddIcon from "@mui/icons-material/Add";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import ExploreIcon from "@mui/icons-material/Explore";

import { getSportTheme } from "@/utils/sports";

const EASE = [0.16, 1, 0.3, 1] as const;

const SPORT_TILES = [
    { Icon: SportsSoccerIcon, sport: "SOCCER" },
    { Icon: SportsBasketballIcon, sport: "BASKETBALL" },
    { Icon: SportsTennisIcon, sport: "TENNIS" },
] as const;

function greetingForHour(hour: number): string {
    if (hour >= 5 && hour < 12) return "בוקר טוב";
    if (hour >= 12 && hour < 17) return "צהריים טובים";
    if (hour >= 17 && hour < 22) return "ערב טוב";
    return "לילה טוב";
}

/** Shared ambient backdrop: deep emerald gradient, glow blobs and grain. */
function HeroBackdrop() {
    return (
        <>
            <Box
                aria-hidden
                className="joinup-blob"
                sx={{
                    position: "absolute",
                    width: { xs: 280, md: 480 },
                    height: { xs: 280, md: 480 },
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(52,211,153,0.35) 0%, transparent 70%)",
                    top: { xs: -120, md: -160 },
                    insetInlineEnd: { xs: -90, md: -120 },
                    pointerEvents: "none",
                }}
            />
            <Box
                aria-hidden
                className="joinup-blob"
                sx={{
                    position: "absolute",
                    width: { xs: 220, md: 380 },
                    height: { xs: 220, md: 380 },
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(249,115,22,0.22) 0%, transparent 70%)",
                    bottom: { xs: -110, md: -140 },
                    insetInlineStart: { xs: -80, md: -100 },
                    pointerEvents: "none",
                    animationDelay: "-6s",
                    animationDirection: "reverse",
                }}
            />
            <Box aria-hidden className="joinup-grain" />
        </>
    );
}

const heroShellSx = {
    position: "relative",
    overflow: "hidden",
    color: "white",
    backgroundImage: `
        linear-gradient(160deg, rgba(4,47,36,0.94) 0%, rgba(6,78,59,0.82) 45%, rgba(5,150,105,0.62) 100%),
        url(/hero_bg.jpg)
    `,
    backgroundSize: "cover",
    backgroundPosition: "center",
} as const;

/**
 * Signed-in variant: returning players came to find a game, not to be pitched the product
 * again — a compact greeting strip with a search affordance keeps the feed above the fold.
 */
function ReturningHero() {
    const { user } = useUser();
    const firstName = user?.firstName?.trim().split(/\s+/)[0];
    const greeting = greetingForHour(
        Number(new Date().toLocaleString("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hour12: false })) % 24
    );

    return (
        <Box
            sx={{
                ...heroShellSx,
                mb: { xs: 2, md: 4 },
                borderRadius: { xs: "0 0 28px 28px", md: "0 0 40px 40px" },
            }}
        >
            <HeroBackdrop />
            <Container maxWidth="md" sx={{ position: "relative", py: { xs: 3, md: 5 }, px: { xs: 2.5, sm: 3 } }}>
                <Box className="joinup-hero-item">
                    <Typography
                        suppressHydrationWarning
                        sx={{ fontSize: { xs: "0.9rem", md: "1rem" }, fontWeight: 600, color: "#a7f3d0", mb: 0.5 }}
                    >
                        {greeting}{firstName ? `, ${firstName}` : ""} 👋
                    </Typography>
                    <Typography
                        component="h1"
                        sx={{
                            fontWeight: 800,
                            fontSize: { xs: "1.6rem", sm: "2rem", md: "2.5rem" },
                            lineHeight: 1.15,
                            letterSpacing: "-0.02em",
                            mb: { xs: 2, md: 3 },
                        }}
                    >
                        מה משחקים היום?
                    </Typography>
                </Box>

                <Box className="joinup-hero-item" sx={{ animationDelay: "90ms" }}>
                    <ButtonBase
                        component={Link}
                        href="/search"
                        aria-label="חיפוש משחקים"
                        sx={{
                            width: "100%",
                            maxWidth: 560,
                            justifyContent: "flex-start",
                            gap: 1.25,
                            px: 2,
                            height: 52,
                            borderRadius: 999,
                            color: "rgba(255,255,255,0.78)",
                            fontFamily: "inherit",
                            fontSize: "0.95rem",
                            fontWeight: 500,
                            bgcolor: "rgba(255,255,255,0.12)",
                            border: "1px solid rgba(255,255,255,0.2)",
                            backdropFilter: "blur(10px)",
                            transition: "background-color 150ms ease, border-color 150ms ease",
                            "&:hover": { bgcolor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.35)" },
                        }}
                    >
                        <SearchRoundedIcon sx={{ color: "#6ee7b7" }} />
                        חפשו משחק, מגרש או עיר
                    </ButtonBase>
                </Box>
            </Container>
        </Box>
    );
}

function WelcomeHero() {
    const reduced = useReducedMotion();

    return (
        <Box
            sx={{
                ...heroShellSx,
                mb: { xs: 2.5, md: 5 },
                borderRadius: { xs: "0 0 28px 28px", md: "0 0 40px 40px" },
            }}
        >
            <HeroBackdrop />

            <Container
                maxWidth="md"
                sx={{
                    position: "relative",
                    textAlign: "center",
                    // Compact on phones so the first game rail peeks above the fold
                    pt: { xs: 4, sm: 7, md: 11 },
                    pb: { xs: 4, sm: 8, md: 12 },
                    px: { xs: 2.5, sm: 3 },
                }}
            >
                {/* CSS-driven entrance animation (see .joinup-hero-item in globals.css): this
                    content is static and must be visible in the server-rendered HTML on first
                    paint, not gated behind client JS hydration. */}
                <Box className="joinup-hero-item" sx={{ animationDelay: "50ms" }}>
                    <Chip
                        label="קהילת הספורט של ישראל"
                        size="small"
                        sx={{
                            mb: { xs: 1.5, md: 3 },
                            color: "#a7f3d0",
                            bgcolor: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(167,243,208,0.35)",
                            backdropFilter: "blur(6px)",
                            fontWeight: 600,
                            letterSpacing: 0.3,
                            fontSize: { xs: "0.7rem", md: "0.8125rem" },
                        }}
                    />
                </Box>

                <Box className="joinup-hero-item" sx={{ animationDelay: "130ms" }}>
                    <Typography
                        variant="h1"
                        component="h1"
                        sx={{
                            fontWeight: 800,
                            fontSize: { xs: "1.85rem", sm: "2.6rem", md: "4.25rem" },
                            lineHeight: 1.1,
                            letterSpacing: "-0.025em",
                            mb: { xs: 1, md: 2 },
                            textShadow: "0 4px 24px rgba(0,0,0,0.35)",
                        }}
                    >
                        מוצאים משחק.
                        <br />
                        <Box
                            component="span"
                            sx={{
                                backgroundImage: "linear-gradient(90deg, #6ee7b7 0%, #fde047 55%, #fdba74 100%)",
                                backgroundClip: "text",
                                WebkitBackgroundClip: "text",
                                color: "transparent",
                            }}
                        >
                            מצטרפים. משחקים.
                        </Box>
                    </Typography>
                </Box>

                <Box className="joinup-hero-item" sx={{ animationDelay: "210ms" }}>
                    <Typography
                        component="p"
                        sx={{
                            fontWeight: 400,
                            mb: { xs: 2.5, md: 4 },
                            color: "rgba(255,255,255,0.82)",
                            maxWidth: 520,
                            mx: "auto",
                            fontSize: { xs: "0.95rem", sm: "1.1rem", md: "1.25rem" },
                            lineHeight: 1.5,
                        }}
                    >
                        כדורגל, כדורסל וטניס באזורך — גלו מה פתוח עכשיו, או פתחו משחק בעצמכם.
                    </Typography>
                </Box>

                {/* Sport tiles, tinted with each sport's identity color – hidden on phones */}
                <Box className="joinup-hero-item" sx={{ animationDelay: "290ms" }}>
                    <Stack
                        direction="row"
                        spacing={1.5}
                        justifyContent="center"
                        sx={{ mb: { xs: 2.5, md: 4 }, display: { xs: "none", sm: "flex" } }}
                    >
                        {SPORT_TILES.map(({ Icon, sport }) => {
                            const c = getSportTheme(sport);
                            return (
                                <Box
                                    key={sport}
                                    component={motion.div}
                                    whileHover={reduced ? undefined : { y: -4, scale: 1.08 }}
                                    transition={{ duration: 0.18, ease: EASE }}
                                    sx={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: "16px",
                                        display: "grid",
                                        placeItems: "center",
                                        background: `linear-gradient(145deg, ${c.base}55 0%, ${c.deep}66 100%)`,
                                        border: "1px solid rgba(255,255,255,0.2)",
                                        backdropFilter: "blur(6px)",
                                    }}
                                >
                                    <Icon sx={{ fontSize: 24, color: c.glow }} />
                                </Box>
                            );
                        })}
                    </Stack>
                </Box>

                <Box className="joinup-hero-item" sx={{ animationDelay: "370ms" }}>
                    <Stack
                        direction={{ xs: "column", sm: "row" }}
                        spacing={1.25}
                        justifyContent="center"
                        alignItems="center"
                        sx={{ width: "100%", mx: "auto" }}
                    >
                        <Button
                            component={Link}
                            href="/search"
                            variant="contained"
                            size="large"
                            startIcon={<ExploreIcon />}
                            sx={{
                                width: { xs: "100%", sm: "auto" },
                                maxWidth: { xs: 320, sm: "none" },
                                minWidth: { sm: 200 },
                                py: { xs: 1.35, md: 1.5 },
                                fontSize: { xs: "1rem", md: "1.05rem" },
                                bgcolor: "#10b981",
                                color: "#022c22",
                                boxShadow: "0 10px 30px rgba(16,185,129,0.45)",
                                "&:hover": { bgcolor: "#34d399" },
                            }}
                        >
                            גלה את כל המשחקים השבוע
                        </Button>

                        {/* Secondary CTA: full button on sm+, a quiet text link on phones
                            (the bottom nav's + button already covers "create" there). */}
                        <Button
                            component={Link}
                            href="/games/new"
                            variant="outlined"
                            size="large"
                            startIcon={<AddIcon />}
                            sx={{
                                display: { xs: "none", sm: "inline-flex" },
                                minWidth: 200,
                                py: { xs: 1.35, md: 1.5 },
                                fontSize: { xs: "1rem", md: "1.05rem" },
                                color: "white",
                                borderColor: "rgba(255,255,255,0.5)",
                                backdropFilter: "blur(4px)",
                                "&:hover": { borderColor: "white", bgcolor: "rgba(255,255,255,0.1)" },
                            }}
                        >
                            צור משחק חדש
                        </Button>
                        <Button
                            component={Link}
                            href="/games/new"
                            size="small"
                            startIcon={<AddIcon fontSize="small" />}
                            sx={{
                                display: { xs: "inline-flex", sm: "none" },
                                color: "rgba(255,255,255,0.85)",
                                fontWeight: 600,
                                "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
                            }}
                        >
                            או פתחו משחק משלכם
                        </Button>
                    </Stack>
                </Box>
            </Container>
        </Box>
    );
}

export default function HomeHero({ signedIn = false }: { signedIn?: boolean }) {
    return signedIn ? <ReturningHero /> : <WelcomeHero />;
}
