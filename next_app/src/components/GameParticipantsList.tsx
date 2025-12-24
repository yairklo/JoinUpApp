"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

// MUI Imports
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemAvatar from "@mui/material/ListItemAvatar";
import ListItemText from "@mui/material/ListItemText";
import Avatar from "@/components/Avatar"; // Assuming your shared Avatar component
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

// Icons
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings"; // Manager
import StarIcon from "@mui/icons-material/Star"; // Organizer
import PersonIcon from "@mui/icons-material/Person"; // Player
import SecurityIcon from "@mui/icons-material/Security";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; role?: string }; // Simplified based on your backend description

interface GameParticipantsListProps {
  gameId: string;
  participants: Participant[];
  organizerId: string;
  initialManagers: Manager[];
  maxPlayers: number;
}

export default function GameParticipantsList({
  gameId,
  participants,
  organizerId,
  initialManagers,
  maxPlayers,
}: GameParticipantsListProps) {
  const { userId, getToken } = useAuth();
  const router = useRouter();

  // Local state for managers to update UI instantly before re-fetch
  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  
  // Menu State
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<Participant | null>(null);

  const openMenu = (event: React.MouseEvent<HTMLElement>, user: Participant) => {
    event.preventDefault(); // Prevent navigation if wrapped in Link
    event.stopPropagation(); // Prevent parent ListItem onClick
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const closeMenu = () => {
    setAnchorEl(null);
    setSelectedUser(null);
  };

  // Helper: Check roles
  const isOrganizer = (id: string) => id === organizerId;
  const isManager = (id: string) => managers.some((m) => m.id === id);
  
  // Permissions Check
  const viewerIsOrganizer = userId === organizerId;
  const viewerIsManager = managers.some((m) => m.id === userId);
  const canManage = viewerIsOrganizer || viewerIsManager;

  // API: Toggle Manager Role
  const handleToggleManager = async () => {
    if (!selectedUser) return;
    const isCurrentlyManager = isManager(selectedUser.id);
    const token = await getToken();

    try {
      if (isCurrentlyManager) {
        // Demote
        await fetch(`${API_BASE}/api/games/${gameId}/roles/${selectedUser.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        setManagers((prev) => prev.filter((m) => m.id !== selectedUser.id));
      } else {
        // Promote
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
      router.refresh(); // Refresh server data
    } catch (error) {
      console.error("Failed to update role", error);
    } finally {
      closeMenu();
    }
  };

  // Logic to determine if menu should be shown for a specific target user
  const canEditUser = (targetId: string) => {
    if (!canManage) return false; // Viewer has no power
    if (targetId === userId) return false; // Can't edit self via menu here
    if (targetId === organizerId) return false; // Nobody touches the organizer
    
    // Organizer can edit everyone else
    if (viewerIsOrganizer) return true; 

    // Manager can edit Players, but not other Managers
    if (viewerIsManager && !isManager(targetId)) return true;

    return false;
  };

  return (
    <Card elevation={2}>
      <CardContent>
        {/* Header Summary */}
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={2}
          flexWrap="wrap"
          gap={2}
        >
          <Box>
            <Typography variant="h6" fontWeight="bold">
              Participants
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {participants.length} / {maxPlayers} confirmed
            </Typography>
          </Box>

          {/* Avatar Group */}
          {participants.length > 0 && (
            <AvatarGroup
              max={5}
              sx={{ "& .MuiAvatar-root": { width: 32, height: 32, fontSize: 14 } }}
            >
              {participants.map((p) => (
                <Box key={p.id}>
                  {/* Wrapping in Box to satisfy AvatarGroup child requirement */}
                  <Avatar
                    src={p.avatar}
                    alt={p.name || "?"}
                    name={p.name || "?"}
                    size="sm"
                  />
                </Box>
              ))}
            </AvatarGroup>
          )}
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Participants List */}
        {participants.length > 0 ? (
          <List disablePadding>
            {participants.map((p) => {
              const isOrg = isOrganizer(p.id);
              const isMgr = isManager(p.id);
              const showMenu = canEditUser(p.id);

              return (
                <ListItem
                  key={p.id}
                  disablePadding
                  onClick={() => router.push(`/users/${p.id}`)}
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
                    // Apply hover effect only if it's a link (handled in parent) or interactive
                    "&:hover": { bgcolor: "action.hover" },
                  }}
                >
                  {/* Avatar Area */}
                  <Box sx={{ p: 1.5, display: "flex", alignItems: "center" }}>
                    <ListItemAvatar sx={{ minWidth: "auto", mr: 2 }}>
                      <Avatar
                        src={p.avatar}
                        alt={p.name || p.id}
                        name={p.name || p.id}
                        size="md"
                      />
                    </ListItemAvatar>
                    
                    <ListItemText
                      primary={
                        <Box display="flex" alignItems="center" gap={1}>
                          <Typography variant="body1" fontWeight={500}>
                            {p.name || "Unknown User"}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        isOrg
                          ? "Organizer"
                          : isMgr
                          ? "Manager"
                          : "Player"
                      }
                    />
                  </Box>

                  {/* Role Chip */}
                  <Box sx={{ mr: showMenu ? 2 : 1 }}>
                    {isOrg ? (
                      <Chip
                        icon={<StarIcon sx={{ fontSize: "16px !important" }} />}
                        label="Host"
                        size="small"
                        color="primary" // Purple usually
                        variant="filled"
                      />
                    ) : isMgr ? (
                      <Chip
                        icon={<AdminPanelSettingsIcon sx={{ fontSize: "16px !important" }} />}
                        label="Manager"
                        size="small"
                        color="info" // Blue
                        variant="outlined"
                        sx={{ fontWeight: "bold" }}
                      />
                    ) : (
                      <Chip
                        icon={<PersonIcon sx={{ fontSize: "16px !important" }} />}
                        label="Player"
                        size="small"
                        variant="outlined"
                        sx={{ color: "text.secondary", borderColor: "divider" }}
                      />
                    )}
                  </Box>
                </ListItem>
              );
            })}
          </List>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            align="center"
            py={4}
          >
            No participants yet. Be the first to join!
          </Typography>
        )}
      </CardContent>

      {/* Management Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={closeMenu}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        PaperProps={{
            elevation: 3,
            sx: { minWidth: 200, borderRadius: 2 }
        }}
      >
        {selectedUser && (
            <Box>
                <MenuItem onClick={handleToggleManager}>
                  <ListItemIcon>
                    {isManager(selectedUser.id) ? (
                      <PersonIcon fontSize="small" />
                    ) : (
                      <SecurityIcon fontSize="small" />
                    )}
                  </ListItemIcon>
                  <Typography variant="body2">
                    {isManager(selectedUser.id)
                      ? "Remove Manager Role"
                      : "Promote to Manager"}
                  </Typography>
                </MenuItem>
                
                {/* Future Feature Placeholder */}
                <Divider />
                <MenuItem onClick={closeMenu} disabled>
                    <ListItemIcon>
                        <PersonRemoveIcon fontSize="small" />
                    </ListItemIcon>
                    <Typography variant="body2">Remove from Game</Typography>
                </MenuItem>
            </Box>
        )}
      </Menu>
    </Card>
  );
}