"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import Alert from "@mui/material/Alert";
import Avatar from "@mui/material/Avatar";
import Chip from "@mui/material/Chip";
import CheckIcon from "@mui/icons-material/Check";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import ShareIcon from "@mui/icons-material/Share";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import { seriesApi, usersApi } from "@/services/api";
import { tryNativeShare } from "@/utils/share";
import { friendSuggestions, mergeFriendsFirst } from "@/utils/friendSuggestions";

type SearchUser = { id: string; name?: string | null; imageUrl?: string | null; friendshipStatus?: string; isFriend?: boolean };

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
    const { getToken, userId } = useAuth();
    const router = useRouter();
    const [query, setQuery] = useState("");
    const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
    const [selected, setSelected] = useState<SearchUser[]>([]);
    const [searching, setSearching] = useState(false);
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [addError, setAddError] = useState<string | null>(null);
    // Friends are fetched once per panel (first focus of the field) and reused.
    const [friends, setFriends] = useState<SearchUser[] | null>(null);
    const [friendsLoading, setFriendsLoading] = useState(false);
    const [friendsError, setFriendsError] = useState(false);
    const friendsInflight = useRef(false);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = `${origin}/series/${seriesId}`;
    const shareText = `הצטרפו לקבוצה ${seriesTitle} ב-joinUp: ${inviteUrl}`;

    const memberIds = useMemo(() => new Set(subscribers.map((s) => s.userId)), [subscribers]);

    // Debounced search; the sequence counter drops responses from superseded queries.
    const searchSeq = useRef(0);
    useEffect(() => {
        const q = query.trim();
        const seq = ++searchSeq.current;
        if (q.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }
        setSearching(true);
        const timer = setTimeout(async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const results = await usersApi.search(q, token);
                if (seq !== searchSeq.current) return;
                setSearchResults(results || []);
            } catch {
                if (seq !== searchSeq.current) return;
                setSearchResults([]);
            } finally {
                if (seq === searchSeq.current) setSearching(false);
            }
        }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const loadFriends = useCallback(async () => {
        if (friends !== null || friendsInflight.current || !userId) return;
        friendsInflight.current = true;
        setFriendsLoading(true);
        setFriendsError(false);
        try {
            const token = await getToken();
            if (!token) return;
            const list = await usersApi.getFriends(userId, token);
            setFriends(Array.isArray(list) ? list : []);
        } catch {
            setFriendsError(true);
        } finally {
            friendsInflight.current = false;
            setFriendsLoading(false);
        }
    }, [friends, userId, getToken]);

    const excludeIds = useMemo(() => {
        const ids = new Set(memberIds);
        ids.add(organizerId);
        if (userId) ids.add(userId);
        return ids;
    }, [memberIds, organizerId, userId]);

    const trimmedQuery = query.trim();
    const searchMode = trimmedQuery.length >= 2;
    const options: SearchUser[] = useMemo(
        () =>
            searchMode
                ? mergeFriendsFirst(searchResults, friends || [], trimmedQuery, excludeIds)
                : friendSuggestions(friends || [], excludeIds),
        [searchMode, searchResults, friends, trimmedQuery, excludeIds],
    );
    const showingFriendsList = !searchMode;
    const noOptionsText = friendsError
        ? "טעינת החברים נכשלה."
        : searchMode
            ? "לא נמצאו משתמשים"
            : friends && friends.length === 0
                ? "עדיין אין לך חברים. אפשר לחפש לפי שם"
                : friends
                    ? "כל החברים שלך כבר בקבוצה"
                    : "";

    const addMembers = async () => {
        if (!selected.length) return;
        setBusy(true);
        setAddError(null);
        try {
            const token = await getToken();
            if (!token) return;
            const res: any = await seriesApi.addMembers(seriesId, selected.map((u) => u.id), token);
            if (typeof res?.added === "number" && res.added < selected.length) {
                setAddError("לא ניתן היה להוסיף חלק מהמשתמשים");
            }
            setSelected([]);
            setQuery("");
            router.refresh();
        } catch {
            setAddError("הוספת החברים נכשלה. נסו שוב.");
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
        // Only touch devices get a native share sheet; on desktop it either shows nothing or an
        // unexpected OS dialog, so go straight to the WhatsApp fallback there (see utils/share).
        if (await tryNativeShare({ title: seriesTitle, text: shareText, url: inviteUrl })) return;
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
                    openOnFocus
                    disableCloseOnSelect
                    sx={{ flex: 1, minWidth: 220 }}
                    options={options}
                    value={selected}
                    filterOptions={(x) => x}
                    groupBy={showingFriendsList ? () => "החברים שלך" : undefined}
                    getOptionLabel={(o) => o.name || o.id}
                    isOptionEqualToValue={(a, b) => a.id === b.id}
                    loading={searching || friendsLoading}
                    loadingText={friendsLoading && showingFriendsList ? "טוען חברים…" : "מחפש…"}
                    noOptionsText={noOptionsText}
                    onFocus={loadFriends}
                    onChange={(_, value) => setSelected(value)}
                    onInputChange={(_, value) => setQuery(value)}
                    renderOption={(props, option, { selected: isSel }) => {
                        const { key, ...rest } = props as typeof props & { key: string };
                        return (
                            <Box component="li" key={key} {...rest} sx={{ gap: 1 }}>
                                <Avatar src={option.imageUrl || undefined} sx={{ width: 28, height: 28 }}>
                                    {(option.name || "?").charAt(0)}
                                </Avatar>
                                <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                                    {option.name || option.id}
                                </Typography>
                                {option.isFriend && <Chip size="small" label="חבר/ה" />}
                                {isSel && <CheckIcon fontSize="small" color="primary" aria-label="נבחר" />}
                            </Box>
                        );
                    }}
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
                                        {searching || friendsLoading ? <CircularProgress color="inherit" size={16} /> : null}
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

            {friendsError && (
                <Alert
                    severity="error"
                    sx={{ mt: 1 }}
                    action={<Button color="inherit" size="small" onClick={loadFriends}>נסו שוב</Button>}
                >
                    טעינת החברים נכשלה.
                </Alert>
            )}

            {addError && <Alert severity="error" sx={{ mt: 1 }} onClose={() => setAddError(null)}>{addError}</Alert>}

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
