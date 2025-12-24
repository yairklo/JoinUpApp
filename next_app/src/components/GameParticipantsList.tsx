"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

// MUI Imports
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@/components/Avatar";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import AvatarGroup from "@mui/material/AvatarGroup";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Paper from "@mui/material/Paper";

// Icons
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import StarIcon from "@mui/icons-material/Star";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; role?: string };
type Team = { id: string; name: string; color: string; playerIds: string[] };

interface GameParticipantsListProps {
  gameId: string;
  participants: Participant[];
  organizerId: string;
  initialManagers: Manager[];
  maxPlayers: number;
  teams?: Team[]; // Added teams prop
}

export default function GameParticipantsList({
  gameId,
  participants,
  organizerId,
  initialManagers,
  maxPlayers,
  teams = [],
}: GameParticipantsListProps) {
  const { userId, getToken } = useAuth();
  const router = useRouter();

  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<Participant | null>(null);

  const openMenu = (event: React.MouseEvent<HTMLElement>, user: Participant) => {
    event.preventDefault();
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const closeMenu = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const isOrganizer = (id: string) => id === organizerId;
  const isManager = (id: string) => managers.some((m) => m.id === id);
  
  const viewerIsOrganizer = userId === organizerId;
  const viewerIsManager = managers.some((m) => m.id === userId);
  const canManage = viewerIsOrganizer || viewerIsManager;

  const handleToggleManager = async () => {
    if (!selectedUser) return;
    const isCurrentlyManager = isManager(selectedUser.id);
    const token = await getToken();

    try {
      if (isCurrentlyManager) {
        await fetch(`${API_BASE}/api/games/${gameId}/roles/${selectedUser.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setManagers((prev) => prev.filter((m) => m.id !== selectedUser.id));
      } else {
        await fetch(`${API_BASE}/api/games/${gameId}/roles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: selectedUser.id, role: "MANAGER" }),
        });
        setManagers((prev) => [...prev, { id: selectedUser.id, role: "MANAGER" }]);
      }
      router.refresh();
    } catch (error) {
      console.error("Failed to update role", error);
    } finally {
      closeMenu();
    }
  };

  const canEditUser = (targetId: string) => {
    if (!canManage) return false;
    if (targetId === userId) return false;
    if (targetId === organizerId) return false;
    if (viewerIsOrganizer) return true; 
    if (viewerIsManager && !isManager(targetId)) return true;
    return false;
  };

  // Helper to render a single participant row
  const renderParticipantRow = (p: Participant) => {
    const isOrg = isOrganizer(p.id);
    const isMgr = isManager(p.id);
    const showMenu = canEditUser(p.id);

    return (
      <ListItem
        key={p.id}
        disablePadding
        secondaryAction={
          showMenu && (
            <IconButton
              edge="end"
              aria-label="options"
              onClick={(e) => openMenu(e, p)}
              size="small"
            >
              <MoreVertIcon />
            </IconButton>
          )
        }
        sx={{
          mb: 1,
          bgcolor: "background.paper",
          borderRadius: 2,
          border: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ p: 1.5, display: "flex", alignItems: "center", width: '100%' }}>
            <Link href={`/users/${p.id}`} passHref legacyBehavior>
                <Box component="a" sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', color: 'inherit', flex: 1 }}>
                  <ListItemAvatar sx={{ minWidth: "auto", mr: 2 }}>
                    <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="md" />
                  </ListItemAvatar>
                  <ListItemText
                    primary={p.name || "Unknown User"}
                    primaryTypographyProps={{ fontWeight: 500 }}
                    secondary={isOrg ? "Organizer" : isMgr ? "Manager" : "Player"}
                  />
                </Box>
            </Link>
        </Box>

        <Box sx={{ mr: showMenu ? 2 : 1 }}>
          {isOrg ? (
            <Chip icon={<StarIcon sx={{ fontSize: "16px !important" }} />} label="Host" size="small" color="primary" variant="filled" />
          ) : isMgr ? (
            <Chip icon={<AdminPanelSettingsIcon sx={{ fontSize: "16px !important" }} />} label="Manager" size="small" color="info" variant="outlined" sx={{ fontWeight: "bold" }} />
          ) : null}
        </Box>
      </ListItem>
    );
  };

  // Calculate unassigned players if teams exist
  const assignedPlayerIds = new Set(teams.flatMap(t => t.playerIds));
  const unassignedPlayers = participants.filter(p => !assignedPlayerIds.has(p.id));
  const hasTeams = teams.length > 0;

  return (
    <Card elevation={2}>
      <CardContent>
        {/* Header Summary */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={2}>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Participants
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {participants.length} / {maxPlayers} confirmed
            </Typography>
          </Box>
          {participants.length > 0 && (
            <AvatarGroup max={5} sx={{ "& .MuiAvatar-root": { width: 32, height: 32, fontSize: 14 } }}>
              {participants.map((p) => (
                <Box key={p.id}>
                  <Avatar src={p.avatar} alt={p.name || "?"} name={p.name || "?"} size="sm" />
                </Box>
              ))}
            </AvatarGroup>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* --- VIEW MODE 1: TEAMS EXIST --- */}
        {hasTeams ? (
          <Box>
            {teams.map(team => (
                <Paper key={team.id} elevation={0} sx={{ mb: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden', borderRadius: 3 }}>
                    {/* Team Header */}
                    <Box sx={{ bgcolor: team.color, p: 1.5, color: 'white' }}>
                         <Typography variant="subtitle1" fontWeight="bold" sx={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                            {team.name} ({team.playerIds.length})
                         </Typography>
                    </Box>
                    <Box p={1}>
                        <List disablePadding>
                             {team.playerIds.map(pid => {
                                 const p = participants.find(part => part.id === pid);
                                 if (!p) return null;
                                 return renderParticipantRow(p);
                             })}
                             {team.playerIds.length === 0 && (
                                 <Typography variant="caption" sx={{ p: 2, display: 'block', color: 'text.secondary', fontStyle: 'italic' }}>
                                     No players assigned yet
                                 </Typography>
                             )}
                        </List>
                    </Box>
                </Paper>
            ))}

            {/* Unassigned Section */}
            {unassignedPlayers.length > 0 && (
                <Box mt={2}>
                    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ ml: 1, textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 'bold' }}>
                        Not Assigned ({unassignedPlayers.length})
                    </Typography>
                    <List disablePadding>
                        {unassignedPlayers.map(p => renderParticipantRow(p))}
                    </List>
                </Box>
            )}
          </Box>
        ) : (
          /* --- VIEW MODE 2: FLAT LIST (Default) --- */
          <Box>
             {participants.length > 0 ? (
                <List disablePadding>
                   {participants.map(p => renderParticipantRow(p))}
                </List>
             ) : (
                <Typography variant="body2" color="text.secondary" align="center" py={4}>
                    No participants yet. Be the first to join!
                </Typography>
             )}
          </Box>
        )}

      </CardContent>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        PaperProps={{ elevation: 3, sx: { minWidth: 200, borderRadius: 2 } }}
      >
        {selectedUser && (
            <Box>
                <MenuItem onClick={handleToggleManager}>
                  <ListItemIcon>
                    {isManager(selectedUser.id) ? <PersonIcon fontSize="small" /> : <SecurityIcon fontSize="small" />}
                  </ListItemIcon>
                  <Typography variant="body2">
                    {isManager(selectedUser.id) ? "Remove Manager Role" : "Promote to Manager"}
                  </Typography>
                </MenuItem>
            </Box>
        )}
      </Menu>
    </Card>
  );
}