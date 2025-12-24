"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsIcon from "@mui/icons-material/Groups";
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
}: WrapperProps) {
  const { getToken } = useAuth();
  const router = useRouter();
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const isOrganizer = currentUserId === organizerId;
  const isManager = initialManagers.some((m) => m.id === currentUserId);
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
        throw new Error("Failed to save teams");
      }

      router.refresh();
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Error saving teams:", error);
      alert("Failed to save teams. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {canManage && (
         <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight="bold">
                Game Squad
            </Typography>
            <Button 
                variant="contained" 
                startIcon={saving ? <CircularProgress size={20} color="inherit" /> : <GroupsIcon />} 
                onClick={() => setIsDialogOpen(true)}
                size="small"
                disabled={saving}
                sx={{ borderRadius: 2, textTransform: 'none' }}
            >
                {saving ? "Saving..." : "Manage Teams"}
            </Button>
         </Box>
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
                Lottery Pending
            </Typography>
            <Typography variant="body2">
                Draw at: {lotteryData.at ? new Date(lotteryData.at).toLocaleString() : "—"}
            </Typography>
            <Typography variant="caption">
                Registered: {lotteryData.signups ?? 0} (Max: {maxPlayers})
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
            <Card elevation={2} sx={{ bgcolor: 'warning.50' }}>
                <CardContent>
                  <Typography
                    variant="subtitle1"
                    fontWeight="bold"
                    gutterBottom
                    color="warning.dark"
                  >
                    Waitlist / Lottery Pool
                  </Typography>
                  <List disablePadding>
                    {waitlistParticipants.map((p) => (
                      <Link key={p.id} href={`/users/${p.id}`} passHref legacyBehavior>
                        <ListItemButton component="a" sx={{ borderRadius: 2 }}>
                          <ListItemAvatar>
                            <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="sm" />
                          </ListItemAvatar>
                          <ListItemText
                            primary={p.name || p.id}
                            secondary="Waiting for lottery"
                          />
                          <Chip label="Waitlist" size="small" color="warning" variant="outlined" />
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