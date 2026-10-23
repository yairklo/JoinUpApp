"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";

// MUI Imports
import Avatar from "@/components/Avatar";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import { normalizeName } from "@/utils/normalizeName";

// Icons
import MoreVertIcon from "@mui/icons-material/MoreVert";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import StarIcon from "@mui/icons-material/Star";
import PersonIcon from "@mui/icons-material/Person";
import SecurityIcon from "@mui/icons-material/Security";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import PersonAddAltRoundedIcon from "@mui/icons-material/PersonAddAltRounded";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Manager = { id: string; role?: string };
type Team = { id: string; name: string; color: string; playerIds: string[]; managerId?: string | null };

interface GameParticipantsListProps {
  gameId: string;
  participants: Participant[];
  organizerId: string;
  initialManagers: Manager[];
  maxPlayers: number;
  /** Finished game: who played only -- no empty slots, seat total or invite box. */
  finished?: boolean;
  /** Server count; falls back to the roster length. The roster can be hidden for outsiders. */
  confirmedCount?: number;
  teams?: Team[]; // Added teams prop
}

export default function GameParticipantsList({
  gameId,
  participants,
  organizerId,
  initialManagers,
  maxPlayers,
  finished = false,
  confirmedCount,
  teams = [],
}: GameParticipantsListProps) {
  const { userId, getToken } = useAuth();
  const router = useRouter();

  const [managers, setManagers] = useState<Manager[]>(initialManagers);
  // router.refresh() re-renders with fresh server props; useState alone would keep the stale list
  // (a promoted manager kept showing as a plain player until promoted a second time).
  useEffect(() => { setManagers(initialManagers); }, [initialManagers]);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [selectedUser, setSelectedUser] = useState<Participant | null>(null);

  const openMenu = (event: React.MouseEvent<HTMLElement>, user: Participant) => {
    event.preventDefault();
    event.currentTarget.blur();
    setAnchorEl(event.currentTarget);
    setSelectedUser(user);
  };

  const closeMenu = () => {
    // Drop focus from the menu item before MUI aria-hides the popover, otherwise the browser
    // warns "Blocked aria-hidden on an element because its descendant retained focus".
    (document.activeElement as HTMLElement | null)?.blur?.();
    setAnchorEl(null);
    setSelectedUser(null);
  };

  const isOrganizer = (id: string) => id === organizerId;
  const isManager = (id: string) => managers.some((m) => m.id === id && (m.role === "MANAGER" || m.role === "MODERATOR"));
  const isCaptain = (id: string) => participants.some((p: any) => p.id === id && p.isCaptain);
  
  const viewerIsOrganizer = userId === organizerId;
  const viewerIsManager = managers.some((m) => m.id === userId && (m.role === "MANAGER" || m.role === "MODERATOR"));
  const canManage = viewerIsOrganizer || viewerIsManager;

  const [allFriends, setAllFriends] = useState<any[]>([]);
  // Total friend count before filtering out ones already in the game -- distinguishes "you have
  // no friends at all" from "all your friends are already in this game" (both otherwise leave
  // `allFriends` empty). `null` means the fetch hasn't resolved yet.
  const [totalFriendsCount, setTotalFriendsCount] = useState<number | null>(null);
  const [friendSearchInput, setFriendSearchInput] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<any[]>([]);
  const [addingFriends, setAddingFriends] = useState(false);

  useEffect(() => {
    if (canManage && userId) {
      // Token required: the friends list is gated by the owner's privacyFriends setting.
      getToken()
        .then((token) => fetch(`${API_BASE}/api/users/${userId}/friends`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }))
        .then((r) => (r.ok ? r.json() : []))
        .then((arr) => {
          const existingIds = new Set(participants.map((p) => p.id));
          setTotalFriendsCount((arr || []).length);
          setAllFriends((arr || []).filter((f: any) => !existingIds.has(f.id)));
        })
        .catch((e) => console.error("Failed to load friends", e));
    }
  }, [canManage, userId, participants, getToken]);

  // Three distinct empty states for the invite-friends search, instead of one misleading
  // "לא נמצאו חברים" for all of them (see BUG-B1): no friends at all, every friend is already in
  // this game, or a search that matched nothing among the remaining candidates.
  const friendsNoOptionsText =
    totalFriendsCount === null
      ? "טוען חברים…"
      : totalFriendsCount === 0
      ? "עדיין אין לך חברים. הוסף חברים ואז תוכל להזמין לכאן."
      : friendSearchInput.trim() === ""
      ? "כל החברים שלך כבר במשחק הזה."
      : "לא נמצאו חברים התואמים לחיפוש";

  const handleAddFriends = async () => {
    if (selectedFriends.length === 0) return;
    setAddingFriends(true);
    const token = await getToken();
    try {
      for (const friend of selectedFriends) {
        await fetch(`${API_BASE}/api/games/${gameId}/participants`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: friend.id }),
        });
      }
      setSelectedFriends([]);
      router.refresh();
    } catch (e) {
      console.error("Failed to add friends", e);
    } finally {
      setAddingFriends(false);
    }
  };

  const handleRemovePlayer = async () => {
    if (!selectedUser) return;
    const token = await getToken();
    try {
      const res = await fetch(`${API_BASE}/api/games/${gameId}/participants/${selectedUser.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to remove participant");
      router.refresh();
    } catch (error) {
      console.error("Failed to remove participant", error);
    } finally {
      closeMenu();
    }
  };

  const handleToggleManager = async () => {
    if (!selectedUser) return;
    const isCurrentlyManager = isManager(selectedUser.id);
    const token = await getToken();

    try {
      if (isCurrentlyManager) {
        const res = await fetch(`${API_BASE}/api/games/${gameId}/roles/${selectedUser.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Role removal failed (${res.status})`);
        setManagers((prev) => prev.filter((m) => m.id !== selectedUser.id));
      } else {
        const res = await fetch(`${API_BASE}/api/games/${gameId}/roles`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userId: selectedUser.id, role: "MANAGER" }),
        });
        if (!res.ok) throw new Error(`Role promotion failed (${res.status})`);
        // The server answers with the authoritative managers list.
        const data = await res.json().catch(() => null);
        if (Array.isArray(data?.managers)) setManagers(data.managers);
        else setManagers((prev) => [...prev.filter((m) => m.id !== selectedUser.id), { id: selectedUser.id, role: "MANAGER" }]);
      }
      router.refresh();
    } catch (error) {
      console.error("Failed to update role", error);
    } finally {
      closeMenu();
    }
  };

  const handleToggleCaptain = async () => {
    if (!selectedUser) return;
    const isCurrentlyCaptain = isCaptain(selectedUser.id);
    const token = await getToken();

    try {
      await fetch(`${API_BASE}/api/games/${gameId}/participants/${selectedUser.id}/captain`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isCaptain: !isCurrentlyCaptain }),
      });
      router.refresh();
    } catch (error) {
      console.error("Failed to set captain", error);
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

  // Helper to render a single participant tile. The menu button sits beside (not inside) the
  // profile link so opening it never navigates.
  const renderParticipantRow = (p: Participant) => {
    const isOrg = isOrganizer(p.id);
    const isMgr = isManager(p.id);
    const isMe = !!userId && p.id === userId;
    const showMenu = canEditUser(p.id);
    const name = normalizeName(p.name) || "משתמש לא ידוע";

    return (
      <Box
        key={p.id}
        sx={(t) => ({
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          minWidth: 0,
          p: 1,
          pr: 1.25,
          borderRadius: 3,
          border: "1px solid",
          borderColor: isMe
            ? alpha(t.palette.success.main, 0.5)
            : isOrg
              ? alpha(t.palette.primary.main, 0.4)
              : "divider",
          bgcolor: isMe ? alpha(t.palette.success.main, 0.06) : "background.paper",
          transition: "border-color 0.15s ease, transform 0.15s ease",
          "@media (hover: hover)": {
            "&:hover": { borderColor: alpha(t.palette.primary.main, 0.5), transform: "translateY(-1px)" },
          },
        })}
      >
        <Box
          component={Link}
          href={`/users/${p.id}`}
          sx={{ display: "flex", alignItems: "center", gap: 1.25, textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}
        >
          <Box sx={{ position: "relative", flexShrink: 0 }}>
            <Avatar src={p.avatar} alt={name} name={name} size="md" />
            {(isOrg || isMgr) && (
              <Box
                sx={{
                  position: "absolute",
                  bottom: -2,
                  insetInlineEnd: -2,
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  display: "grid",
                  placeItems: "center",
                  color: "#fff",
                  bgcolor: isOrg ? "primary.main" : "info.main",
                  border: "2px solid",
                  borderColor: "background.paper",
                  "& svg": { fontSize: 11 },
                }}
              >
                {isOrg ? <StarIcon /> : <AdminPanelSettingsIcon />}
              </Box>
            )}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={700} noWrap>
              {name}
            </Typography>
            <Typography
              variant="caption"
              noWrap
              component="div"
              sx={{ fontWeight: 600, color: isOrg ? "primary.main" : isMgr ? "info.main" : "text.secondary" }}
            >
              {isOrg ? "מארגן" : isMgr ? "מנהל" : "שחקן"}
              {isMe ? " · זה אתה" : ""}
            </Typography>
          </Box>
        </Box>

        {showMenu && (
          <IconButton aria-label="אפשרויות" onClick={(e) => openMenu(e, p)} size="small" sx={{ flexShrink: 0 }}>
            <MoreVertIcon fontSize="small" />
          </IconButton>
        )}
      </Box>
    );
  };

  const tilesGridSx = {
    display: "grid",
    gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(auto-fill, minmax(180px, 1fr))" },
    gap: 1,
  } as const;

  // Open seats are drawn as dashed placeholders so a half-empty game reads as "room for you".
  const filledCount = confirmedCount ?? participants.length;
  const openSlots = finished ? 0 : Math.max(0, maxPlayers - filledCount);
  const shownSlots = Math.min(openSlots, 6);
  const renderOpenSlots = () =>
    Array.from({ length: shownSlots }, (_, i) => {
      const isOverflow = i === shownSlots - 1 && openSlots > shownSlots;
      return (
        <Box
          key={`slot-${i}`}
          aria-hidden
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.25,
            p: 1,
            borderRadius: 3,
            border: "1.5px dashed",
            borderColor: "divider",
            color: "text.disabled",
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "1.5px dashed",
              borderColor: "divider",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
              fontWeight: 800,
              fontSize: "0.85rem",
            }}
          >
            {isOverflow ? `+${openSlots - shownSlots + 1}` : "+"}
          </Box>
          <Typography variant="caption" fontWeight={700} noWrap>
            {isOverflow ? "מקומות פנויים" : "מקום פנוי"}
          </Typography>
        </Box>
      );
    });

  // Calculate unassigned players if teams exist.
  // Managers (incl. organizer) are pre-assigned to their own team and must not
  // appear in the "Not Assigned" / bench pool.
  const draftingManagerIds = new Set<string>([
    organizerId,
    ...managers.map((m) => m.id),
  ]);
  const displayTeams = teams.map((team) => {
    const playerIds = [...(team.playerIds || [])];
    if (team.managerId && !playerIds.includes(team.managerId)) {
      playerIds.unshift(team.managerId);
    }
    return { ...team, playerIds };
  });
  const assignedPlayerIds = new Set(displayTeams.flatMap((t) => t.playerIds));
  for (const mid of draftingManagerIds) assignedPlayerIds.add(mid);
  const unassignedPlayers = participants.filter((p) => !assignedPlayerIds.has(p.id));
  const hasTeams = teams.length > 0;

  return (
    <Card elevation={0} sx={{ borderRadius: 5, border: "1px solid", borderColor: "divider" }}>
      <CardContent sx={{ p: { xs: 2, sm: 2.5 }, "&:last-child": { pb: { xs: 2, sm: 2.5 } } }}>
        {/* Header Summary */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} gap={1}>
          <Typography variant="h6" fontWeight={800} sx={{ letterSpacing: "-0.02em" }}>
            השחקנים
          </Typography>
          <Box
            dir="ltr"
            sx={(t) => ({
              unicodeBidi: "isolate",
              px: 1.25,
              py: 0.25,
              borderRadius: 999,
              fontWeight: 800,
              fontSize: "0.85rem",
              fontVariantNumeric: "tabular-nums",
              color: "primary.main",
              bgcolor: alpha(t.palette.primary.main, 0.1),
            })}
          >
            {finished ? filledCount : `${filledCount}/${maxPlayers}`}
          </Box>
        </Box>

        {canManage && !finished && (
          <Box
            mb={2.5}
            dir="rtl"
            sx={(t) => ({ p: 1.5, borderRadius: 3, bgcolor: alpha(t.palette.primary.main, 0.06) })}
          >
            <Stack direction="row" spacing={0.75} alignItems="center" mb={1} sx={{ color: "primary.main" }}>
              <PersonAddAltRoundedIcon fontSize="small" />
              <Typography variant="subtitle2" fontWeight={800}>
                צרף חברים למשחק
              </Typography>
            </Stack>
            <Box display="flex" gap={1}>
              <Autocomplete
                multiple
                options={allFriends}
                getOptionLabel={(option) => normalizeName(option.name)}
                value={selectedFriends}
                onChange={(event, newValue) => {
                  setSelectedFriends(newValue);
                }}
                inputValue={friendSearchInput}
                onInputChange={(event, newInputValue) => {
                  setFriendSearchInput(newInputValue);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    variant="outlined"
                    size="small"
                    placeholder="חפש חברים..."
                    sx={{ "& .MuiOutlinedInput-root": { bgcolor: "background.paper", borderRadius: 2 } }}
                  />
                )}
                renderOption={(props, option) => {
                  const { key, ...otherProps } = props;
                  return (
                    <li key={option.id} {...otherProps} style={{ direction: "rtl" }}>
                      {normalizeName(option.name)}
                    </li>
                  );
                }}
                noOptionsText={friendsNoOptionsText}
                sx={{ flexGrow: 1 }}
              />
              <Button
                variant="contained"
                onClick={handleAddFriends}
                disabled={addingFriends || selectedFriends.length === 0}
                size="small"
                disableElevation
                sx={{ borderRadius: 999, px: 2.5, fontWeight: 800 }}
              >
                {addingFriends ? <CircularProgress size={20} color="inherit" /> : "צרף"}
              </Button>
            </Box>
          </Box>
        )}

        {/* --- VIEW MODE 1: TEAMS EXIST --- */}
        {hasTeams ? (
          <Stack spacing={2.5}>
            {displayTeams.map((team) => (
              <Box key={team.id}>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                  <Box sx={{ width: 6, height: 22, borderRadius: 999, bgcolor: team.color, flexShrink: 0 }} />
                  <Typography variant="subtitle1" fontWeight={800} noWrap>
                    {team.name}
                  </Typography>
                  <Typography variant="caption" fontWeight={800} color="text.secondary">
                    {team.playerIds.length}
                  </Typography>
                </Stack>
                {team.playerIds.length > 0 ? (
                  <Box sx={tilesGridSx}>
                    {team.playerIds.map((pid) => {
                      const p = participants.find((part) => part.id === pid);
                      return p ? renderParticipantRow(p) : null;
                    })}
                  </Box>
                ) : (
                  <Typography variant="caption" sx={{ display: "block", color: "text.secondary", py: 1 }}>
                    עדיין לא שובצו שחקנים
                  </Typography>
                )}
              </Box>
            ))}

            {/* Unassigned Section */}
            {unassignedPlayers.length > 0 && (
              <Box>
                <Typography variant="subtitle2" color="text.secondary" fontWeight={800} mb={1}>
                  לא שובצו ({unassignedPlayers.length})
                </Typography>
                <Box sx={tilesGridSx}>{unassignedPlayers.map((p) => renderParticipantRow(p))}</Box>
              </Box>
            )}
          </Stack>
        ) : (
          /* --- VIEW MODE 2: FLAT GRID (Default) --- */
          <Box>
            {participants.length === 0 && !finished && (
              <Typography variant="body2" color="text.secondary" fontWeight={600} align="center" pb={2}>
                עוד אין שחקנים — היו הראשונים להצטרף!
              </Typography>
            )}
            <Box sx={tilesGridSx}>
              {participants.map((p) => renderParticipantRow(p))}
              {renderOpenSlots()}
            </Box>
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
                    {isManager(selectedUser.id) ? "הסר תפקיד מנהל" : "קדם למנהל"}
                  </Typography>
                </MenuItem>
                <MenuItem onClick={handleToggleCaptain}>
                  <ListItemIcon>
                    {isCaptain(selectedUser.id) ? <PersonIcon fontSize="small" /> : <SecurityIcon fontSize="small" />}
                  </ListItemIcon>
                  <Typography variant="body2">
                    {isCaptain(selectedUser.id) ? "הסר תפקיד קפטן" : "קדם לקפטן"}
                  </Typography>
                </MenuItem>
                <MenuItem onClick={handleRemovePlayer} sx={{ color: "error.main" }}>
                  <ListItemIcon>
                    <DeleteForeverIcon fontSize="small" color="error" />
                  </ListItemIcon>
                  <Typography variant="body2">
                    הסר מהמשחק
                  </Typography>
                </MenuItem>
            </Box>
        )}
      </Menu>
    </Card>
  );
}