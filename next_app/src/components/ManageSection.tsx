"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import { alpha } from "@mui/material/styles";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import ManageCard from "@/components/ManageCard";
import { useManageOverview } from "@/hooks/useManageOverview";
import { buildManageItems, MANAGE_HOME_LIMIT } from "@joinup/shared/manage";

/** Home-feed shortcut to what the user manages. Renders nothing for players who manage nothing. */
export default function ManageSection() {
  const { data } = useManageOverview();
  const items = buildManageItems(data);
  if (items.length === 0) return null;
  const attentionGames = data?.attention.length ?? 0;
  // Count the requests / waitlisted players themselves, not the games that have them.
  const attentionCount = data?.attention.reduce((sum, a) => sum + (a.count || 1), 0) ?? 0;

  return (
    <GamesHorizontalList
      title="הניהול שלי"
      seeAllHref={items.length > MANAGE_HOME_LIMIT || attentionGames > 0 ? "/manage" : undefined}
      customHeaderAction={
        attentionGames > 0 ? (
          <Chip
            component={Link}
            href="/manage"
            clickable
            size="small"
            icon={<ErrorOutlineRoundedIcon sx={{ fontSize: "16px !important" }} />}
            label={attentionCount === 1 ? "דבר אחד מחכה לך" : `${attentionCount} דברים מחכים לך`}
            sx={(t) => ({
              flexShrink: 0,
              fontWeight: 800,
              color: t.palette.mode === "dark" ? "#fcd34d" : "#92400e",
              bgcolor: alpha("#f59e0b", t.palette.mode === "dark" ? 0.18 : 0.14),
              border: "1px solid",
              borderColor: alpha("#f59e0b", t.palette.mode === "dark" ? 0.4 : 0.35),
              "& .MuiChip-icon": { color: "inherit" },
              "&:hover": { bgcolor: alpha("#f59e0b", t.palette.mode === "dark" ? 0.26 : 0.22) },
            })}
          />
        ) : undefined
      }
    >
      {items.slice(0, MANAGE_HOME_LIMIT).map((item) => (
        <Box key={item.key} sx={{ width: { xs: 272, sm: 300 }, flexShrink: 0, display: "flex" }}>
          <ManageCard item={item} />
        </Box>
      ))}
    </GamesHorizontalList>
  );
}
