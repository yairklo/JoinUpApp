"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";

// MUI
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import SearchIcon from "@mui/icons-material/Search";

import Avatar from "@/components/Avatar";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type Friend = { id: string; name: string | null; imageUrl?: string | null };
type IncomingRequest = { id: string; requester: Friend; createdAt: string };

export default function FriendsAllPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    const token = await getToken().catch(() => null);
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    // no-store: the lists must reflect an accept/decline that just happened, not a cached response.
    const [friendsRes, incomingRes] = await Promise.all([
      fetch(`${API_BASE}/api/users/${userId}/friends`, { headers, cache: "no-store" }),
      fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers, cache: "no-store" }),
    ]);
    if (friendsRes.ok) {
      const arr: Friend[] = await friendsRes.json();
      setFriends([...arr].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    }
    if (incomingRes.ok) setIncoming(await incomingRes.json());
    return true;
  }, [userId, getToken]);

  useEffect(() => {
    // Wait for Clerk: before it resolves there is no user id yet, and "no friends" must not flash.
    if (!isLoaded) return;
    if (!userId) {
      setLoaded(true);
      return;
    }
    load()
      .catch(() => setError("טעינת החברים נכשלה. נסו לרענן את העמוד."))
      .finally(() => setLoaded(true));
  }, [load, isLoaded, userId]);

  const respond = async (requestId: string, action: "accept" | "decline") => {
    setBusyId(requestId);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("no token");
      const res = await fetch(`${API_BASE}/api/users/requests/${requestId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`${action} failed`);
      // Re-read from the server so the UI only shows what was actually persisted.
      await load();
    } catch {
      setError(action === "accept" ? "אישור הבקשה נכשל. נסו שוב." : "דחיית הבקשה נכשלה. נסו שוב.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 5 } }}>
      <Typography variant="h4" component="h1" fontWeight={800} mb={3}>
        החברים שלי
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {incoming.length > 0 && (
        <Card elevation={0} sx={{ mb: 3, bgcolor: "action.hover" }}>
          <CardContent>
            <Typography variant="h6" fontWeight={700} gutterBottom>
              בקשות חברות ({incoming.length})
            </Typography>
            <Stack spacing={1}>
              {incoming.map((r) => (
                <Stack key={r.id} direction="row" alignItems="center" justifyContent="space-between" spacing={1.5}>
                  <Stack
                    direction="row"
                    spacing={1.5}
                    alignItems="center"
                    minWidth={0}
                    component={Link}
                    href={`/users/${r.requester.id}`}
                    sx={{ textDecoration: "none", color: "inherit" }}
                  >
                    <Avatar src={r.requester.imageUrl} alt={r.requester.name || r.requester.id} name={r.requester.name || undefined} size="md" />
                    <Typography fontWeight={600} noWrap>
                      {r.requester.name || r.requester.id}
                    </Typography>
                  </Stack>
                  <Box sx={{ display: "flex", flexShrink: 0 }}>
                    <IconButton
                      color="success"
                      aria-label={`אשר בקשת חברות מ${r.requester.name || "המשתמש"}`}
                      disabled={busyId === r.id}
                      onClick={() => respond(r.id, "accept")}
                    >
                      <CheckCircleIcon />
                    </IconButton>
                    <IconButton
                      color="error"
                      aria-label={`דחה בקשת חברות מ${r.requester.name || "המשתמש"}`}
                      disabled={busyId === r.id}
                      onClick={() => respond(r.id, "decline")}
                    >
                      <CancelOutlinedIcon />
                    </IconButton>
                  </Box>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

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

        {loaded && friends.length === 0 && (
          <Box sx={{ textAlign: "center", py: 6, px: 2, borderRadius: 4, bgcolor: "action.hover" }}>
            <Typography fontWeight={700} gutterBottom>
              אין חברים עדיין
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              חפשו שחקנים והוסיפו אותם כדי לשחק יחד.
            </Typography>
            <Button
              component={Link}
              href="/profile/search-players"
              variant="contained"
              aria-label="חפש אנשים להוספה"
              startIcon={<SearchIcon aria-hidden="true" />}
            >
              חפש אנשים
            </Button>
          </Box>
        )}
      </Stack>
    </Container>
  );
}
