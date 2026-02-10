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

// Icons
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import Brightness4Icon from "@mui/icons-material/Brightness4"; // Moon
import Brightness7Icon from "@mui/icons-material/Brightness7"; // Sun
import PersonIcon from "@mui/icons-material/Person";

// Internal Components & Context
import AuthButtons from "@/components/AuthButtons";
import { ColorModeContext } from "@/components/theme/themeRegistry";
import ChatList from "@/components/ChatList";
import NotificationPanel from "@/components/NotificationPanel";

export default function AppNavbar() {
  const [mounted, setMounted] = useState(false);
  const { mode, toggleColorMode } = useContext(ColorModeContext);
  const { user } = useUser();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <AppBar
      position="sticky"
      color="inherit"
      elevation={1}
      sx={{
        bgcolor: "background.paper",
        borderBottom: 1,
        borderColor: "divider"
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: "space-between" }}>

          {/* Logo Section */}
          <Link href="/" passHref style={{ textDecoration: "none", color: "inherit" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: "pointer" }}>
              <SportsSoccerIcon color="primary" />
              <Typography
                variant="h6"
                component="div"
                sx={{
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                  color: "text.primary"
                }}
              >
                JoinUp
              </Typography>
            </Stack>
          </Link>

          {/* Right Side Actions */}
          <Stack direction="row" alignItems="center" spacing={1}>

            {/* Theme Toggle Button */}
            <IconButton onClick={toggleColorMode} color="inherit">
              {mode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>

            {/* Authenticated Actions (Chat + Profile) */}
            {mounted && (
              <ClerkLoaded>
                <SignedIn>
                  {/* Notification Panel */}
                  {user && <NotificationPanel />}

                  {/* Chat List Dropdown */}
                  {user && (
                    <ChatList
                      userId={user.id}
                      onChatSelect={(chatId) => router.push(`/chat/${chatId}`)}
                    />
                  )}

                  {/* User Profile Link */}
                  <Link href="/profile" passHref style={{ textDecoration: 'none' }}>
                    <Button
                      variant="text"
                      color="inherit"
                      startIcon={<PersonIcon />}
                      sx={{ textTransform: 'none', fontWeight: 600 }}
                    >
                      My Profile
                    </Button>
                  </Link>
                </SignedIn>
              </ClerkLoaded>
            )}

            {/* Auth Buttons (Login/Signup - usually hidden if SignedIn handled by AuthButtons logic) */}
            <Box ml={1}>
              <AuthButtons />
            </Box>

          </Stack>
        </Toolbar>
      </Container>
    </AppBar>
  );
}