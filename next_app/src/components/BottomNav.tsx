"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import Badge from "@mui/material/Badge";
import { motion } from "framer-motion";
import { useAuth } from "@clerk/nextjs";
import { useNotificationCounters } from "@/context/NotificationCountersContext";

const MotionLink = motion.create(Link);

import HomeRoundedIcon from "@mui/icons-material/HomeRounded";
import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import StadiumRoundedIcon from "@mui/icons-material/StadiumRounded";
import StadiumOutlinedIcon from "@mui/icons-material/StadiumOutlined";
import PeopleOutlinedIcon from "@mui/icons-material/PeopleOutlined";
import PeopleRoundedIcon from "@mui/icons-material/PeopleRounded";

const FRIENDS_HREF = "/profile/friends";

const ITEMS = [
  { href: "/games", label: "בית", icon: HomeOutlinedIcon, activeIcon: HomeRoundedIcon },
  { href: "/search", label: "מפה", icon: MapOutlinedIcon, activeIcon: MapRoundedIcon },
  { href: "/games/new", label: "", icon: AddRoundedIcon, activeIcon: AddRoundedIcon, fab: true },
  { href: "/fields", label: "מגרשים", icon: StadiumOutlinedIcon, activeIcon: StadiumRoundedIcon },
  { href: FRIENDS_HREF, label: "חברים", icon: PeopleOutlinedIcon, activeIcon: PeopleRoundedIcon },
];

export default function BottomNav() {
  const pathname = usePathname();
  const theme = useTheme();
  const { isSignedIn } = useAuth();
  const { friendRequests } = useNotificationCounters();

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
          const isFriends = item.href === FRIENDS_HREF;
          const href = isFriends && isSignedIn === false ? `/sign-in?redirect_url=${encodeURIComponent(FRIENDS_HREF)}` : item.href;
          const pending = isFriends && isSignedIn ? friendRequests : 0;

          if (item.fab) {
            return (
              <Box key={item.href} sx={{ display: "grid", placeItems: "center" }}>
                <Box
                  component={MotionLink}
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
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
              component={MotionLink}
              whileTap={{ scale: 0.92 }}
              transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
              href={href}
              aria-label={pending > 0 ? `${item.label}, ${pending} בקשות חברות ממתינות` : undefined}
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
              }}
            >
              {/* Sliding active indicator */}
              {active && (
                <Box
                  component={motion.span}
                  layoutId="bottom-nav-active-pill"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  sx={{
                    position: "absolute",
                    top: 6,
                    width: 18,
                    height: 3,
                    borderRadius: 999,
                    bgcolor: "primary.main",
                  }}
                />
              )}
              <Badge
                badgeContent={pending || undefined}
                color="error"
                max={9}
                sx={{ "& .MuiBadge-badge": { fontSize: 10, height: 16, minWidth: 16, px: 0.5 } }}
              >
                <Icon sx={{ fontSize: 24 }} />
              </Badge>
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
