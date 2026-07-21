"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

// MUI
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";

import Avatar from "@/components/Avatar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function FriendsAllPage() {
  const { user } = useUser();
  const userId = user?.id;
  const [friends, setFriends] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null }>>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then((arr) => {
      const sorted = [...arr].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setFriends(sorted);
    }).catch(() => {});
  }, [userId]);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
      <Typography variant="h4" component="h1" fontWeight={800} mb={3}>
        החברים שלי
      </Typography>

      <Stack spacing={1.25}>
        {friends.map((f) => (
          <Card
            key={f.id}
            component={Link}
            href={`/users/${f.id}`}
            elevation={0}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1.5,
              p: 1.5,
              textDecoration: "none",
              color: "inherit",
              transition: "background-color 0.15s ease, transform 0.15s ease",
              "&:hover": { bgcolor: "action.hover", transform: "translateY(-1px)" },
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center" minWidth={0}>
              <Avatar src={f.imageUrl} alt={f.name || f.id} name={f.name || undefined} size="md" />
              <Typography fontWeight={600} noWrap>
                {f.name || f.id}
              </Typography>
            </Stack>
            <ChevronLeftIcon sx={{ color: "text.secondary" }} />
          </Card>
        ))}

        {friends.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6, borderRadius: 4, bgcolor: "action.hover" }}>
            <Typography variant="body2" color="text.secondary">
              אין חברים עדיין. חפשו שחקנים והוסיפו אותם!
            </Typography>
          </Box>
        )}
      </Stack>
    </Container>
  );
}
