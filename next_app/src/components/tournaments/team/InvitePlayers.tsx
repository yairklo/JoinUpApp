"use client";

import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckRounded from "@mui/icons-material/CheckRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";

export interface InviteCandidate {
    id: string;
    name: string;
    imageUrl?: string | null;
}

export interface InvitePlayersProps {
    query: string;
    onQueryChange: (q: string) => void;
    /** Friends (shown while the query is empty) or search results. */
    candidates: InviteCandidate[];
    loading?: boolean;
    /** User ids already invited this session or already on the roster. */
    invitedIds: ReadonlySet<string>;
    /** Per-user inline error from the last invite attempt. */
    errors?: Readonly<Record<string, string>>;
    pendingId?: string | null;
    onInvite: (userId: string) => void;
    disabled?: boolean;
}

export default function InvitePlayers({ query, onQueryChange, candidates, loading, invitedIds, errors = {}, pendingId, onInvite, disabled }: InvitePlayersProps) {
    const showingFriends = query.trim() === "";
    return (
        <Stack spacing={1.5}>
            <TextField
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="חיפוש שחקנים או חברים"
                disabled={disabled}
                fullWidth
                slotProps={{
                    htmlInput: { "data-testid": "team-invite-search", "aria-label": "חיפוש שחקנים או חברים" },
                    input: { startAdornment: <InputAdornment position="start"><SearchRounded /></InputAdornment> },
                }}
            />
            {showingFriends && candidates.length > 0 && <Typography variant="caption" color="text.secondary">חברים</Typography>}
            {loading && <CircularProgress size={20} aria-label="מחפש" />}
            {!loading && !showingFriends && candidates.length === 0 && <Typography variant="body2" color="text.secondary">לא נמצאו שחקנים</Typography>}
            <Stack component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
                {candidates.map((c) => {
                    const done = invitedIds.has(c.id);
                    const err = errors[c.id];
                    return (
                        <Stack component="li" key={c.id} spacing={0.5} sx={{ py: 0.5 }}>
                            <Stack direction="row" alignItems="center" spacing={1.5} sx={{ minHeight: 48 }}>
                                <Avatar src={c.imageUrl ?? undefined} alt="" sx={{ width: 36, height: 36 }}>{c.name?.[0]}</Avatar>
                                <Typography sx={{ flex: 1, minWidth: 0 }} noWrap>{c.name}</Typography>
                                <Button
                                    size="small"
                                    variant={done ? "text" : "outlined"}
                                    disabled={done || disabled || pendingId === c.id}
                                    data-testid={`team-invite-${c.id}`}
                                    startIcon={done ? <CheckRounded /> : undefined}
                                    onClick={() => onInvite(c.id)}
                                    sx={{ minHeight: 44, minWidth: 88 }}
                                >
                                    {done ? "הוזמן" : "הזמנה"}
                                </Button>
                            </Stack>
                            {err && <Alert severity="warning" sx={{ py: 0 }} data-testid={`team-invite-error-${c.id}`}>{err}</Alert>}
                        </Stack>
                    );
                })}
            </Stack>
        </Stack>
    );
}
