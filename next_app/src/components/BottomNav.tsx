"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";

import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import StadiumRoundedIcon from "@mui/icons-material/StadiumRounded";
import StadiumOutlinedIcon from "@mui/icons-material/StadiumOutlined";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import PersonOutlineRoundedIcon from "@mui/icons-material/PersonOutlineRounded";

const ITEMS = [
  { href: "/games", label: "בית", icon: HomeOutlinedIcon, activeIcon: HomeRoundedIcon },
  { href: "/search", label: "חיפוש", icon: SearchRoundedIcon, activeIcon: SearchRoundedIcon },
  { href: "/games/new", label: "", icon: AddRoundedIcon, activeIcon: AddRoundedIcon, fab: true },
  { href: "/fields", label: "מגרשים", icon: StadiumOutlinedIcon, activeIcon: StadiumRoundedIcon },
  { href: "/profile", label: "פרופיל", icon: PersonOutlineRoundedIcon, activeIcon: PersonRoundedIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const theme = useTheme();

  // Hide on immersive full-screen surfaces
  if (pathname?.startsWith("/chat/")) return null;
  if (pathname?.startsWith("/sign-in") || pathname?.startsWith("/sign-up")) return null;

  const isActive = (href: string) => {
    if (href === "/games") return pathname === "/" || pathname === "/games";
    if (href === "/games/new") return pathname === "/games/new";
    return pathname === href || pathname?.startsWith(`${href}/`);
  };

  return (
    <Box
      component="nav"
      aria-label="ניווט ראשי"
      sx={{
        position: "fixed",
        bottom: 0,
        insetInlineStart: 0,
        insetInlineEnd: 0,
        zIndex: (t) => t.zIndex.appBar,
        display: { xs: "block", md: "none" },
        bgcolor: alpha(theme.palette.background.paper, 0.94),
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderTop: 1,
        borderColor: "divider",
        pb: "env(safe-area-inset-bottom, 0px)",
        // Soft lift so content doesn't feel glued to the bar
        boxShadow: "0 -8px 24px rgba(15,23,42,0.06)",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          alignItems: "center",
          height: 64,
          maxWidth: 480,
          mx: "auto",
          px: 0.5,
        }}
      >
        {ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = active ? item.activeIcon : item.icon;

          if (item.fab) {
            return (
              <Box key={item.href} sx={{ display: "grid", placeItems: "center" }}>
                <Box
                  component={Link}
                  href={item.href}
                  aria-label="צור משחק"
                  sx={{
                    width: 52,
                    height: 52,
                    mt: -3.25,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    color: "#fff",
                    textDecoration: "none",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    boxShadow: "0 10px 24px rgba(5,150,105,0.45)",
                    border: `4px solid ${theme.palette.background.default}`,
                    transition: "transform 0.15s ease",
                    "&:active": { transform: "scale(0.94)" },
                  }}
                >
                  <Icon sx={{ fontSize: 28 }} />
                </Box>
              </Box>
            );
          }

          return (
            <Box
              key={item.href}
              component={Link}
              href={item.href}
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 0.35,
                height: "100%",
                textDecoration: "none",
                color: active ? "primary.main" : "text.secondary",
                position: "relative",
                WebkitTapHighlightColor: "transparent",
                "&:active": { opacity: 0.75 },
              }}
            >
              {/* Active indicator */}
              <Box
                sx={{
                  position: "absolute",
                  top: 6,
                  width: 18,
                  height: 3,
                  borderRadius: 999,
                  bgcolor: "primary.main",
                  opacity: active ? 1 : 0,
                  transition: "opacity 0.15s ease",
                }}
              />
              <Icon sx={{ fontSize: 24 }} />
              <Typography
                variant="caption"
                sx={{
                  fontSize: 11,
                  fontWeight: active ? 700 : 500,
                  lineHeight: 1,
                  letterSpacing: 0.1,
                }}
              >
                {item.label}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
