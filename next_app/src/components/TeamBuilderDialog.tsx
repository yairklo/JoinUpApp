"use client";

import { useState, useEffect, forwardRef } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Avatar from "@/components/Avatar";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Slide from "@mui/material/Slide";
import { TransitionProps } from "@mui/material/transitions";
import Zoom from "@mui/material/Zoom";
import Tooltip from "@mui/material/Tooltip";
import LinearProgress from "@mui/material/LinearProgress";
import InputAdornment from "@mui/material/InputAdornment";
import { alpha, darken, lighten, getLuminance, useTheme } from "@mui/material/styles";

// Icons
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import CheckIcon from "@mui/icons-material/Check";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PersonAddAlt1Icon from "@mui/icons-material/PersonAddAlt1";
import PersonRemoveOutlinedIcon from "@mui/icons-material/PersonRemoveOutlined";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import SearchIcon from "@mui/icons-material/Search";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import EventSeatOutlinedIcon from "@mui/icons-material/EventSeatOutlined";
import BalanceIcon from "@mui/icons-material/Balance";
import TouchAppOutlinedIcon from "@mui/icons-material/TouchAppOutlined";
import { normalizeName } from "@/utils/normalizeName";

// Types
type Participant = { id: string; name: string | null; avatar?: string | null };

export type Team = {
  id: string;
  name: string;
  color: string;
  playerIds: string[];
  managerId?: string | null;
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
  { name: "כתום", hex: "#f97316" },
  { name: "כחול", hex: "#3b82f6" },
  { name: "אדום", hex: "#ef4444" },
  { name: "ירוק", hex: "#22c55e" },
  { name: "צהוב", hex: "#eab308" },
  { name: "סגול", hex: "#a855f7" },
  { name: "שחור", hex: "#1f2937" },
  { name: "טורקיז", hex: "#14b8a6" },
];

// Drop target id for dragging a player back to the bench (unassign).
const BENCH_DROP_ID = "__bench__";

// Jersey colors like black vanish against the dark-mode surface, so outlines, tints and accent
// text use a lightened variant there; the header keeps the real jersey color.
const teamAccent = (color: string, mode: "light" | "dark") =>
  mode === "dark" && getLuminance(color) < 0.12 ? lighten(color, 0.55) : color;
const teamAccentText = (color: string, mode: "light" | "dark") =>
  mode === "dark" ? lighten(teamAccent(color, mode), 0.3) : darken(color, 0.1);

