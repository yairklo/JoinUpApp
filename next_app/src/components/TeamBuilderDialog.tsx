"use client";

import { useState, forwardRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import Avatar from "@/components/Avatar";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Slide from "@mui/material/Slide";
import { TransitionProps } from "@mui/material/transitions";
import Stack from "@mui/material/Stack";
import Zoom from "@mui/material/Zoom";
import Badge from "@mui/material/Badge";
import Tooltip from "@mui/material/Tooltip";

// Icons
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditIcon from "@mui/icons-material/Edit";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import PersonAddIcon from "@mui/icons-material/PersonAdd";

// Types
type Participant = { id: string; name: string | null; avatar?: string | null };

export type Team = {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
};

// Transition for the full-screen dialog (slides up like a native app)
const Transition = forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

// Vibrant Jersey Colors
const JERSEY_COLORS = [
  { name: "Orange", hex: "#f97316" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Red", hex: "#ef4444" },
  { name: "Green", hex: "#22c55e" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Purple", hex: "#a855f7" },
  { name: "Black", hex: "#1f2937" },
  { name: "Teal", hex: "#14b8a6" },
];

interface TeamBuilderDialogProps {
  open: boolean;
  onClose: () => void;
  participants: Participant[];
  initialTeams?: Team[];
  onSave: (teams: Team[]) => void;
}

export default function TeamBuilderDialog({
  open,
  onClose,
  participants,
  initialTeams,
  onSave,
}: TeamBuilderDialogProps) {
  // --- State ---
  const [teams, setTeams] = useState<Team[]>(
    initialTeams && initialTeams.length > 0
      ? initialTeams
      : [
          { id: "t1", name: "Team A", color: "#f97316", playerIds: [] },
          { id: "t2", name: "Team B", color: "#3b82f6", playerIds: [] },
        ]
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  
  // Edit Dialog State
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [tempTeamName, setTempTeamName] = useState("");
  const [tempTeamColor, setTempTeamColor] = useState("");

  // Derived: Unassigned players
  const assignedPlayerIds = new Set(teams.flatMap((t) => t.playerIds));
  const unassignedPlayers = participants.filter((p) => !assignedPlayerIds.has(p.id));

  // --- Logic ---

  const handleAddTeam = () => {
    const newId = `t${Date.now()}`;
    const usedColors = new Set(teams.map((t) => t.color));
    const nextColor = JERSEY_COLORS.find((c) => !usedColors.has(c.hex))?.hex || "#6b7280";
    setTeams([...teams, { id: newId, name: `Team ${teams.length + 1}`, color: nextColor, playerIds: [] }]);
  };

  const handleRemoveTeam = (teamId: string) => {
    if (confirm("Delete this team? Players will return to bench.")) {
      setTeams(teams.filter((t) => t.id !== teamId));
    }
  };

  const handlePlayerSelect = (pid: string) => {
    setSelectedPlayerId(selectedPlayerId === pid ? null : pid);
  };

  const handleAssignToTeam = (teamId: string) => {
    if (!selectedPlayerId) return;

    setTeams((prev) => {
      // Remove from old teams first
      const clean = prev.map((t) => ({
        ...t,
        playerIds: t.playerIds.filter((id) => id !== selectedPlayerId),
      }));
      // Add to new team
      return clean.map((t) =>
        t.id === teamId ? { ...t, playerIds: [...t.playerIds, selectedPlayerId] } : t
      );
    });
    setSelectedPlayerId(null);
  };

  const handleRemoveFromTeam = (pid: string) => {
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        playerIds: t.playerIds.filter((id) => id !== pid),
      }))
    );
  };

  const handleReset = () => {
    if (confirm("Reset all squads?")) {
      setTeams(teams.map((t) => ({ ...t, playerIds: [] })));
    }
  };

  const handleSaveTeams = () => {
    onSave(teams);
    onClose();
  };

  // --- Edit Logic ---
  const startEdit = (t: Team, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTeam(t);
    setTempTeamName(t.name);
    setTempTeamColor(t.color);
  };

  const saveEdit = () => {
    if (editingTeam) {
      setTeams(teams.map((t) => (t.id === editingTeam.id ? { ...t, name: tempTeamName, color: tempTeamColor } : t)));
    }
    setEditingTeam(null);
  };

  // Helper to find player details
  const getP = (id: string) => participants.find((p) => p.id === id);

  return (
    <>
      <Dialog
        fullScreen
        open={open}
        onClose={onClose}
        TransitionComponent={Transition}
        PaperProps={{ sx: { bgcolor: "#f8fafc" } }} // Light gray background for contrast
      >
        {/* --- Top Bar --- */}
        <AppBar sx={{ position: "relative", bgcolor: "white", color: "text.primary" }} elevation={1}>
          <Toolbar>
            <IconButton edge="start" color="inherit" onClick={onClose} aria-label="close">
              <CloseIcon />
            </IconButton>
            <Typography sx={{ ml: 2, flex: 1 }} variant="h6" component="div" fontWeight="bold">
              Team Builder
            </Typography>
            <Button autoFocus variant="contained" onClick={handleSaveTeams} startIcon={<SaveIcon />} sx={{ borderRadius: 2 }}>
              Save
            </Button>
          </Toolbar>
        </AppBar>

        <Box sx={{ p: 2, maxWidth: 1000, mx: "auto", width: "100%" }}>
          
          {/* --- The Bench (Unassigned) --- */}
          <Paper elevation={0} sx={{ p: 2, mb: 3, borderRadius: 3, border: "1px solid", borderColor: "divider" }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1" fontWeight="bold" color="text.secondary">
                THE BENCH ({unassignedPlayers.length})
              </Typography>
              <Button size="small" color="error" startIcon={<RestartAltIcon />} onClick={handleReset}>
                Reset All
              </Button>
            </Box>

            <Box display="flex" flexWrap="wrap" gap={1}>
              {unassignedPlayers.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  Empty bench! Everyone is playing.
                </Typography>
              )}
              {unassignedPlayers.map((p) => (
                <Chip
                  key={p.id}
                  avatar={<Avatar src={p.avatar} name={p.name || "?"} alt={p.name || "?"} size="sm" />}
                  label={p.name?.split(" ")[0]}
                  onClick={() => handlePlayerSelect(p.id)}
                  color={selectedPlayerId === p.id ? "primary" : "default"}
                  variant={selectedPlayerId === p.id ? "filled" : "outlined"}
                  sx={{ 
                    transition: "all 0.2s", 
                    transform: selectedPlayerId === p.id ? "scale(1.05)" : "scale(1)",
                    borderWidth: selectedPlayerId === p.id ? 0 : 1
                  }}
                />
              ))}
            </Box>
          </Paper>

          {/* --- The Teams --- */}
          <Grid container spacing={2}>
            {teams.map((team) => {
              const isTarget = !!selectedPlayerId; // Are we currently moving a player?
              
              return (
                <Grid key={team.id} size={{ xs: 12, md: 6 }}>
                  <Paper
                    elevation={isTarget ? 4 : 1}
                    onClick={() => isTarget && handleAssignToTeam(team.id)}
                    sx={{
                      minHeight: 200,
                      borderRadius: 3,
                      position: "relative",
                      overflow: "hidden",
                      cursor: isTarget ? "pointer" : "default",
                      transition: "all 0.2s",
                      border: isTarget ? "2px dashed" : "1px solid",
                      borderColor: isTarget ? team.color : "divider",
                      bgcolor: isTarget ? "rgba(0,0,0,0.02)" : "white",
                    }}
                  >
                    {/* Colored Header */}
                    <Box
                      sx={{
                        bgcolor: team.color,
                        p: 1.5,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        color: "#fff", // Text always white on colored header
                      }}
                    >
                      <Box display="flex" alignItems="center" gap={1}>
                        <Typography variant="h6" fontWeight="bold" sx={{ fontSize: "1rem", textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}>
                          {team.name}
                        </Typography>
                        <Chip 
                            label={team.playerIds.length} 
                            size="small" 
                            sx={{ bgcolor: "rgba(255,255,255,0.25)", color: "white", fontWeight: "bold", height: 20 }} 
                        />
                      </Box>
                      <Box>
                        <IconButton size="small" onClick={(e) => startEdit(team, e)} sx={{ color: "white" }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleRemoveTeam(team.id); }} sx={{ color: "white" }}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>

                    {/* Player List inside Team */}
                    <Box p={2}>
                      {team.playerIds.length === 0 ? (
                        <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={120} color="text.secondary" gap={1}>
                            <PersonAddIcon sx={{ opacity: 0.3, fontSize: 40 }} />
                            <Typography variant="caption">
                                {isTarget ? "Tap here to add player" : "Empty Squad"}
                            </Typography>
                        </Box>
                      ) : (
                        <Grid container spacing={1}>
                           {team.playerIds.map(pid => {
                               const p = getP(pid);
                               if(!p) return null;
                               return (
                                   <Grid key={pid} size={{ xs: 6 }}>
                                       <Box 
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             // If we click an assigned player, we select them to move
                                             handlePlayerSelect(pid); 
                                         }}
                                         sx={{
                                             display: 'flex', 
                                             alignItems: 'center', 
                                             p: 0.5, 
                                             borderRadius: 2,
                                             bgcolor: selectedPlayerId === pid ? 'primary.light' : 'action.hover',
                                             color: selectedPlayerId === pid ? 'white' : 'text.primary',
                                             cursor: 'pointer',
                                             transition: '0.2s'
                                         }}
                                       >
                                           <Avatar src={p.avatar} name={p.name||"?"} alt="" size="sm" />
                                           <Typography variant="body2" noWrap sx={{ ml: 1, fontWeight: 500, fontSize: '0.85rem' }}>
                                               {p.name?.split(" ")[0]}
                                           </Typography>
                                           {selectedPlayerId === pid && (
                                                <IconButton 
                                                    size="small" 
                                                    sx={{ ml: 'auto', p:0.5, color: 'white' }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveFromTeam(pid); // Quick remove logic
                                                    }}
                                                >
                                                    <CloseIcon fontSize="small" />
                                                </IconButton>
                                           )}
                                       </Box>
                                   </Grid>
                               )
                           })}
                        </Grid>
                      )}
                    </Box>
                  </Paper>
                </Grid>
              );
            })}

            {/* Add Team Button */}
            <Grid size={{ xs: 12, md: 6 }}>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleAddTeam}
                startIcon={<AddIcon />}
                sx={{
                  minHeight: 200,
                  borderRadius: 3,
                  borderStyle: "dashed",
                  borderColor: "divider",
                  color: "text.secondary",
                  flexDirection: "column",
                  gap: 1
                }}
              >
                Create New Team
              </Button>
            </Grid>
          </Grid>
        </Box>
      </Dialog>

      {/* --- Edit Team Dialog --- */}
      <Dialog open={!!editingTeam} onClose={() => setEditingTeam(null)}>
        <DialogContent sx={{ minWidth: 300 }}>
          <Typography variant="h6" fontWeight="bold" gutterBottom>
            Edit Team Details
          </Typography>
          <TextField
            autoFocus
            label="Team Name"
            fullWidth
            value={tempTeamName}
            onChange={(e) => setTempTeamName(e.target.value)}
            sx={{ mb: 3, mt: 1 }}
          />
          <Typography variant="subtitle2" gutterBottom>
            Jersey Color
          </Typography>
          <Box display="flex" flexWrap="wrap" gap={1.5}>
            {JERSEY_COLORS.map((c) => (
              <Tooltip title={c.name} key={c.hex}>
                <Box
                  onClick={() => setTempTeamColor(c.hex)}
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    bgcolor: c.hex,
                    cursor: "pointer",
                    border: "3px solid",
                    borderColor: tempTeamColor === c.hex ? "black" : "transparent",
                    boxShadow: 2,
                    transition: "transform 0.1s",
                    "&:hover": { transform: "scale(1.1)" }
                  }}
                />
              </Tooltip>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingTeam(null)}>Cancel</Button>
          <Button onClick={saveEdit} variant="contained">
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}