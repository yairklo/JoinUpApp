"use client";

import { useState, useEffect, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClerkLoaded, SignedIn, useUser } from "@clerk/nextjs";

// MUI Imports
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import { alpha, useTheme } from "@mui/material/styles";

// Icons
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import SearchIcon from "@mui/icons-material/Search";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import StadiumOutlinedIcon from "@mui/icons-material/StadiumOutlined";
import AddIcon from "@mui/icons-material/Add";

// Internal Components & Context
import AuthButtons from "@/components/AuthButtons";
import { ColorModeContext } from "@/components/theme/themeRegistry";
import ChatList from "@/components/ChatList";
import NotificationPanel from "@/components/NotificationPanel";
import GlobalSearchOmnibar from "@/components/GlobalSearchOmnibar";
import { useNotificationCounters } from "@/context/NotificationCountersContext";

export default function AppNavbar() {
  const [mounted, setMounted] = useState(false);
  const { mode, toggleColorMode } = useContext(ColorModeContext);
  const { user } = useUser();
  const router = useRouter();
  const theme = useTheme();
  const { friendRequests } = useNotificationCounters();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{
        bgcolor: alpha(theme.palette.background.paper, 0.88),
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: 1,
        borderColor: "divider",
        pt: "env(safe-area-inset-top, 0px)",
      }}
    >
      <Container maxWidth="lg" sx={{ px: { xs: 1.5, sm: 2 } }}>
        <Toolbar
          disableGutters
          sx={{
            justifyContent: "space-between",
            minHeight: { xs: 56, md: 68 },
            gap: 1,
          }}
        >
          {/* Start: Logo + desktop nav links */}
          <Stack direction="row" alignItems="center" spacing={{ xs: 0.75, md: 2.5 }} sx={{ minWidth: 0 }}>
            <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: "pointer" }}>
                <Box
                  sx={{
                    width: { xs: 34, md: 38 },
                    height: { xs: 34, md: 38 },
                    borderRadius: "11px",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    boxShadow: "0 4px 12px rgba(5,150,105,0.35)",
                    flexShrink: 0,
                  }}
                >
                  <SportsSoccerIcon sx={{ fontSize: { xs: 18, md: 20 } }} />
                </Box>
                <Typography
                  variant="h6"
                  component="div"
                  sx={{
                    fontWeight: 800,
                    letterSpacing: "-0.5px",
                    color: "text.primary",
                    fontSize: { xs: "1.05rem", md: "1.25rem" },
                  }}
                >
                  JoinUp
                </Typography>
              </Stack>
            </Link>

            {/* Desktop navigation */}
            <Stack direction="row" spacing={0.5} sx={{ display: { xs: "none", md: "flex" } }}>
              <Button
                component={Link}
                href="/search"
                startIcon={<SearchIcon />}
                sx={navLinkSx}
              >
                חיפוש משחקים
              </Button>
              <Button
                component={Link}
                href="/fields"
                startIcon={<StadiumOutlinedIcon />}
                sx={navLinkSx}
              >
                מגרשים
              </Button>
            </Stack>
          </Stack>

          {/* Center: Global search (desktop, signed-in) */}
          {mounted && (
            <ClerkLoaded>
              <SignedIn>
                <Box
                  sx={{
                    flexGrow: 1,
                    display: { xs: "none", md: "flex" },
                    justifyContent: "center",
                    px: 2,
                  }}
                >
                  <GlobalSearchOmnibar />
                </Box>
              </SignedIn>
            </ClerkLoaded>
          )}

          {/* End: actions – keep lean on mobile (BottomNav covers primary destinations) */}
          <Stack direction="row" alignItems="center" spacing={{ xs: 0, md: 0.75 }}>
            <Button
              component={Link}
              href="/games/new"
              variant="contained"
              startIcon={<AddIcon />}
              sx={{
                display: { xs: "none", md: "inline-flex" },
                px: 2.25,
                boxShadow: "0 4px 14px rgba(5,150,105,0.3)",
              }}
            >
              צור משחק
            </Button>

            <Tooltip title={mode === "dark" ? "מצב בהיר" : "מצב כהה"}>
              <IconButton
                onClick={toggleColorMode}
                color="inherit"
                size="small"
                sx={{ p: { xs: 0.75, md: 1 }, display: { xs: "none", sm: "inline-flex" } }}
              >
                {mode === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>

            {mounted && (
              <ClerkLoaded>
                <SignedIn>
                  {user && <NotificationPanel />}

                  {user && (
                    <ChatList
                      userId={user.id}
                      onChatSelect={(chatId) => router.push(`/chat/${chatId}`)}
                    />
                  )}

                  {user && (
                    <Tooltip title="חברים">
                      <IconButton
                        color="inherit"
                        size="small"
                        sx={{ p: 1, display: { xs: "none", md: "inline-flex" } }}
                        onClick={() => router.push("/profile")}
                      >
                        <Badge badgeContent={friendRequests} color="error">
                          <PeopleAltOutlinedIcon fontSize="small" />
                        </Badge>
                      </IconButton>
                    </Tooltip>
                  )}
                </SignedIn>
              </ClerkLoaded>
            )}

            <Box sx={{ marginInlineStart: 0.25, display: "flex", alignItems: "center" }}>
              <AuthButtons />
            </Box>
          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}

const navLinkSx = {
  color: "text.secondary",
  fontWeight: 600,
  px: 1.5,
  borderRadius: 2.5,
  "&:hover": { color: "primary.main", bgcolor: "action.hover" },
} as const;
