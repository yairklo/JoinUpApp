"use client";

import { useState, useEffect, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClerkLoaded, SignedIn, useUser } from "@clerk/nextjs";

// MUI Imports
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import { alpha, useTheme } from "@mui/material/styles";
import { motion } from "framer-motion";

// Icons
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import StadiumOutlinedIcon from "@mui/icons-material/StadiumOutlined";
import AddIcon from "@mui/icons-material/Add";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import EmojiEventsRounded from "@mui/icons-material/EmojiEventsRounded";

// Internal Components & Context
import AuthButtons from "@/components/AuthButtons";
import JoinUpLogo from "@/components/brand/JoinUpLogo";
import { ColorModeContext } from "@/components/theme/themeRegistry";
import ChatList from "@/components/ChatList";
import NotificationPanel from "@/components/NotificationPanel";
import GlobalSearchOmnibar from "@/components/GlobalSearchOmnibar";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useTournamentsNav } from "@/components/tournaments/shell/useTournamentsNav";

// Below this width the lockup would crowd the right-hand header buttons, so only the symbol shows.
const NARROW = "@media (max-width:359.95px)";

export default function AppNavbar() {
  const [mounted, setMounted] = useState(false);
  const { mode, toggleColorMode } = useContext(ColorModeContext);
  const { user } = useUser();
  const router = useRouter();
  const theme = useTheme();
  const { isAdmin } = useIsAdmin();
  const showTournaments = useTournamentsNav();

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
            <Link
              href="/"
              aria-label="JoinUp"
              style={{ textDecoration: "none", color: "inherit", display: "block", flexShrink: 0 }}
            >
              <Box
                component={motion.div}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                sx={{ cursor: "pointer", display: "flex", alignItems: "center" }}
              >
                {/* Full lockup; symbol-only below 360px so it never crowds the header buttons. */}
                <Box sx={{ display: "block", [NARROW]: { display: "none" }, "& svg": { height: { xs: 28, md: 32 }, width: "auto" } }}>
                  <JoinUpLogo variant="lockup" height={28} />
                </Box>
                <Box sx={{ display: "none", [NARROW]: { display: "block" }, "& svg": { height: { xs: 32, md: 36 }, width: "auto" } }}>
                  <JoinUpLogo variant="symbol" height={32} />
                </Box>
              </Box>
            </Link>

            {/* Desktop navigation */}
            <Stack direction="row" spacing={0.5} sx={{ display: { xs: "none", md: "flex" } }}>
              <Button
                component={Link}
                href="/search"
                startIcon={<MapOutlinedIcon />}
                sx={navLinkSx}
              >
                מפת משחקים
              </Button>
              <Button
                component={Link}
                href="/fields"
                startIcon={<StadiumOutlinedIcon />}
                sx={navLinkSx}
              >
                מגרשים
              </Button>
              {showTournaments && (
                <Button
                  component={Link}
                  href="/tournaments"
                  startIcon={<EmojiEventsRounded />}
                  sx={navLinkSx}
                  data-testid="nav-tournaments"
                >
                  טורנירים
                </Button>
              )}
              {isAdmin && (
                <Button
                  component={Link}
                  href="/admin/fields"
                  startIcon={<AdminPanelSettingsOutlinedIcon />}
                  sx={navLinkSx}
                >
                  ניהול
                </Button>
              )}
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

            {isAdmin && (
              <Tooltip title="ניהול">
                <IconButton
                  component={Link}
                  href="/admin/fields"
                  color="inherit"
                  size="small"
                  aria-label="ניהול"
                  // The desktop nav (line ~116) already shows a "ניהול" text link from md up,
                  // so this icon-only button covers the gap below md, where that link -- the
                  // only admin entry point in the app -- is display:none and unreachable.
                  sx={{ p: { xs: 0.75, md: 1 }, display: { xs: "inline-flex", md: "none" } }}
                >
                  <AdminPanelSettingsOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}

            <Tooltip title={mode === "dark" ? "מצב בהיר" : "מצב כהה"}>
              <IconButton
                onClick={toggleColorMode}
                color="inherit"
                size="small"
                aria-label={mode === "dark" ? "מצב בהיר" : "מצב כהה"}
                sx={{ p: { xs: 0.75, md: 1 } }}
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
