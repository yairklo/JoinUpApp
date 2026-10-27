"use client";

import Link from "next/link";
import { SignedOut, SignInButton } from "@clerk/nextjs";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import HourglassEmptyRoundedIcon from "@mui/icons-material/HourglassEmptyRounded";
import FormatListBulletedRoundedIcon from "@mui/icons-material/FormatListBulletedRounded";
import ManageCard, { whenLabel } from "@/components/ManageCard";
import EmptyState from "@/components/ui/EmptyState";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";
import InlineErrorRow from "@/components/InlineErrorRow";
import { useManageOverview } from "@/hooks/useManageOverview";
import { buildManageItems } from "@joinup/shared/manage";

export default function ManagePage() {
  const { data, loading, error, refetch } = useManageOverview();
  const items = buildManageItems(data);
  const attention = data?.attention ?? [];

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Typography variant="h4" fontWeight={800} sx={{ mb: 3 }}>
        בניהולי
      </Typography>

      <SignedOut>
        <EmptyState
          icon={<FormatListBulletedRoundedIcon />}
          title="צריך להתחבר כדי לראות את הניהול שלך"
          actions={
            <SignInButton mode="modal">
              <Button variant="contained">התחברות</Button>
            </SignInButton>
          }
        />
      </SignedOut>

      {loading && !data ? (
        <GameCardSkeletonRow />
      ) : error && !data ? (
        <InlineErrorRow message="לא הצלחנו לטעון את הניהול שלך" onRetry={refetch} />
      ) : data && items.length === 0 ? (
        <EmptyState
          icon={<FormatListBulletedRoundedIcon />}
          title="אתם עדיין לא מנהלים כלום"
          description="צרו משחק או קבוצה והם יופיעו כאן."
          actions={
            <Button component={Link} href="/games/new" variant="contained">
              צור משחק
            </Button>
          }
        />
      ) : data ? (
        <Stack spacing={3}>
          {attention.length > 0 && (
            <Box>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
                דורש טיפול
              </Typography>
              <Stack spacing={1}>
                {attention.map((a) => (
                  <Box
                    key={`${a.type}-${a.gameId}`}
                    component={Link}
                    href={`/games/${a.gameId}`}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      px: 2,
                      py: 1.25,
                      borderRadius: 3,
                      bgcolor: "warning.light",
                      color: "warning.contrastText",
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    <HourglassEmptyRoundedIcon fontSize="small" />
                    {a.type === "PENDING_REQUESTS" ? `${a.count} בקשות הצטרפות` : `רשימת המתנה (${a.count})`}
                    {` • ${a.label} • ${whenLabel(a.start)}`}
                  </Box>
                ))}
              </Stack>
            </Box>
          )}
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1.5 }}>
              הקבוצות והמשחקים שלי
            </Typography>
            <Stack spacing={1.5}>
              {items.map((item) => (
                <ManageCard key={item.key} item={item} />
              ))}
            </Stack>
          </Box>
        </Stack>
      ) : null}
    </Container>
  );
}
