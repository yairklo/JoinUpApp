"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import Avatar from "@/components/Avatar";
import { useTournamentMutations } from "@/hooks/tournaments";
import { searchApi, type SearchUserResult } from "@/services/api/search";
import { tournamentsApi, tournamentErrorMessage, toTournamentError } from "@/services/api/tournaments";
import type { TournamentRole, TournamentRoleRow } from "@/types/tournament";

const ROLE_HE: Record<TournamentRole, string> = { ORGANIZER: "מארגן", MANAGER: "מנהל", SCOREKEEPER: "רשם תוצאות" };
type Assignable = Exclude<TournamentRole, "ORGANIZER">;

export interface RolesPanelProps {
    tournamentId: string;
}

/** Manage section (d): staff list, add by search, change and remove (organizer only; spec 11.4). */
export default function RolesPanel({ tournamentId }: RolesPanelProps) {
    const { getToken } = useAuth();
    const mut = useTournamentMutations();
    const [rows, setRows] = useState<TournamentRoleRow[] | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SearchUserResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [picked, setPicked] = useState<SearchUserResult | null>(null);
    const [role, setRole] = useState<Assignable>("SCOREKEEPER");
    const [menu, setMenu] = useState<{ el: HTMLElement; row: TournamentRoleRow } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            setRows(await tournamentsApi.listRoles(tournamentId, token));
            setLoadError(null);
        } catch (e) {
            setLoadError(tournamentErrorMessage(toTournamentError(e)) ?? "לא הצלחנו לטעון את ההרשאות.");
        }
    }, [getToken, tournamentId]);
    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2 || picked) {
            setResults([]);
            return;
        }
        let live = true;
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                const token = await getToken();
                const res = await searchApi.global(q, token ?? undefined);
                if (live) setResults(res.users.slice(0, 8));
            } catch {
                if (live) setResults([]);
            } finally {
                if (live) setSearching(false);
            }
        }, 300);
        return () => {
            live = false;
            clearTimeout(timer);
        };
    }, [query, picked, getToken]);

    const add = async () => {
        if (!picked) return;
        setError(null);
        const res = await mut.addRole(tournamentId, picked.id, role);
        if (res) {
            setPicked(null);
            setQuery("");
            void load();
        } else setError(tournamentErrorMessage(mut.error) ?? "לא הצלחנו להוסיף. נסו שוב.");
    };
    const change = async (row: TournamentRoleRow, to: Assignable) => {
        setMenu(null);
        setError(null);
        const res = await mut.addRole(tournamentId, row.userId, to);
        if (res) void load();
        else setError("לא הצלחנו לשנות את התפקיד. נסו שוב.");
    };
    const remove = async (row: TournamentRoleRow) => {
        setMenu(null);
        setError(null);
        const res = await mut.removeRole(tournamentId, row.userId);
        if (res) void load();
        else setError("לא הצלחנו להסיר. נסו שוב.");
    };

    if (loadError) return <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>נסו שוב</Button>}>{loadError}</Alert>;
    if (!rows) return <CircularProgress size={24} aria-label="טוען" />;
    const others = rows.filter((r) => r.role !== "ORGANIZER");

    return (
        <Box data-testid="manage-section-roles">
            {error && <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError(null)}>{error}</Alert>}
            <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }} data-testid="roles-list">
                {rows.map((r) => (
                    <Stack key={r.userId} component="li" direction="row" spacing={1.5} alignItems="center" sx={{ minHeight: 56, borderBottom: 1, borderColor: "divider" }} data-testid={`roles-row-${r.userId}`}>
                        <Avatar src={r.imageUrl ?? undefined} alt={r.name} name={r.name} size="md" />
                        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, minWidth: 0 }} noWrap>{r.name}</Typography>
                        <Chip size="small" label={ROLE_HE[r.role]} color={r.role === "ORGANIZER" ? "primary" : "default"} variant="outlined" />
                        {r.role !== "ORGANIZER" && (
                            <IconButton aria-label={`אפשרויות ל${r.name}`} onClick={(e) => setMenu({ el: e.currentTarget, row: r })} sx={{ width: 44, height: 44 }}>
                                <MoreVertRoundedIcon />
                            </IconButton>
                        )}
                    </Stack>
                ))}
                {others.length === 0 && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>אין עוד מנהלים</Typography>}
            </Box>
            <Menu open={!!menu} anchorEl={menu?.el} onClose={() => setMenu(null)}>
                {menu && (
                    <MenuItem onClick={() => void change(menu.row, menu.row.role === "MANAGER" ? "SCOREKEEPER" : "MANAGER")}>
                        {`שינוי ל${ROLE_HE[menu.row.role === "MANAGER" ? "SCOREKEEPER" : "MANAGER"]}`}
                    </MenuItem>
                )}
                {menu && <MenuItem onClick={() => void remove(menu.row)} sx={{ color: "error.main" }}>הסרה</MenuItem>}
            </Menu>

            <Box sx={{ mt: 2, color: "text.secondary" }}>
                <Typography variant="caption" display="block">מנהל: יכול לערוך את הטורניר, לאשר קבוצות ולבנות לוח משחקים.</Typography>
                <Typography variant="caption" display="block">רשם תוצאות: יכול להזין תוצאות בלבד.</Typography>
            </Box>

            <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>הוספת מנהל או רשם</Typography>
                {picked ? (
                    <Chip label={picked.name ?? "משתמש"} onDelete={() => setPicked(null)} sx={{ mb: 1 }} />
                ) : (
                    <>
                        <TextField fullWidth size="small" label="חיפוש שחקנים" value={query} onChange={(e) => setQuery(e.target.value)} inputProps={{ "data-testid": "roles-search" }} />
                        {searching && <CircularProgress size={16} sx={{ mt: 1 }} />}
                        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0 }}>
                            {results.map((u) => (
                                <Stack key={u.id} component="li" direction="row" spacing={1.5} alignItems="center" onClick={() => setPicked(u)} sx={{ minHeight: 48, cursor: "pointer" }} data-testid={`roles-result-${u.id}`}>
                                    <Avatar src={u.imageUrl ?? undefined} alt={u.name ?? ""} name={u.name ?? ""} size="sm" />
                                    <Typography variant="body2">{u.name}</Typography>
                                </Stack>
                            ))}
                        </Box>
                    </>
                )}
                <ToggleButtonGroup exclusive size="small" value={role} onChange={(_, v) => v && setRole(v)} sx={{ my: 1, display: "flex" }} aria-label="תפקיד">
                    <ToggleButton value="SCOREKEEPER" sx={{ flex: 1, minHeight: 44 }}>{ROLE_HE.SCOREKEEPER}</ToggleButton>
                    <ToggleButton value="MANAGER" sx={{ flex: 1, minHeight: 44 }}>{ROLE_HE.MANAGER}</ToggleButton>
                </ToggleButtonGroup>
                <Button variant="contained" disabled={!picked || mut.pending} onClick={() => void add()} data-testid="roles-add" sx={{ minHeight: 44 }}>
                    הוספה
                </Button>
            </Box>
        </Box>
    );
}
