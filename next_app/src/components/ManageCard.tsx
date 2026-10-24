"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SportsSoccerRoundedIcon from "@mui/icons-material/SportsSoccerRounded";
import { describeStart } from "@joinup/shared/manage";
import type { ManageItem, ManagedGame } from "@/services/api/manage";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** "היום 20:00" / "מחר 20:00" / "שבת 20:00 • 12/12", all in Jerusalem time. */
export function whenLabel(startIso: string): string {
  const when = describeStart(startIso);
  if (!when) return "";
  if (when.kind === "today") return `היום ${when.time}`;
  if (when.kind === "tomorrow") return `מחר ${when.time}`;
  return `${DAY_NAMES[when.dayOfWeek]} ${when.time} • ${when.day}/${when.month}`;
}

function GameStats({ game }: { game: ManagedGame }) {
  return (
    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1 }}>
      <Chip size="small" label={`${game.confirmedCount}/${game.maxPlayers} נרשמו`} />
      {game.pendingCount > 0 && <Chip size="small" color="warning" label={`${game.pendingCount} ממתינים לאישור`} />}
      {game.waitlistCount > 0 && <Chip size="small" variant="outlined" label={`${game.waitlistCount} ברשימת המתנה`} />}
    </Stack>
  );
}

export default function ManageCard({ item }: { item: ManageItem }) {
  const isGroup = item.kind === "group";
  const game = isGroup ? item.group.nextGame : item.game;
  const role = isGroup ? item.group.role : item.game.role;
  const title = isGroup ? item.group.name : item.game.title || item.game.fieldName;
  const subtitle = isGroup ? item.group.fieldName : item.game.fieldName;
  const mainHref = isGroup ? `/series/${item.group.id}` : `/games/${item.game.id}`;
  const hasNextGame = isGroup && !!game;

  return (
    <Box
      sx={(t) => ({
        width: "100%",
        p: 2,
        borderRadius: 4,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        boxShadow: t.shadows[1],
        display: "flex",
        flexDirection: "column",
        transition: "border-color 150ms ease, box-shadow 150ms ease",
        "&:hover": { borderColor: alpha(t.palette.primary.main, 0.45), boxShadow: t.shadows[3] },
      })}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, minWidth: 0 }}>
        <Chip
          size="small"
          color={isGroup ? "primary" : "default"}
          variant={isGroup ? "filled" : "outlined"}
          icon={isGroup ? <GroupsRoundedIcon /> : <SportsSoccerRoundedIcon />}
          label={isGroup ? "קבוצה" : "משחק בודד"}
          sx={{ fontWeight: 700 }}
        />
        <Typography variant="caption" color="text.secondary" fontWeight={700} noWrap sx={{ flex: 1, minWidth: 0 }}>
          {role === "ORGANIZER" ? "מארגן" : "מנהל"}
        </Typography>
      </Stack>

      <Link href={mainHref} style={{ textDecoration: "none", color: "inherit" }}>
        <Typography variant="h6" fontWeight={800} noWrap sx={{ lineHeight: 1.3, letterSpacing: "-0.01em" }}>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {subtitle}
        </Typography>
        <Box
          component="span"
          sx={(t) => ({
            display: "inline-flex",
            alignItems: "center",
            mt: 1.25,
            px: 1.25,
            py: 0.4,
            borderRadius: 999,
            typography: "body2",
            fontWeight: 800,
            fontVariantNumeric: "tabular-nums",
            color: game ? (t.palette.mode === "dark" ? "primary.light" : "primary.dark") : "text.secondary",
            bgcolor: game ? alpha(t.palette.primary.main, t.palette.mode === "dark" ? 0.18 : 0.1) : "action.hover",
          })}
        >
          {game ? whenLabel(game.start) : "אין משחק מתוכנן"}
        </Box>
      </Link>
      {game && <GameStats game={game} />}
      {isGroup && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {item.group.memberCount} חברי קבוצה
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: "auto", pt: 2 }}>
        {hasNextGame && game && (
          <Button component={Link} href={`/games/${game.id}`} variant="contained" size="small" fullWidth>
            המשחק הבא
          </Button>
        )}
        <Button
          component={Link}
          href={mainHref}
          variant={hasNextGame ? "outlined" : "contained"}
          size="small"
          fullWidth
        >
          {isGroup ? "ניהול הקבוצה" : "ניהול המשחק"}
        </Button>
      </Stack>
    </Box>
  );
}
