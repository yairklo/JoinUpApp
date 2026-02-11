"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import ChatList from "@/components/ChatList";
import NotificationPanel from "@/components/NotificationPanel";
import {
  AppBar,
  Toolbar,
  Typography,
  Stack,
  Container,
  useTheme
} from "@mui/material";

export default function Navbar() {
  const { user } = useUser();
  const router = useRouter();
  const theme = useTheme();

  return (
    <AppBar
      position="sticky"
      color="default"
      elevation={1}
      sx={{
        bgcolor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
        backdropFilter: 'blur(8px)',
        // Add slight transparency based on theme mode
        background: theme.palette.mode === 'dark'
          ? 'rgba(18, 18, 18, 0.8)'
          : 'rgba(255, 255, 255, 0.8)'
      }}
    >
      <Container maxWidth="lg">
        <Toolbar disableGutters sx={{ justifyContent: "space-between" }}>

          {/* Logo Section */}
          <Typography
            variant="h6"
            component={Link}
            href="/"
            sx={{
              fontWeight: 700,
              color: 'text.primary',
              textDecoration: 'none',
              '&:hover': {
                opacity: 0.8
              }
            }}
          >
            JoinUp
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            {user && (
              <>
                <NotificationPanel />
                <ChatList
                  userId={user.id}
                  onChatSelect={(chatId) => router.push(`/chat/${chatId}`)}
                />
              </>
            )}
            <ThemeToggle />
          </Stack>

        </Toolbar>
      </Container>
    </AppBar>
  );
}