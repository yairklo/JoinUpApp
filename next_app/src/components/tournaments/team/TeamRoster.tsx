"use client";

import { useState } from "react";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Collapse from "@mui/material/Collapse";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import ShieldRounded from "@mui/icons-material/ShieldRounded";
import type { TeamMember } from "@/types/tournament";
import { ROLE_LABEL, partitionMembers } from "./teamModel";

export interface TeamRosterProps {
    members: TeamMember[];
    /** Current user id, to show "leave" on their own row. */
    viewerId?: string | null;
    /** Captain / manager: jersey, role and remove menus, cancel invites, declined list. */
    canManage?: boolean;
    /** Roster locked: menus are hidden. */
    locked?: boolean;
    busy?: boolean;
    onSetJersey?: (userId: string, n: number | null) => void;
    onSetRole?: (userId: string, role: "PLAYER" | "SUBSTITUTE") => void;
    onRemove?: (userId: string) => void;
    onCancelInvite?: (userId: string) => void;
    onLeave?: (userId: string) => void;
}

export default function TeamRoster({ members, viewerId, canManage, locked, busy, onSetJersey, onSetRole, onRemove, onCancelInvite, onLeave }: TeamRosterProps) {
    const { accepted, invited, declined } = partitionMembers(members);
    const [menu, setMenu] = useState<{ el: HTMLElement; m: TeamMember } | null>(null);
    const [jersey, setJersey] = useState<{ m: TeamMember; value: string } | null>(null);
    const [removing, setRemoving] = useState<TeamMember | null>(null);
    const [showDeclined, setShowDeclined] = useState(false);

    const row = (m: TeamMember, kind: "accepted" | "invited" | "declined") => {
        const self = m.userId === viewerId;
        const isCaptain = m.role === "CAPTAIN";
        const showMenu = kind === "accepted" && !locked && (canManage || (self && !isCaptain));
        return (
            <Stack
                component="li"
                key={m.userId}
                direction="row"
                alignItems="center"
                spacing={1.5}
                data-testid={`team-member-${m.userId}`}
                sx={{ minHeight: 56, py: 0.5, opacity: kind === "accepted" ? 1 : 0.75 }}
            >
                <Avatar src={m.imageUrl ?? undefined} alt="" sx={{ width: 40, height: 40, opacity: kind === "invited" ? 0.6 : 1 }}>
                    {m.name?.[0]}
                </Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} sx={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {m.name}
                    </Typography>
                    {kind === "invited" && <Typography variant="caption" color="text.secondary">הזמנה נשלחה</Typography>}
                    {kind === "declined" && <Typography variant="caption" color="text.secondary">דחו את ההזמנה</Typography>}
                </Box>
                {kind === "accepted" && (
                    <Chip
                        size="small"
                        variant="outlined"
                        color={isCaptain ? "primary" : "default"}
                        icon={isCaptain ? <ShieldRounded /> : undefined}
                        label={ROLE_LABEL[m.role]}
                    />
                )}
                {kind === "accepted" && m.jerseyNumber != null && (
                    <Typography variant="body2" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>{`#${m.jerseyNumber}`}</Typography>
                )}
                {kind === "invited" && canManage && !locked && (
                    <Button size="small" disabled={busy} onClick={() => onCancelInvite?.(m.userId)} sx={{ minHeight: 44 }}>
                        ביטול הזמנה
                    </Button>
                )}
                {showMenu && (
                    <IconButton
                        aria-label={`פעולות עבור ${m.name}`}
                        data-testid={`team-member-menu-${m.userId}`}
                        disabled={busy}
                        onClick={(e) => setMenu({ el: e.currentTarget, m })}
                        sx={{ width: 44, height: 44 }}
                    >
                        <MoreVertRounded />
                    </IconButton>
                )}
            </Stack>
        );
    };

    const close = () => setMenu(null);
    const target = menu?.m;
    const targetSelf = target?.userId === viewerId;

    return (
        <Box data-testid="team-roster">
            <Stack component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                {accepted.map((m) => row(m, "accepted"))}
                {invited.map((m) => row(m, "invited"))}
            </Stack>
            {canManage && declined.length > 0 && (
                <Box sx={{ mt: 1 }}>
                    <Button size="small" onClick={() => setShowDeclined((s) => !s)} aria-expanded={showDeclined}>
                        {`הזמנות שנדחו (${declined.length})`}
                    </Button>
                    <Collapse in={showDeclined}>
                        <Stack component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>{declined.map((m) => row(m, "declined"))}</Stack>
                    </Collapse>
                </Box>
            )}

            <Menu anchorEl={menu?.el} open={!!menu} onClose={close}>
                {canManage && (
                    <MenuItem onClick={() => { if (target) setJersey({ m: target, value: target.jerseyNumber != null ? String(target.jerseyNumber) : "" }); close(); }}>
                        מספר חולצה
                    </MenuItem>
                )}
                {canManage && target && target.role !== "CAPTAIN" && (
                    <MenuItem onClick={() => { onSetRole?.(target.userId, target.role === "SUBSTITUTE" ? "PLAYER" : "SUBSTITUTE"); close(); }}>
                        {target.role === "SUBSTITUTE" ? "העברה לסגל" : "העברה לספסל"}
                    </MenuItem>
                )}
                {canManage && target && target.role !== "CAPTAIN" && (
                    <MenuItem sx={{ color: "error.main" }} onClick={() => { setRemoving(target); close(); }}>
                        הסרה מהקבוצה
                    </MenuItem>
                )}
                {!canManage && targetSelf && (
                    <MenuItem sx={{ color: "error.main" }} onClick={() => { if (target) onLeave?.(target.userId); close(); }}>
                        עזיבת הקבוצה
                    </MenuItem>
                )}
            </Menu>

            <Dialog open={!!jersey} onClose={() => setJersey(null)} maxWidth="xs" fullWidth>
                <DialogTitle>מספר חולצה</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        fullWidth
                        margin="dense"
                        label="מספר (0–99)"
                        value={jersey?.value ?? ""}
                        onChange={(e) => setJersey((j) => (j ? { ...j, value: e.target.value.replace(/\D/g, "").slice(0, 2) } : j))}
                        slotProps={{ htmlInput: { inputMode: "numeric" } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setJersey(null)}>ביטול</Button>
                    <Button
                        variant="contained"
                        onClick={() => {
                            if (jersey) onSetJersey?.(jersey.m.userId, jersey.value === "" ? null : parseInt(jersey.value, 10));
                            setJersey(null);
                        }}
                    >
                        שמירה
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!removing} onClose={() => setRemoving(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{`להסיר את ${removing?.name ?? ""} מהקבוצה?`}</DialogTitle>
                <DialogContent><DialogContentText>השחקן יוסר מהסגל.</DialogContentText></DialogContent>
                <DialogActions>
                    <Button onClick={() => setRemoving(null)}>ביטול</Button>
                    <Button color="error" onClick={() => { if (removing) onRemove?.(removing.userId); setRemoving(null); }}>הסרה</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
