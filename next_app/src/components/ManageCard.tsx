"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import SportsSoccerRoundedIcon from "@mui/icons-material/SportsSoccerRounded";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";
import type { ManageItem, ManagedGame } from "@/services/api/manage";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** "היום 20:00" / "מחר 20:00" / "שבת 20:00 • 12/12", all in Jerusalem time. */
export function whenLabel(startIso: string): string {
  const date = formatJerusalemDate(startIso);
  const time = formatJerusalemTime(startIso);
  if (!date) return "";
  if (date === formatJerusalemDate(new Date())) return `היום ${time}`;
  if (date === formatJerusalemDate(new Date(Date.now() + 24 * 60 * 60 * 1000))) return `מחר ${time}`;
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return `${DAY_NAMES[dow]} ${time} • ${d}/${m}`;
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
      sx={{
        p: 2,
        borderRadius: 3,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Chip
          size="small"
          color={isGroup ? "primary" : "default"}
          icon={isGroup ? <GroupsRoundedIcon /> : <SportsSoccerRoundedIcon />}
          label={isGroup ? "קבוצה" : "משחק בודד"}
        />
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {role === "ORGANIZER" ? "מארגן" : "מנהל"}
        </Typography>
      </Stack>

      <Link href={mainHref} style={{ textDecoration: "none", color: "inherit" }}>
        <Typography variant="h6" fontWeight={700} noWrap>
          {title}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {subtitle}
        </Typography>
        <Typography variant="body2" color="primary" fontWeight={700} sx={{ mt: 1 }}>
          {game ? whenLabel(game.start) : "אין משחק מתוכנן"}
        </Typography>
      </Link>
      {game && <GameStats game={game} />}
      {isGroup && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          {item.group.memberCount} חברי קבוצה
        </Typography>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
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
