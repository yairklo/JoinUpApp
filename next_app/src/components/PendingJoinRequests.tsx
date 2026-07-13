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
import Collapse from "@mui/material/Collapse";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Chip from "@mui/material/Chip";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type JoinRequest = {
  userId: string;
  name: string | null;
  avatar: string | null;
  requestedAt: string;
  status?: string;
  isWaitlistOffer?: boolean;
  queuePosition?: number;
};

export default function PendingJoinRequests({
  gameId,
  onDecision,
}: {
  gameId: string;
  onDecision?: (updatedGame?: any) => void;
}) {
  const { getToken } = useAuth();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [activeOffer, setActiveOffer] = useState<JoinRequest | null>(null);
  const [waitlist, setWaitlist] = useState<JoinRequest[]>([]);
  const [rejected, setRejected] = useState<JoinRequest[]>([]);
  const [showRejected, setShowRejected] = useState(false);
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
      setActiveOffer(data.activeOffer || null);
      setWaitlist(data.waitlist || []);
      setRejected(data.rejected || []);
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
        await fetchRequests();
        const updatedGame = await res.json().catch(() => undefined);
        if (onDecision) onDecision(updatedGame);
      }
    } catch (e) {
      console.error("Failed to record join decision", e);
    } finally {
      setActingOnUserId(null);
    }
  }

  async function handleBypass(userId: string) {
    setActingOnUserId(userId);
    try {
      const token = await getToken().catch(() => "");
      const res = await fetch(
        `${API_BASE}/api/games/${gameId}/waitlist-bypass/${userId}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (res.ok) {
        await fetchRequests();
        const data = await res.json();
        if (onDecision) onDecision(data.game);
      }
    } catch (e) {
      console.error("Failed to bypass waitlist user", e);
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

  if (requests.length === 0 && !activeOffer && waitlist.length === 0 && rejected.length === 0) return null;

  return (
    <Card elevation={2} sx={{ p: 2, mb: 2 }}>
      {/* Active Offer Section */}
      {activeOffer && (
        <Box sx={{ mb: 3, p: 2, bgcolor: "info.lighter", borderRadius: 2, border: "1px solid", borderColor: "info.light" }}>
          <Typography variant="subtitle2" color="info.dark" sx={{ mb: 1, fontWeight: "bold" }} align="right">
            הוצע מקום אוטומטית (ממתין לאישור השחקן)
          </Typography>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1.5}>
              <Avatar src={activeOffer.avatar || undefined}>{activeOffer.name?.[0] || "U"}</Avatar>
              <Typography fontWeight="bold">{activeOffer.name || "User"}</Typography>
            </Box>
            <Button
              size="small"
              variant="contained"
              color="error"
              disabled={actingOnUserId === activeOffer.userId}
              onClick={() => handleBypass(activeOffer.userId)}
            >
              עקוף לבא בתור
            </Button>
          </Box>
        </Box>
      )}

      {/* Standard Join Requests */}
      {requests.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom align="right">
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
        </Box>
      )}

      {/* Waitlist Section */}
      {waitlist.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom align="right">
            רשימת המתנה ({waitlist.length})
          </Typography>
          <Stack spacing={1.5}>
            {waitlist.map((req) => (
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
                <Chip
                  label={`ממתין #${req.queuePosition}`}
                  size="small"
                  sx={{ fontWeight: "bold" }}
                />
              </Box>
            ))}
          </Stack>
        </Box>
      )}

      {rejected.length > 0 && (
        <Box mt={requests.length > 0 || waitlist.length > 0 || activeOffer ? 2 : 0}>
          { (requests.length > 0 || waitlist.length > 0 || activeOffer) && <Divider sx={{ mb: 1.5 }} />}
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            sx={{ cursor: "pointer" }}
            onClick={() => setShowRejected((v) => !v)}
          >
            <Typography variant="subtitle2" color="text.secondary" fontWeight="bold">
              בקשות שנדחו ({rejected.length})
            </Typography>
            <IconButton
              size="small"
              sx={{ transform: showRejected ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
            >
              <ExpandMoreIcon fontSize="small" />
            </IconButton>
          </Box>
          <Collapse in={showRejected}>
            <Stack spacing={1.5} mt={1.5}>
              {rejected.map((req) => (
                <Box
                  key={req.userId}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box display="flex" alignItems="center" gap={1.5} sx={{ opacity: 0.7 }}>
                    <Avatar src={req.avatar || undefined}>{req.name?.[0] || "U"}</Avatar>
                    <Typography color="text.secondary">{req.name || "User"}</Typography>
                  </Box>
                  <Button
                    size="small"
                    variant="outlined"
                    color="success"
                    disabled={actingOnUserId === req.userId}
                    onClick={() => decide(req.userId, true)}
                  >
                    אשר בכל זאת
                  </Button>
                </Box>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )}
    </Card>
  );
}