const teamGradient = (color: string) =>
  `linear-gradient(135deg, ${color} 0%, ${darken(color, 0.28)} 100%)`;

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
  const theme = useTheme();
  const mode = theme.palette.mode;

  // --- State ---
  const [teams, setTeams] = useState<Team[]>(
    initialTeams && initialTeams.length > 0
      ? initialTeams
      : [
          { id: "t1", name: "קבוצה א׳", color: "#f97316", playerIds: [] },
          { id: "t2", name: "קבוצה ב׳", color: "#3b82f6", playerIds: [] },
        ]
  );

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [benchSearch, setBenchSearch] = useState("");
  // Native window.confirm() can silently no-op in some contexts (PWA standalone mode,
  // automated browsers) -- the click registers but the dialog never resolves, which reads as
  // "the button does nothing". These track an inline "tap again to confirm" step instead.
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemoveTeamId, setConfirmRemoveTeamId] = useState<string | null>(null);
  // Desktop drag-and-drop: which drop zone (team id or the bench) the pointer is over.
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Edit Dialog State
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [tempTeamName, setTempTeamName] = useState("");
  const [tempTeamColor, setTempTeamColor] = useState("");

  // Derived: Unassigned players
  const assignedPlayerIds = new Set(teams.flatMap((t) => t.playerIds));
  const unassignedPlayers = participants.filter((p) => !assignedPlayerIds.has(p.id));
  const visibleUnassignedPlayers = benchSearch.trim()
    ? unassignedPlayers.filter((p) =>
        normalizeName(p.name).toLowerCase().includes(benchSearch.trim().toLowerCase())
      )
    : unassignedPlayers;

  const totalPlayers = participants.length;
  const assignedCount = totalPlayers - unassignedPlayers.length;
  const progress = totalPlayers ? Math.round((assignedCount / totalPlayers) * 100) : 0;
  const teamSizes = teams.map((t) => t.playerIds.length);
  const isBalanced = teams.length < 2 || Math.max(...teamSizes) - Math.min(...teamSizes) <= 1;

  // --- Logic ---

  const handleAddTeam = () => {
    const newId = `t${Date.now()}`;
    const usedColors = new Set(teams.map((t) => t.color));
    const nextColor = JERSEY_COLORS.find((c) => !usedColors.has(c.hex))?.hex || "#6b7280";
    setTeams([...teams, { id: newId, name: `קבוצה ${teams.length + 1}`, color: nextColor, playerIds: [] }]);
  };

  const handleRemoveTeam = (teamId: string) => {
    if (confirmRemoveTeamId !== teamId) {
      setConfirmRemoveTeamId(teamId);
      return;
    }
    setTeams(teams.filter((t) => t.id !== teamId));
    setConfirmRemoveTeamId(null);
  };

  const handlePlayerSelect = (pid: string) => {
    setSelectedPlayerId(selectedPlayerId === pid ? null : pid);
  };

  const assignPlayer = (pid: string, teamId: string) => {
    setTeams((prev) => {
      // Remove from old teams first
      const clean = prev.map((t) => ({
        ...t,
        playerIds: t.playerIds.filter((id) => id !== pid),
      }));
      // Add to new team
      return clean.map((t) => (t.id === teamId ? { ...t, playerIds: [...t.playerIds, pid] } : t));
    });
    setSelectedPlayerId(null);
  };

  const handleAssignToTeam = (teamId: string) => {
    if (!selectedPlayerId) return;
    assignPlayer(selectedPlayerId, teamId);
  };

  const handleRemoveFromTeam = (pid: string) => {
    setTeams((prev) =>
      prev.map((t) => ({
        ...t,
        playerIds: t.playerIds.filter((id) => id !== pid),
      }))
    );
    if (selectedPlayerId === pid) setSelectedPlayerId(null);
  };

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setTeams(teams.map((t) => ({ ...t, playerIds: [] })));
    setConfirmReset(false);
  };

  // Fills all unassigned players into the existing teams, balancing by always handing the next
  // player to whichever team currently has the fewest -- a stable, evenly-spread result with no
  // manual click-per-player, per the "quick assign should actually assign" fix.
  const handleQuickAssign = () => {
    if (teams.length === 0 || unassignedPlayers.length === 0) return;
    setTeams((prev) => {
      const next = prev.map((t) => ({ ...t, playerIds: [...t.playerIds] }));
      for (const p of unassignedPlayers) {
        const smallest = next.reduce((min, t) => (t.playerIds.length < min.playerIds.length ? t : min), next[0]);
        smallest.playerIds.push(p.id);
      }
      return next;
    });
    setSelectedPlayerId(null);
  };

  const handleSaveTeams = () => {
    onSave(teams);
    onClose();
  };

  // --- Drag & drop (desktop enhancement; tap-to-select stays the primary flow) ---
  const onDragStart = (pid: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", pid);
    e.dataTransfer.effectAllowed = "move";
    setSelectedPlayerId(null);
  };

  const dropZone = (id: string, onDropPlayer: (pid: string) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragOverId !== id) setDragOverId(id);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverId(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverId(null);
      const pid = e.dataTransfer.getData("text/plain");
      if (pid) onDropPlayer(pid);
    },
  });

  // --- Edit Logic ---
  const startEdit = (t: Team, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTeam(t);
    setTempTeamName(t.name);
    setTempTeamColor(t.color);
  };

  const saveEdit = () => {
    if (editingTeam) {
      setTeams(
        teams.map((t) =>
          t.id === editingTeam.id ? { ...t, name: tempTeamName.trim() || t.name, color: tempTeamColor } : t
        )
      );
    }
    setEditingTeam(null);
  };

  // Helper to find player details
  const getP = (id: string) => participants.find((p) => p.id === id);
  const selectedPlayer = selectedPlayerId ? getP(selectedPlayerId) : undefined;
  const selectedTeamId = selectedPlayerId
    ? teams.find((t) => t.playerIds.includes(selectedPlayerId))?.id ?? null
    : null;

  // Drop any pending "tap again to confirm" state when the dialog closes, so reopening it
  // doesn't leave a stale confirm armed from a previous visit.
  useEffect(() => {
    if (!open) {
      setConfirmReset(false);
      setConfirmRemoveTeamId(null);
      setBenchSearch("");
      setSelectedPlayerId(null);
    }
  }, [open]);

  return (
    <>
      <Dialog
        fullScreen
        open={open}
        onClose={onClose}
        TransitionComponent={Transition}
        PaperProps={{
          dir: "rtl",
          sx: (t) => ({
            bgcolor: "background.default",
            backgroundImage:
              t.palette.mode === "light"
                ? "radial-gradient(900px 420px at 100% -10%, rgba(16,185,129,0.12), transparent 60%), radial-gradient(800px 400px at -10% 0%, rgba(99,102,241,0.08), transparent 55%)"
                : "radial-gradient(900px 420px at 100% -10%, rgba(52,211,153,0.12), transparent 60%), radial-gradient(800px 400px at -10% 0%, rgba(129,140,248,0.10), transparent 55%)",
          }),
        }}
      >
        {/* --- Top Bar --- */}
        <Box
          component="header"
          sx={(t) => ({
            position: "sticky",
            top: 0,
            zIndex: 5,
            bgcolor: alpha(t.palette.background.paper, 0.82),
            backdropFilter: "saturate(180%) blur(14px)",
            borderBottom: `1px solid ${t.palette.divider}`,
          })}
        >
          <Box
            sx={{
              maxWidth: 1200,
              mx: "auto",
              px: { xs: 1.5, sm: 3 },
              py: 1.25,
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            <IconButton
              onClick={onClose}
              aria-label="סגור"
              sx={{ bgcolor: "action.hover", "&:hover": { bgcolor: "action.selected" } }}
            >
              <CloseIcon />
            </IconButton>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography component="h2" sx={{ fontWeight: 800, fontSize: { xs: "1.1rem", sm: "1.3rem" }, lineHeight: 1.2 }}>
                שיבוץ קבוצות
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.25, flexWrap: "wrap" }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {assignedCount} מתוך {totalPlayers} שובצו
                </Typography>
                {teams.length >= 2 && assignedCount > 0 && (
                  <Box
                    sx={(t) => ({
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.5,
                      px: 1,
                      py: 0.1,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: isBalanced ? t.palette.primary.main : t.palette.warning.main,
                      bgcolor: alpha(isBalanced ? t.palette.primary.main : t.palette.warning.main, 0.12),
                    })}
                  >
                    <BalanceIcon sx={{ fontSize: 13 }} />
                    {isBalanced ? "מאוזן" : "לא מאוזן"}
                  </Box>
                )}
              </Box>
            </Box>
            <Button
              variant="contained"
              onClick={handleSaveTeams}
              startIcon={<CheckIcon />}
              sx={(t) => ({
                px: { xs: 2, sm: 3 },
                py: 1,
                backgroundImage: `linear-gradient(135deg, ${t.palette.primary.light} -30%, ${t.palette.primary.main} 40%, ${t.palette.primary.dark} 100%)`,
                boxShadow: `0 8px 20px ${alpha(t.palette.primary.main, 0.35)}`,
                "&:hover": { boxShadow: `0 10px 24px ${alpha(t.palette.primary.main, 0.45)}` },
              })}
            >
              שמירה
            </Button>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            aria-label="התקדמות שיבוץ"
            sx={{ height: 3, borderRadius: 0, bgcolor: "transparent", "& .MuiLinearProgress-bar": { borderRadius: 0 } }}
          />
        </Box>

        <Box
          sx={{
            maxWidth: 1200,
            mx: "auto",
            width: "100%",
            px: { xs: 1.5, sm: 3 },
            pt: { xs: 2, sm: 3 },
            pb: 14,
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "minmax(280px, 340px) 1fr" },
            gap: { xs: 2, md: 3 },
            alignItems: "start",
          }}
        >
          {/* --- The Bench (Unassigned) --- */}
          <Box
            component="section"
            aria-label="הספסל"
            {...dropZone(BENCH_DROP_ID, handleRemoveFromTeam)}
            sx={(t) => ({
              position: { md: "sticky" },
              top: { md: 96 },
              bgcolor: "background.paper",
              borderRadius: "20px",
              border: `1px solid ${dragOverId === BENCH_DROP_ID ? t.palette.primary.main : t.palette.divider}`,
              boxShadow: dragOverId === BENCH_DROP_ID ? `0 0 0 3px ${alpha(t.palette.primary.main, 0.18)}` : t.shadows[2],
              overflow: "hidden",
              transition: "box-shadow 150ms ease, border-color 150ms ease",
            })}
          >
            <Box sx={{ p: 2, pb: 1.5, display: "flex", alignItems: "center", gap: 1.25 }}>
              <Box
                sx={(t) => ({
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  display: "grid",
                  placeItems: "center",
                  color: "primary.main",
                  bgcolor: alpha(t.palette.primary.main, 0.12),
                  flexShrink: 0,
                })}
              >
                <EventSeatOutlinedIcon fontSize="small" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2 }}>הספסל</Typography>
                <Typography variant="caption" color="text.secondary">
                  {unassignedPlayers.length === 0
                    ? "כולם שובצו"
                    : `${unassignedPlayers.length} ממתינים לשיבוץ`}
                </Typography>
              </Box>
            </Box>

            <Box sx={{ px: 2, pb: 1.5, display: "flex", gap: 1 }}>
              <Button
                fullWidth
                size="small"
                variant="contained"
                color="secondary"
                startIcon={<AutoAwesomeIcon fontSize="small" />}
                onClick={handleQuickAssign}
                disabled={teams.length === 0 || unassignedPlayers.length === 0}
                sx={(t) => ({
                  py: 0.9,
                  backgroundImage:
                    teams.length === 0 || unassignedPlayers.length === 0
                      ? "none"
                      : `linear-gradient(135deg, ${t.palette.secondary.main} 0%, ${t.palette.secondary.dark} 100%)`,
                })}
              >
                שיבוץ מהיר
              </Button>
              <Tooltip title={confirmReset ? "" : "החזרת כל השחקנים לספסל"}>
                <span>
                  <Button
                    size="small"
                    color="error"
                    variant={confirmReset ? "contained" : "text"}
                    startIcon={<RestartAltIcon fontSize="small" />}
                    onClick={handleReset}
                    onBlur={() => setConfirmReset(false)}
                    disabled={assignedCount === 0 && !confirmReset}
                    sx={{ py: 0.9, whiteSpace: "nowrap", flexShrink: 0 }}
                  >
                    {confirmReset ? "לאשר?" : "איפוס"}
                  </Button>
                </span>
              </Tooltip>
            </Box>

            {unassignedPlayers.length > 8 && (
              <Box sx={{ px: 2, pb: 1.5 }}>
                <TextField
                  size="small"
                  fullWidth
                  placeholder="חיפוש שחקן..."
                  value={benchSearch}
                  onChange={(e) => setBenchSearch(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
              </Box>
            )}

            <Box
              sx={(t) => ({
                borderTop: `1px solid ${t.palette.divider}`,
                bgcolor: alpha(t.palette.text.primary, t.palette.mode === "light" ? 0.015 : 0.03),
                p: 1.5,
                display: "flex",
                flexWrap: "wrap",
                gap: 1,
                maxHeight: { xs: 220, md: "calc(100dvh - 330px)" },
                minHeight: 72,
                overflowY: "auto",
                alignContent: "flex-start",
              })}
            >
              {unassignedPlayers.length === 0 && (
                <Box sx={{ width: "100%", py: 1.5, textAlign: "center" }}>
                  <Typography sx={{ fontSize: 26, lineHeight: 1 }} aria-hidden>
                    🎉
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, fontWeight: 600 }}>
                    הספסל ריק — כולם משחקים!
                  </Typography>
                </Box>
              )}
              {unassignedPlayers.length > 0 && visibleUnassignedPlayers.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ width: "100%", textAlign: "center", py: 1.5 }}>
                  לא נמצאו שחקנים התואמים לחיפוש
                </Typography>
              )}
              {visibleUnassignedPlayers.map((p) => {
                const name = normalizeName(p.name) || "?";
                const selected = selectedPlayerId === p.id;
                return (
                  <ButtonBase
                    key={p.id}
                    draggable
                    onDragStart={onDragStart(p.id)}
                    onDragEnd={() => setDragOverId(null)}
                    onClick={() => handlePlayerSelect(p.id)}
                    aria-pressed={selected}
                    title={name}
                    sx={(t) => ({
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 0.75,
                      paddingInlineStart: "4px",
                      paddingInlineEnd: "12px",
                      py: 0.5,
                      borderRadius: 999,
                      fontFamily: "inherit",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: "grab",
                      color: selected ? t.palette.primary.contrastText : t.palette.text.primary,
                      bgcolor: selected ? t.palette.primary.main : t.palette.background.paper,
                      backgroundImage: selected
                        ? `linear-gradient(135deg, ${t.palette.primary.main} 0%, ${t.palette.primary.dark} 100%)`
                        : "none",
                      border: `1px solid ${selected ? "transparent" : t.palette.divider}`,
                      boxShadow: selected ? `0 6px 16px ${alpha(t.palette.primary.main, 0.35)}` : t.shadows[1],
                      transform: selected ? "translateY(-1px) scale(1.04)" : "none",
                      transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                      "&:hover": {
                        borderColor: selected ? "transparent" : alpha(t.palette.primary.main, 0.5),
                      },
                      "&:active": { cursor: "grabbing" },
                    })}
                  >
                    <Box sx={{ position: "relative", display: "inline-flex" }}>
                      <Avatar src={p.avatar} name={name} alt={name} size="sm" />
                      {selected && (
                        <Box
                          sx={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: "rgba(4,47,36,0.55)",
                            color: "#fff",
                          }}
                        >
                          <CheckIcon sx={{ fontSize: 15 }} />
                        </Box>
                      )}
                    </Box>
                    {name.split(" ")[0]}
                  </ButtonBase>
                );
              })}
            </Box>

            <Box sx={{ px: 2, py: 1.25, display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
              <TouchAppOutlinedIcon sx={{ fontSize: 16 }} />
              <Typography variant="caption" sx={{ lineHeight: 1.4 }}>
                הקישו על שחקן ואז על קבוצה. במחשב אפשר גם לגרור.
              </Typography>
            </Box>
          </Box>

          {/* --- The Teams --- */}
          <Box
            component="section"
            aria-label="קבוצות"
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fill, minmax(280px, 1fr))" },
              gap: 2,
              alignItems: "start",
            }}
          >
            {teams.map((team) => {
              // Are we currently moving a player into a team they're not already in?
              const isTarget = !!selectedPlayerId && selectedTeamId !== team.id;
              const isDragOver = dragOverId === team.id;
              const highlighted = isTarget || isDragOver;
              const confirmingDelete = confirmRemoveTeamId === team.id;
              const accent = teamAccent(team.color, mode);
              const accentText = teamAccentText(team.color, mode);

              return (
                <Box
                  key={team.id}
                  role={isTarget ? "button" : undefined}
                  tabIndex={isTarget ? 0 : undefined}
                  aria-label={isTarget ? `שיבוץ ל${team.name}` : undefined}
                  onClick={() => isTarget && handleAssignToTeam(team.id)}
                  onKeyDown={(e) => {
                    if (isTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      handleAssignToTeam(team.id);
                    }
                  }}
                  {...dropZone(team.id, (pid) => assignPlayer(pid, team.id))}
                  sx={(t) => ({
                    bgcolor: "background.paper",
                    borderRadius: "20px",
                    overflow: "hidden",
                    border: `1px solid ${highlighted ? accent : t.palette.divider}`,
                    boxShadow: highlighted
                      ? `0 0 0 3px ${alpha(accent, 0.22)}, 0 14px 30px ${alpha(accent, 0.22)}`
                      : t.shadows[2],
                    transform: isDragOver ? "translateY(-3px)" : "none",
                    cursor: isTarget ? "pointer" : "default",
                    transition: "all 180ms cubic-bezier(0.16, 1, 0.3, 1)",
                    "&:hover": isTarget ? { transform: "translateY(-3px)" } : undefined,
                    outline: "none",
                    "&:focus-visible": { boxShadow: `0 0 0 3px ${alpha(accent, 0.5)}` },
                  })}
                >
                  {/* Colored Header */}
                  <Box
                    sx={{
                      position: "relative",
                      overflow: "hidden",
                      backgroundImage: teamGradient(mode === "dark" && getLuminance(team.color) < 0.12 ? lighten(team.color, 0.18) : team.color),
                      color: "#fff",
                      px: 2,
                      py: 1.5,
                      display: "flex",
                      alignItems: "center",
                      gap: 1.25,
                    }}
                  >
                    <Box aria-hidden className="joinup-grain" sx={{ opacity: 0.35 }} />
                    <CheckroomIcon
                      aria-hidden
                      sx={{
                        position: "absolute",
                        insetInlineEnd: -14,
                        top: -18,
                        fontSize: 96,
                        opacity: 0.14,
                        transform: "rotate(-14deg)",
                        pointerEvents: "none",
                      }}
                    />
                    <Box
                      sx={{
                        position: "relative",
                        width: 38,
                        height: 38,
                        borderRadius: "12px",
                        bgcolor: "rgba(255,255,255,0.22)",
                        border: "1px solid rgba(255,255,255,0.35)",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        fontWeight: 800,
                        fontSize: 18,
                      }}
                    >
                      {team.playerIds.length}
                    </Box>
                    <Box sx={{ position: "relative", flex: 1, minWidth: 0 }}>
                      <Typography
                        noWrap
                        sx={{ fontWeight: 800, fontSize: "1.05rem", lineHeight: 1.2, textShadow: "0 1px 2px rgba(0,0,0,0.18)" }}
                      >
                        {team.name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, opacity: 0.85, fontWeight: 500 }}>
                        {team.playerIds.length === 1 ? "שחקן אחד" : `${team.playerIds.length} שחקנים`}
                      </Typography>
                    </Box>
                    <Box sx={{ position: "relative", display: "flex", gap: 0.5 }}>
                      <Tooltip title="עריכת קבוצה">
                        <IconButton
                          size="small"
                          aria-label="עריכת קבוצה"
                          onClick={(e) => startEdit(team, e)}
                          sx={{ color: "#fff", bgcolor: "rgba(255,255,255,0.16)", "&:hover": { bgcolor: "rgba(255,255,255,0.28)" } }}
                        >
                          <EditOutlinedIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={confirmingDelete ? "הקישו שוב כדי לאשר מחיקה" : "מחיקת קבוצה"}>
                        <IconButton
                          size="small"
                          aria-label={confirmingDelete ? "אישור מחיקת קבוצה" : "מחיקת קבוצה"}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveTeam(team.id);
                          }}
                          onBlur={() => confirmingDelete && setConfirmRemoveTeamId(null)}
                          sx={{
                            color: confirmingDelete ? "#ef4444" : "#fff",
                            bgcolor: confirmingDelete ? "#fff" : "rgba(255,255,255,0.16)",
                            "&:hover": { bgcolor: confirmingDelete ? "#fff" : "rgba(255,255,255,0.28)" },
                          }}
                        >
                          <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>

                  {/* Player List inside Team */}
                  <Box sx={{ p: 1.5 }}>
                    {team.playerIds.length === 0 ? (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 1,
                          minHeight: 120,
                          borderRadius: "14px",
                          border: `2px dashed ${alpha(accent, highlighted ? 0.7 : 0.3)}`,
                          bgcolor: alpha(accent, highlighted ? 0.1 : 0.04),
                          color: highlighted ? accentText : "text.secondary",
                          transition: "all 160ms ease",
                          px: 2,
                          textAlign: "center",
                        }}
                      >
                        <Box
                          sx={{
                            width: 44,
                            height: 44,
                            borderRadius: "50%",
                            display: "grid",
                            placeItems: "center",
                            bgcolor: alpha(accent, 0.14),
                            color: accent,
                          }}
                        >
                          <PersonAddAlt1Icon />
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: highlighted ? 700 : 500 }}>
                          {highlighted ? "הקישו כדי להוסיף לכאן" : "עדיין אין שחקנים"}
                        </Typography>
                      </Box>
                    ) : (
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                        {team.playerIds.map((pid) => {
                          const p = getP(pid);
                          if (!p) return null;
                          const name = normalizeName(p.name) || "?";
                          const selected = selectedPlayerId === pid;
                          return (
                            <Box
                              key={pid}
                              draggable
                              onDragStart={onDragStart(pid)}
                              onDragEnd={() => setDragOverId(null)}
                              onClick={(e) => {
                                e.stopPropagation();
                                // Clicking an assigned player selects them to move
                                handlePlayerSelect(pid);
                              }}
                              sx={(t) => ({
                                display: "flex",
                                alignItems: "center",
                                gap: 1.25,
                                px: 1,
                                py: 0.75,
                                borderRadius: "12px",
                                cursor: "pointer",
                                bgcolor: selected ? alpha(accent, 0.14) : "transparent",
                                boxShadow: selected ? `inset 0 0 0 1.5px ${accent}` : "none",
                                transition: "background-color 140ms ease, box-shadow 140ms ease",
                                "&:hover": { bgcolor: selected ? alpha(accent, 0.18) : t.palette.action.hover },
                                "&:hover .remove-btn": { opacity: 1 },
                              })}
                            >
                              <Box
                                sx={{
                                  borderRadius: "50%",
                                  boxShadow: `0 0 0 2px ${alpha(accent, 0.55)}`,
                                  display: "inline-flex",
                                }}
                              >
                                <Avatar src={p.avatar} name={name} alt="" size="md" />
                              </Box>
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography noWrap sx={{ fontWeight: 600, fontSize: "0.92rem" }}>
                                  {name}
                                </Typography>
                                {selected && (
                                  <Typography sx={{ fontSize: 11, color: accentText, fontWeight: 600 }}>
                                    בחרו קבוצה אחרת להעברה
                                  </Typography>
                                )}
                              </Box>
                              <Tooltip title="החזרה לספסל">
                                <IconButton
                                  className="remove-btn"
                                  size="small"
                                  aria-label={`החזרת ${name} לספסל`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveFromTeam(pid);
                                  }}
                                  sx={{
                                    opacity: { xs: 1, md: selected ? 1 : 0 },
                                    color: "text.secondary",
                                    transition: "opacity 140ms ease",
                                    "&:focus-visible": { opacity: 1 },
                                  }}
                                >
                                  <PersonRemoveOutlinedIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          );
                        })}
                        {highlighted && (
                          <Box
                            sx={{
                              mt: 0.5,
                              py: 1,
                              borderRadius: "12px",
                              border: `2px dashed ${alpha(accent, 0.6)}`,
                              bgcolor: alpha(accent, 0.08),
                              color: accentText,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 0.75,
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            <AddIcon sx={{ fontSize: 18 }} />
                            הוספה לכאן
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
              );
            })}

            {/* Add Team Button */}
            <ButtonBase
              onClick={handleAddTeam}
              sx={(t) => ({
                minHeight: { xs: 76, sm: 196 },
                borderRadius: "20px",
                border: `2px dashed ${alpha(t.palette.text.secondary, 0.3)}`,
                color: "text.secondary",
                fontFamily: "inherit",
                display: "flex",
                flexDirection: { xs: "row", sm: "column" },
                gap: 1.25,
                transition: "all 160ms ease",
                "&:hover": {
                  borderColor: t.palette.primary.main,
                  color: t.palette.primary.main,
                  bgcolor: alpha(t.palette.primary.main, 0.05),
                },
                "&:hover .add-circle": { bgcolor: t.palette.primary.main, color: t.palette.primary.contrastText, transform: "rotate(90deg)" },
              })}
            >
              <Box
                className="add-circle"
                sx={(t) => ({
                  width: 44,
                  height: 44,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  bgcolor: alpha(t.palette.text.secondary, 0.1),
                  transition: "all 200ms cubic-bezier(0.16, 1, 0.3, 1)",
                })}
              >
                <AddIcon />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: "0.95rem" }}>קבוצה חדשה</Typography>
            </ButtonBase>
          </Box>
        </Box>

        {/* --- Floating "player selected" hint --- */}
        <Zoom in={!!selectedPlayer}>
          <Box
            role="status"
            sx={{
              position: "fixed",
              bottom: "calc(20px + env(safe-area-inset-bottom, 0px))",
              // insetInline + auto margins centers without left/translate, which the RTL
              // stylis plugin would flip to right:50% and push the pill off-center.
              insetInline: 0,
              mx: "auto",
              width: "fit-content",
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              gap: 1.25,
              paddingInlineStart: "6px",
              paddingInlineEnd: "6px",
              py: 0.75,
              borderRadius: 999,
              color: mode === "dark" ? "#0f172a" : "#fff",
              bgcolor: mode === "dark" ? "#f1f5f9" : "#0f172a",
              boxShadow: mode === "dark" ? "0 16px 40px rgba(0,0,0,0.55)" : "0 16px 40px rgba(15,23,42,0.35)",
              maxWidth: "calc(100vw - 32px)",
            }}
          >
            {selectedPlayer && (
              <>
                <Avatar
                  src={selectedPlayer.avatar}
                  name={normalizeName(selectedPlayer.name) || "?"}
                  alt=""
                  size="md"
                />
                <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>
                  <Box component="span" sx={{ fontWeight: 800 }}>
                    {normalizeName(selectedPlayer.name).split(" ")[0]}
                  </Box>{" "}
                  · בחרו קבוצה
                </Typography>
                <IconButton
                  size="small"
                  aria-label="ביטול בחירה"
                  onClick={() => setSelectedPlayerId(null)}
                  sx={{ color: "inherit", bgcolor: alpha(mode === "dark" ? "#0f172a" : "#ffffff", 0.12), "&:hover": { bgcolor: alpha(mode === "dark" ? "#0f172a" : "#ffffff", 0.22) } }}
                >
                  <CloseIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </>
            )}
          </Box>
        </Zoom>
      </Dialog>

      {/* --- Edit Team Dialog --- */}
      <Dialog
        open={!!editingTeam}
        onClose={() => setEditingTeam(null)}
        PaperProps={{ dir: "rtl", sx: { width: "100%", maxWidth: 400, overflow: "hidden" } }}
      >
        {/* Live preview of the team header */}
        <Box
          sx={{
            position: "relative",
            overflow: "hidden",
            backgroundImage: teamGradient(tempTeamColor || "#6b7280"),
            color: "#fff",
            px: 3,
            py: 2.5,
            transition: "background-image 200ms ease",
          }}
        >
          <Box aria-hidden className="joinup-grain" sx={{ opacity: 0.35 }} />
          <CheckroomIcon
            aria-hidden
            sx={{ position: "absolute", insetInlineEnd: -10, top: -14, fontSize: 110, opacity: 0.15, transform: "rotate(-14deg)" }}
          />
          <Typography sx={{ position: "relative", fontSize: 12, fontWeight: 600, opacity: 0.85 }}>
            עריכת קבוצה
          </Typography>
          <Typography noWrap sx={{ position: "relative", fontSize: "1.35rem", fontWeight: 800 }}>
            {tempTeamName.trim() || "ללא שם"}
          </Typography>
        </Box>
        <DialogContent sx={{ pt: "20px !important" }}>
          <TextField
            autoFocus
            label="שם הקבוצה"
            fullWidth
            value={tempTeamName}
            onChange={(e) => setTempTeamName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveEdit()}
            sx={{ mb: 2.5 }}
          />
          <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
            צבע חולצה
          </Typography>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1.5, justifyItems: "center" }}>
            {JERSEY_COLORS.map((c) => {
              const active = tempTeamColor === c.hex;
              return (
                <Tooltip title={c.name} key={c.hex}>
                  <ButtonBase
                    onClick={() => setTempTeamColor(c.hex)}
                    aria-label={c.name}
                    aria-pressed={active}
                    sx={(t) => ({
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      backgroundImage: teamGradient(c.hex),
                      color: "#fff",
                      boxShadow: active
                        ? `0 0 0 3px ${t.palette.background.paper}, 0 0 0 5px ${c.hex}`
                        : `0 4px 10px ${alpha(c.hex, 0.35)}`,
                      transform: active ? "scale(1.05)" : "none",
                      transition: "all 160ms cubic-bezier(0.16, 1, 0.3, 1)",
                      "&:hover": { transform: "scale(1.1)" },
                    })}
                  >
                    {active && <CheckIcon sx={{ fontSize: 20 }} />}
                  </ButtonBase>
                </Tooltip>
              );
            })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setEditingTeam(null)} color="inherit">
            ביטול
          </Button>
          <Button onClick={saveEdit} variant="contained" sx={{ px: 3 }}>
            עדכון
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
