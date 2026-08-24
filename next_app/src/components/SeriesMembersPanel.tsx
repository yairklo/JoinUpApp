"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShareIcon from "@mui/icons-material/Share";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { seriesApi, usersApi } from "@/services/api";

type SearchUser = { id: string; name?: string | null; imageUrl?: string | null };

type Subscriber = {
    userId: string;
    role?: "MEMBER" | "MANAGER" | string;
    user: { id: string; name: string | null; avatar: string | null };
};

export default function SeriesMembersPanel({
    seriesId,
    seriesTitle,
    subscribers,
    organizerId,
    canManage,
    isOrganizer,
}: {
    seriesId: string;
    seriesTitle: string;
    subscribers: Subscriber[];
    organizerId: string;
    canManage: boolean;
    isOrganizer: boolean;
}) {
    const { getToken } = useAuth();
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<SearchUser[]>([]);
    const [selected, setSelected] = useState<SearchUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/series/${seriesId}`;
    const shareText = `הצטרפו לקבוצה ${seriesTitle} ב-joinUp: ${inviteUrl}`;

    const memberIds = useMemo(() => new Set(subscribers.map((s) => s.userId)), [subscribers]);

    const search = async (q: string) => {
        setQuery(q);
        if (q.trim().length < 2) {
            setOptions([]);
            return;
        }
        setSearching(true);
        try {
            const token = await getToken();
            if (!token) return;
            const results = await usersApi.search(q.trim(), token);
            setOptions((results || []).filter((u) => u.id !== organizerId && !memberIds.has(u.id)));
        } catch {
            setOptions([]);
        } finally {
            setSearching(false);
        }
    };

    const addMembers = async () => {
        if (!selected.length) return;
        setBusy(true);
        try {
            const token = await getToken();
            if (!token) return;
            await seriesApi.addMembers(seriesId, selected.map((u) => u.id), token);
            setSelected([]);
            setQuery("");
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    const toggleManager = async (userId: string, makeManager: boolean) => {
        setBusy(true);
        try {
            const token = await getToken();
            if (!token) return;
            await seriesApi.setMemberRole(seriesId, userId, makeManager ? "MANAGER" : "MEMBER", token);
            router.refresh();
        } finally {
            setBusy(false);
        }
    };

    const copyInvite = async () => {
        try {
            await navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
        }
    };

    const shareInvite = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: seriesTitle, text: shareText, url: inviteUrl });
                return;
            } catch (err: unknown) {
                const name = err && typeof err === "object" && "name" in err ? String((err as { name?: unknown }).name) : "";
                if (name === "AbortError" || name === "NotAllowedError") return;
            }
        }
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
    };

    if (!canManage) return null;

    return (
        <Box mt={2}>
            <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>
                <Button size="small" variant="outlined" startIcon={<ContentCopyIcon />} onClick={copyInvite}>
                    {copied ? "הקישור הועתק" : "העתק קישור הזמנה"}
                </Button>
                <Button size="small" variant="outlined" startIcon={<ShareIcon />} onClick={shareInvite}>
                    שתף
                </Button>
            </Stack>

            <Stack direction={{ xs: "column", sm: "row" }} gap={1} alignItems={{ sm: "center" }}>
                <Autocomplete
                    multiple
                    sx={{ flex: 1, minWidth: 220 }}
                    options={options}
                    value={selected}
                    filterOptions={(x) => x}
                    getOptionLabel={(o) => o.name || o.id}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    loading={searching}
                    onChange={(_, value) => setSelected(value)}
                    onInputChange={(_, value) => search(value)}
                    renderInput={(params) => (
                        <TextField
                            {...params}
                            size="small"
                            label="הוסף חברים"
                            placeholder="חיפוש לפי שם"
                            InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                    <>
                                        {searching ? <CircularProgress color="inherit" size={16} /> : null}
                                        {params.InputProps.endAdornment}
                                    </>
                                ),
                            }}
                        />
                    )}
                />
                <Button
                    variant="contained"
                    startIcon={<PersonAddIcon />}
                    disabled={!selected.length || busy}
                    onClick={addMembers}
                >
                    הוסף
                </Button>
            </Stack>

            {isOrganizer && (
                <Typography variant="caption" color="text.secondary" display="block" mt={1.5}>
                    כוכב = מנהל קבוצה. רק המארגן יכול למנות מנהלים.
                </Typography>
            )}

            {isOrganizer && subscribers.map((sub) => (
                <Stack key={sub.userId} direction="row" alignItems="center" gap={0.5} mt={0.5}>
                    <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                        {sub.user.name || sub.userId}
                    </Typography>
                    <Tooltip title={sub.role === "MANAGER" ? "הסר מנהל" : "הפוך למנהל"}>
                        <span>
                            <IconButton
                                size="small"
                                disabled={busy || sub.userId === organizerId}
                                onClick={() => toggleManager(sub.userId, sub.role !== "MANAGER")}
                                aria-label={sub.role === "MANAGER" ? "הסר מנהל" : "הפוך למנהל"}
                            >
                                {sub.role === "MANAGER" ? <StarIcon fontSize="small" color="primary" /> : <StarBorderIcon fontSize="small" />}
                            </IconButton>
                        </span>
                    </Tooltip>
                </Stack>
            ))}
        </Box>
    );
}
