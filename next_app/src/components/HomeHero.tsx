"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Link from "next/link";
import AddIcon from "@mui/icons-material/Add";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import SportsBasketballIcon from "@mui/icons-material/SportsBasketball";
import SportsTennisIcon from "@mui/icons-material/SportsTennis";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";

export default function HomeHero() {
    const scrollToGames = () => {
        const element = document.getElementById("games-feed");
        if (element) {
            element.scrollIntoView({ behavior: "smooth" });
        }
    };

    return (
        <Box
            sx={{
                position: "relative",
                overflow: "hidden",
                color: "white",
                mb: { xs: 3, md: 5 },
                borderRadius: { xs: 0, md: "0 0 40px 40px" },
                backgroundImage: `
                    linear-gradient(160deg, rgba(4,47,36,0.9) 0%, rgba(6,78,59,0.75) 45%, rgba(5,150,105,0.55) 100%),
                    url(/hero_bg.jpg)
                `,
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    width: { xs: 280, md: 480 },
                    height: { xs: 280, md: 480 },
                    borderRadius: "50%",
                    background: "radial-gradient(circle, rgba(52,211,153,0.35) 0%, transparent 70%)",
                    top: { xs: -100, md: -160 },
                    insetInlineEnd: { xs: -80, md: -120 },
                    pointerEvents: "none",
                }}
            />

            <Container
                maxWidth="md"
                sx={{
                    position: "relative",
                    textAlign: "center",
                    // Compact first viewport on phones – CTAs sit above the fold
                    pt: { xs: 5, sm: 7, md: 11 },
                    pb: { xs: 5.5, sm: 8, md: 12 },
                    px: { xs: 2.5, sm: 3 },
                }}
            >
                <Chip
                    label="קהילת הספורט של ישראל"
                    size="small"
                    sx={{
                        mb: { xs: 2, md: 3 },
                        color: "#a7f3d0",
                        bgcolor: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(167,243,208,0.35)",
                        backdropFilter: "blur(6px)",
                        fontWeight: 600,
                        letterSpacing: 0.3,
                        fontSize: { xs: "0.7rem", md: "0.8125rem" },
                    }}
                />

                <Typography
                    variant="h1"
                    component="h1"
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: "2rem", sm: "2.6rem", md: "4rem" },
                        lineHeight: 1.15,
                        mb: { xs: 1.25, md: 2 },
                        textShadow: "0 4px 24px rgba(0,0,0,0.35)",
                    }}
                >
                    מוצאים משחק.
                    <br />
                    <Box component="span" sx={{ color: "#6ee7b7" }}>
                        מצטרפים. משחקים.
                    </Box>
                </Typography>

                <Typography
                    variant="h6"
                    component="h2"
                    sx={{
                        fontWeight: 400,
                        mb: { xs: 2.5, md: 4 },
                        color: "rgba(255,255,255,0.85)",
                        maxWidth: 520,
                        mx: "auto",
                        fontSize: { xs: "0.95rem", sm: "1.1rem", md: "1.25rem" },
                        lineHeight: 1.45,
                        px: { xs: 0.5, md: 0 },
                    }}
                >
                    כדורגל, כדורסל וטניס ליד הבית – מצאו משחק או פתחו אחד תוך שניות.
                </Typography>

                {/* Sport icons – hidden on the narrowest phones to keep the hero lean */}
                <Stack
                    direction="row"
                    spacing={1.5}
                    justifyContent="center"
                    sx={{ mb: { xs: 2.5, md: 4 }, display: { xs: "none", sm: "flex" } }}
                >
                    {[SportsSoccerIcon, SportsBasketballIcon, SportsTennisIcon].map((Icon, i) => (
                        <Box
                            key={i}
                            sx={{
                                width: 44,
                                height: 44,
                                borderRadius: "14px",
                                display: "grid",
                                placeItems: "center",
                                bgcolor: "rgba(255,255,255,0.1)",
                                border: "1px solid rgba(255,255,255,0.18)",
                                backdropFilter: "blur(6px)",
                            }}
                        >
                            <Icon sx={{ fontSize: 24, color: "#d1fae5" }} />
                        </Box>
                    ))}
                </Stack>

                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.25}
                    justifyContent="center"
                    alignItems="stretch"
                    sx={{ width: "100%", maxWidth: { xs: 320, sm: "none" }, mx: "auto" }}
                >
                    <Button
                        component={Link}
                        href="/games/new"
                        variant="contained"
                        size="large"
                        startIcon={<AddIcon />}
                        sx={{
                            width: { xs: "100%", sm: "auto" },
                            minWidth: { sm: 200 },
                            py: { xs: 1.35, md: 1.5 },
                            fontSize: { xs: "1rem", md: "1.05rem" },
                            bgcolor: "#10b981",
                            color: "#022c22",
                            boxShadow: "0 10px 30px rgba(16,185,129,0.45)",
                            "&:hover": { bgcolor: "#34d399" },
                        }}
                    >
                        צור משחק חדש
                    </Button>

                    <Button
                        variant="outlined"
                        size="large"
                        onClick={scrollToGames}
                        endIcon={<KeyboardArrowDownIcon />}
                        sx={{
                            width: { xs: "100%", sm: "auto" },
                            minWidth: { sm: 200 },
                            py: { xs: 1.35, md: 1.5 },
                            fontSize: { xs: "1rem", md: "1.05rem" },
                            color: "white",
                            borderColor: "rgba(255,255,255,0.5)",
                            backdropFilter: "blur(4px)",
                            "&:hover": {
                                borderColor: "white",
                                bgcolor: "rgba(255,255,255,0.1)",
                            },
                        }}
                    >
                        הצטרף למשחק
                    </Button>
                </Stack>
            </Container>
        </Box>
    );
}
