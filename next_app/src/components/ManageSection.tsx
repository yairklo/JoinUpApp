"use client";

import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
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
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="h5" fontWeight={700}>
          הניהול שלי
        </Typography>
        {(items.length > MANAGE_HOME_LIMIT || attentionGames > 0) && (
          <Button component={Link} href="/manage" size="small">
            הכל
          </Button>
        )}
      </Stack>
      {attentionGames > 0 && (
        <Box
          component={Link}
          href="/manage"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1.5,
            px: 2,
            py: 1.25,
            borderRadius: 3,
            bgcolor: "warning.light",
            color: "warning.contrastText",
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          <ErrorOutlineRoundedIcon fontSize="small" />
          {attentionCount === 1 ? "דבר אחד מחכה לך" : `${attentionCount} דברים מחכים לך`}
        </Box>
      )}
      <Stack spacing={1.5}>
        {items.slice(0, MANAGE_HOME_LIMIT).map((item) => (
          <ManageCard key={item.key} item={item} />
        ))}
      </Stack>
    </Box>
  );
}
