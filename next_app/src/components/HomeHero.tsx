"use client";

import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Link from "next/link";
import { Add, DirectionsRun } from "@mui/icons-material";

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
                bgcolor: "#0047AB", // Fallback blue
                backgroundImage: "url(/hero_bg.jpg)",
                backgroundSize: "cover",
                backgroundPosition: "center",
                minHeight: "500px", // Adjust based on image aspect
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
                color: "white",
                mb: 4,
                borderRadius: { xs: 0, md: "0 0 32px 32px" },
                overflow: "hidden",
                pt: 8,
                pb: 12,
            }}
        >
            {/* Overlay to ensure text readability if needed, though image provided looks clean. 
          Assuming image text is sufficient or we write over it. 
          User image has text "JoinUp". I should recreate it or use image as background?
          "I want the top part ... to look like this [image with text]".
          Usually better to maintain text in HTML for SEO/A11y. 
          I will render the text. 
      */}

            <Container maxWidth="sm">
                <Typography
                    variant="h1"
                    component="h1"
                    sx={{
                        fontWeight: 800,
                        fontSize: { xs: "3.5rem", md: "5rem" },
                        mb: 1,
                        textShadow: "0px 4px 10px rgba(0,0,0,0.3)"
                    }}
                >
                    JoinUp
                </Typography>

                <Typography
                    variant="h5"
                    component="h2"
                    sx={{
                        fontWeight: 500,
                        mb: 6,
                        opacity: 0.95,
                        direction: "rtl",
                        textShadow: "0px 2px 5px rgba(0,0,0,0.3)"
                    }}
                >
                    אפליקציית הספורט של ישראל
                </Typography>

                <Stack spacing={2} width="100%" maxWidth="300px" mx="auto">
                    {/* Create Game Button - Neon Volt (High Contrast) */}
                    <Link href="/games/new" passHref legacyBehavior>
                        <Button
                            component="a"
                            variant="contained"
                            size="large"
                            sx={{
                                borderRadius: "50px",
                                py: 1.5,
                                bgcolor: "#C6FF00", // Neon Volt from Dark Theme
                                color: "#000000",
                                fontSize: "1.1rem",
                                fontWeight: "800",
                                textTransform: "none",
                                display: "flex",
                                justifyContent: "center",
                                gap: 1,
                                direction: "rtl",
                                boxShadow: "0px 4px 15px rgba(198, 255, 0, 0.3)",
                                "&:hover": {
                                    bgcolor: "#b2e600",
                                    boxShadow: "0px 6px 20px rgba(198, 255, 0, 0.5)",
                                }
                            }}
                        >
                            צור משחק <Add />
                        </Button>
                    </Link>

                    {/* Join Game Button - Outlined White */}
                    <Button
                        variant="outlined"
                        size="large"
                        onClick={scrollToGames}
                        sx={{
                            borderRadius: "50px",
                            py: 1.5,
                            borderColor: "rgba(255,255,255,0.9)",
                            color: "white",
                            borderWidth: "2px",
                            fontSize: "1.1rem",
                            fontWeight: "bold",
                            textTransform: "none",
                            display: "flex",
                            justifyContent: "center",
                            gap: 1,
                            direction: "rtl",
                            backdropFilter: "blur(4px)",
                            "&:hover": {
                                borderColor: "#ffffff",
                                bgcolor: "rgba(255,255,255,0.15)",
                                borderWidth: "2px",
                            }
                        }}
                    >
                        הצטרף למשחק <DirectionsRun />
                    </Button>
                </Stack>
            </Container>
        </Box>
    );
}
