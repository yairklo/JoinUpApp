"use client";

import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import GroupsIcon from "@mui/icons-material/Groups";
import GameParticipantsList from "@/components/GameParticipantsList";
// מייבאים את הדיאלוג החדש
import TeamBuilderDialog, { Team } from "@/components/TeamBuilderDialog";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; name?: string; avatar?: string; role?: string };

interface WrapperProps {
  gameId: string;
  participants: Participant[];
  organizerId: string;
  initialManagers: Manager[];
  maxPlayers: number;
  currentUserId: string;
  lotteryData?: {
    enabled: boolean;
    pending: boolean;
    overbooked: boolean;
    at: string | null;
    signups: number;
  };
}

export default function TeamBuilderWrapper({
  gameId,
  participants,
  organizerId,
  initialManagers,
  maxPlayers,
  currentUserId,
  lotteryData,
}: WrapperProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  
  // פה בעתיד נשמור את הקבוצות ב-DB. כרגע זה מקומי.
  const [savedTeams, setSavedTeams] = useState<Team[]>([]);

  const isOrganizer = currentUserId === organizerId;
  const isManager = initialManagers.some((m) => m.id === currentUserId);
  const canManage = isOrganizer || isManager;

  const handleSaveTeams = (teams: Team[]) => {
    setSavedTeams(teams);
    // TODO: Send to backend API
    console.log("Teams Saved:", teams);
  };

  return (
    <Grid size={{ xs: 12, md: 7 }}>
      
      {/* כפתור "ניהול הרכבים" מופיע מעל הרשימה הרגילה (רק למנהלים) */}
      {canManage && (
         <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight="bold">
                Game Squad
            </Typography>
            <Button 
                variant="contained" 
                startIcon={<GroupsIcon />} 
                onClick={() => setIsDialogOpen(true)}
                size="small"
                sx={{ borderRadius: 2, textTransform: 'none' }}
            >
                Manage Teams
            </Button>
         </Box>
      )}

      {/* החלון הקופץ לניהול ההרכבים */}
      {canManage && (
        <TeamBuilderDialog 
            open={isDialogOpen}
            onClose={() => setIsDialogOpen(false)}
            participants={participants}
            initialTeams={savedTeams} // שומר על המצב הקודם אם סגרנו ופתחנו
            onSave={handleSaveTeams}
        />
      )}

      {/* אזור התראות לוטו */}
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

      {/* רשימת המשתתפים הרגילה תמיד מוצגת למטה */}
      <GameParticipantsList 
        gameId={gameId}
        participants={participants}
        organizerId={organizerId}
        initialManagers={initialManagers}
        maxPlayers={maxPlayers}
      />
    </Grid>
  );
}