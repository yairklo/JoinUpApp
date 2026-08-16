"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsIcon from "@mui/icons-material/Groups";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Chip from "@mui/material/Chip";
import Avatar from "@/components/Avatar";
import Link from "next/link";
import CircularProgress from "@mui/material/CircularProgress";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import GameParticipantsList from "@/components/GameParticipantsList";
import TeamBuilderDialog, { Team } from "@/components/TeamBuilderDialog";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; name?: string; avatar?: string; role?: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

interface WrapperProps {
  gameId: string;
  participants: Participant[];
  organizerId: string;
  initialManagers: Manager[];
  maxPlayers: number;
  currentUserId: string;
  initialTeams?: Team[];
  lotteryData?: {
    enabled: boolean;
    pending: boolean;
    overbooked: boolean;
    at: string | null;
    signups: number;
  };
  waitlistParticipants?: Participant[];
  pickSessionStatus?: string | null;
}

export default function TeamBuilderWrapper({
  gameId,
  participants,
  organizerId,
  initialManagers,
  maxPlayers,
  currentUserId,
  initialTeams = [],
  lotteryData,
  waitlistParticipants = [],
  pickSessionStatus,
}: WrapperProps) {
  const { getToken } = useAuth();
  const router = useRouter();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isOrganizer = currentUserId === organizerId;
  const isManager = initialManagers.some((m) => m.id === currentUserId && (m.role === 'MANAGER' || m.role === 'MODERATOR'));
  const canManage = isOrganizer || isManager;

  const handleSaveTeams = async (teams: Team[]) => {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/games/${gameId}/teams`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teams }),
      });

      if (!res.ok) {
        throw new Error("שמירת הקבוצות נכשלה");
      }

      router.refresh();
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving teams:", error);
      alert("שמירת הקבוצות נכשלה. נסה שוב.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {canManage && (
        <Box mb={2} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="h6" fontWeight="bold">
            סגל המשחק
          </Typography>
          <Box display="flex" gap={1} flexWrap="wrap">
            <Button
              component={Link}
              href={`/games/${gameId}/team-management`}
              variant="contained"
              color="secondary"
              startIcon={<SportsEsportsIcon />}
              size="small"
              sx={{ borderRadius: 2, textTransform: "none" }}
            >
              ניהול קבוצות חי
            </Button>
            <Button
              variant="outlined"
              startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <GroupsIcon />}
              onClick={() => setIsDialogOpen(true)}
              size="small"
              disabled={saving}
              sx={{ borderRadius: 2, textTransform: "none" }}
            >
              {saving ? "שומר..." : "שיבוץ מהיר"}
            </Button>
          </Box>
        </Box>
      )}

      {canManage && pickSessionStatus && pickSessionStatus !== "IDLE" && (
        <Alert severity="info" sx={{ mb: 2 }}>
          סטטוס בחירה: <strong>{
            ({
              IDLE: "ממתין",
              DRAW_SCHEDULED: "הגרלה מתוזמנת",
              ORDER_SET: "סדר נקבע",
              PICKING: "בחירה פעילה",
              COMPLETED: "הושלם",
            } as Record<string, string>)[pickSessionStatus] || pickSessionStatus
          }</strong>
          {" — "}
          <Link href={`/games/${gameId}/team-management`}>פתח מסך חי</Link>
        </Alert>
      )}

      {canManage && (
        <TeamBuilderDialog
          open={isDialogOpen}
          onClose={() => setIsDialogOpen(false)}
          participants={participants}
          initialTeams={initialTeams}
          onSave={handleSaveTeams}
        />
      )}

      {lotteryData?.enabled && lotteryData.pending && lotteryData.overbooked && (
        <Alert severity="warning" icon={<AccessTimeIcon />} sx={{ mb: 3 }}>
          <Typography variant="subtitle2" fontWeight="bold">
            הגרלה ממתינה
          </Typography>
          <Typography variant="body2">
            הגרלה ב: {lotteryData.at ? new Date(lotteryData.at).toLocaleString("he-IL") : "—"}
          </Typography>
          <Typography variant="caption">
            רשומים: {lotteryData.signups ?? 0} (מקסימום: {maxPlayers})
          </Typography>
        </Alert>
      )}

      <GameParticipantsList
        gameId={gameId}
        participants={participants}
        organizerId={organizerId}
        initialManagers={initialManagers}
        maxPlayers={maxPlayers}
        teams={initialTeams}
      />

      {lotteryData?.enabled &&
        lotteryData.pending &&
        lotteryData.overbooked &&
        waitlistParticipants.length > 0 && (
          <Box mt={3}>
            <Card elevation={2} sx={{ bgcolor: "warning.50" }}>
              <CardContent>
                <Typography variant="subtitle1" fontWeight="bold" gutterBottom color="warning.dark">
                  רשימת המתנה / מאגר הגרלה
                </Typography>
                <List disablePadding>
                  {waitlistParticipants.map((p) => (
                    <Link key={p.id} href={`/users/${p.id}`} passHref legacyBehavior>
                      <ListItemButton component="a" sx={{ borderRadius: 2 }}>
                        <ListItemAvatar>
                          <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="sm" />
                        </ListItemAvatar>
                        <ListItemText primary={p.name || p.id} secondary="ממתין להגרלה" />
                        <Chip label="רשימת המתנה" size="small" color="warning" variant="outlined" />
                      </ListItemButton>
                    </Link>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Box>
        )}
    </>
  );
}
