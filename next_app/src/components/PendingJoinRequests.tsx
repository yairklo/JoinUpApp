"use client";
import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";

// MUI Imports
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type JoinRequest = {
  userId: string;
  name: string | null;
  avatar: string | null;
  requestedAt: string;
};

export default function PendingJoinRequests({ gameId }: { gameId: string }) {
  const { getToken } = useAuth();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOnUserId, setActingOnUserId] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(`${API_BASE}/api/games/${gameId}/join-requests`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setRequests(data.requests || []);
    } catch (e) {
      console.error("Failed to load join requests", e);
    } finally {
      setLoading(false);
    }
  }, [gameId, getToken]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  async function decide(userId: string, approve: boolean) {
    setActingOnUserId(userId);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(
        `${API_BASE}/api/games/${gameId}/join-requests/${userId}/${approve ? "approve" : "reject"}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.userId !== userId));
      }
    } catch (e) {
      console.error("Failed to record join decision", e);
    } finally {
      setActingOnUserId(null);
    }
  }

  if (loading) {
    return (
      <Card elevation={2} sx={{ p: 2, mb: 2, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Card>
    );
  }

  if (requests.length === 0) return null;

  return (
    <Card elevation={2} sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        בקשות הצטרפות ({requests.length})
      </Typography>
      <Stack spacing={1.5}>
        {requests.map((req) => (
          <Box
            key={req.userId}
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box display="flex" alignItems="center" gap={1.5}>
              <Avatar src={req.avatar || undefined}>{req.name?.[0] || "U"}</Avatar>
              <Typography>{req.name || "User"}</Typography>
            </Box>
            <Box display="flex" gap={1}>
              <Button
                size="small"
                variant="contained"
                color="success"
                disabled={actingOnUserId === req.userId}
                onClick={() => decide(req.userId, true)}
              >
                אשר
              </Button>
              <Button
                size="small"
                variant="outlined"
                color="error"
                disabled={actingOnUserId === req.userId}
                onClick={() => decide(req.userId, false)}
              >
                דחה
              </Button>
            </Box>
          </Box>
        ))}
      </Stack>
    </Card>
  );
}
