"use client";

import { useContext } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import LightModeOutlinedIcon from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlinedIcon from "@mui/icons-material/DarkModeOutlined";
import { ColorModeContext } from "@/components/theme/themeRegistry";

const LINKS = [
  { href: "/legal/terms", label: "תנאי שימוש" },
  { href: "/legal/privacy", label: "פרטיות" },
];

/**
 * Global site footer -- rendered once in layout.tsx, after {children} and
 * before BottomNav. Also the one place the dark/light toggle is reachable
 * on mobile: AppNavbar's own toggle is hidden below `sm` (display:{xs:"none"}),
 * so this reuses the same ColorModeContext to expose a mobile-reachable copy.
 */
export default function Footer() {
  const { mode, toggleColorMode } = useContext(ColorModeContext);

  return (
    <Box
      component="footer"
      sx={{
        borderTop: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        // Clears the fixed BottomNav on mobile (hidden from md up, same
        // breakpoint BottomNav itself uses) so footer links aren't covered.
        pb: { xs: "calc(var(--bottom-nav-height) + env(safe-area-inset-bottom, 0px))", md: 0 },
      }}
    >
      <Container maxWidth="md" sx={{ py: { xs: 3, sm: 4 }, px: { xs: 2, sm: 3 } }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 3 }}
          alignItems={{ xs: "flex-start", sm: "center" }}
          justifyContent="space-between"
        >
          <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
            {LINKS.map((link) => (
              <Typography
                key={link.href}
                component={Link}
                href={link.href}
                variant="body2"
                sx={{
                  color: "text.secondary",
                  textDecoration: "none",
                  fontWeight: 600,
                  "&:hover": { color: "primary.main", textDecoration: "underline" },
                }}
              >
                {link.label}
              </Typography>
            ))}
            <Typography
              component="a"
              href="mailto:support@joinup.co.il"
              variant="body2"
              sx={{
                color: "text.secondary",
                textDecoration: "none",
                fontWeight: 600,
                "&:hover": { color: "primary.main", textDecoration: "underline" },
              }}
            >
              תמיכה
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="caption" sx={{ color: "text.disabled" }}>
              © {new Date().getFullYear()} JoinUp
            </Typography>
            {/* Reachable on every breakpoint -- AppNavbar's copy of this same
                toggle is display:none below `sm`. */}
            <Tooltip title={mode === "dark" ? "מצב בהיר" : "מצב כהה"}>
              <IconButton
                onClick={toggleColorMode}
                size="small"
                color="inherit"
                aria-label={mode === "dark" ? "מצב בהיר" : "מצב כהה"}
                sx={{ color: "text.secondary" }}
              >
                {mode === "dark" ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}
