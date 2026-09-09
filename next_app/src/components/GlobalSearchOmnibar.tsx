"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { searchApi, GlobalSearchResults } from "@/services/api/search";
import { SPORT_MAPPING, SPORT_EMOJI } from "@/utils/sports";
import Avatar from "@/components/Avatar";

// MUI
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import CircularProgress from "@mui/material/CircularProgress";
import ClickAwayListener from "@mui/material/ClickAwayListener";

// Icons
import SearchIcon from "@mui/icons-material/Search";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import HistoryIcon from "@mui/icons-material/History";
import Link from "next/link";

const EMPTY: GlobalSearchResults = { users: [], fields: [], games: [] };
const RECENT_KEY = "joinup:recent-searches";
const SUGGESTED_SPORTS: { id: string; label: string; href: string }[] = [
    { id: "SOCCER", label: SPORT_MAPPING.SOCCER, href: "/search?sport=SOCCER" },
    { id: "BASKETBALL", label: SPORT_MAPPING.BASKETBALL, href: "/search?sport=BASKETBALL" },
    { id: "TENNIS", label: SPORT_MAPPING.TENNIS, href: "/search?sport=TENNIS" },
];
const SUGGESTED_VENUES = [
    { label: "תל אביב-יפו", href: "/search?city=תל אביב-יפו" },
    { label: "ירושלים", href: "/search?city=ירושלים" },
    { label: "חיפה", href: "/search?city=חיפה" },
];

function readRecent(): string[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(RECENT_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string").slice(0, 5) : [];
    } catch {
        return [];
    }
}

function writeRecent(query: string) {
    const q = query.trim();
    if (q.length < 2) return;
    const next = [q, ...readRecent().filter((x) => x !== q)].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export default function GlobalSearchOmnibar() {
    const router = useRouter();
    const { getToken } = useAuth();

    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const [recent, setRecent] = useState<string[]>([]);

    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    const performSearch = useCallback(async (raw: string) => {
        const q = raw.trim();
        if (q.length < 2) {
            setResults(EMPTY);
            setLoading(false);
            return;
        }

        // Cancel any in-flight request before starting a new one.
        if (abortRef.current) abortRef.current.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            const data = await searchApi.global(q, token);
            if (!controller.signal.aborted) {
                setResults(data);
            }
        } catch (err) {
            if (!controller.signal.aborted) {
                console.error("[Omnibar] search failed:", err);
                setResults(EMPTY);
            }
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [getToken]);

    const handleChange = (val: string) => {
        setQuery(val);
        setOpen(true);
        if (val.trim().length < 2) {
            setResults(EMPTY);
            setLoading(false);
            if (debounceRef.current) clearTimeout(debounceRef.current);
            // Also cancel a request already in flight from a previous, longer query --
            // otherwise it can still resolve after this point and overwrite the just-cleared
            // results with stale data (performSearch only checks `aborted`, not staleness).
            if (abortRef.current) abortRef.current.abort();
            return;
        }
        setLoading(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => performSearch(val), 300);
    };

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    const trimmed = query.trim();
    const showSuggestions = open && trimmed.length < 2;
    const hasResults =
        results.users.length > 0 ||
        results.fields.length > 0 ||
        results.games.length > 0;

    const go = (path: string, recentQuery?: string) => {
        const stored = recentQuery || (query.trim().length >= 2 ? query.trim() : "");
        if (stored) writeRecent(stored);
        setRecent(readRecent());
        setOpen(false);
        setQuery("");
        setResults(EMPTY);
        router.push(path);
    };

    const showDropdown = open && (showSuggestions || (trimmed.length >= 2 && (hasResults || !loading)));

    return (
        <ClickAwayListener onClickAway={() => setOpen(false)}>
            <Box
                sx={{
                    position: "relative",
                    width: "100%",
                    maxWidth: 400,
                    // Collapse gracefully on small viewports so navbar actions keep room.
                    display: { xs: "none", md: "block" },
                }}
                dir="rtl"
            >
                <TextField
                    size="small"
                    fullWidth
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onFocus={() => {
                        setRecent(readRecent());
                        setOpen(true);
                    }}
                    placeholder="חפש שחקנים, קבוצות או מגרשים..."
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon fontSize="small" color="action" />
                            </InputAdornment>
                        ),
                        endAdornment: loading ? (
                            <InputAdornment position="end">
                                <CircularProgress size={16} />
                            </InputAdornment>
                        ) : null,
                        sx: { borderRadius: 3, bgcolor: "background.default" },
                    }}
                />

                {showDropdown && (
                    <Paper
                        elevation={6}
                        sx={{
                            position: "absolute",
                            top: "calc(100% + 6px)",
                            left: 0,
                            right: 0,
                            zIndex: 1300,
                            maxHeight: 420,
                            overflowY: "auto",
                            borderRadius: 2,
                        }}
                    >
                        {showSuggestions ? (
                            <List dense disablePadding>
                                {recent.length > 0 && (
                                    <>
                                        <SectionHeader label="חיפושים אחרונים" />
                                        {recent.map((item) => (
                                            <ListItemButton
                                                key={item}
                                                onClick={() => go(`/search?q=${encodeURIComponent(item)}`, item)}
                                                sx={{ gap: 1.5 }}
                                            >
                                                <HistoryIcon fontSize="small" color="action" />
                                                <ListItemText primary={item} />
                                            </ListItemButton>
                                        ))}
                                    </>
                                )}
                                <SectionHeader label="ענפים פופולריים" />
                                {SUGGESTED_SPORTS.map((s) => (
                                    <ListItemButton key={s.id} onClick={() => go(s.href)} sx={{ gap: 1.5 }}>
                                        <SportsSoccerIcon color="primary" fontSize="small" />
                                        <ListItemText primary={`${SPORT_EMOJI[s.id as keyof typeof SPORT_EMOJI] || ""} ${s.label}`.trim()} />
                                    </ListItemButton>
                                ))}
                                <SectionHeader label="ערים נפוצות" />
                                {SUGGESTED_VENUES.map((v) => (
                                    <ListItemButton key={v.label} onClick={() => go(v.href)}>
                                        <ListItemText
                                            primary={v.label}
                                            secondary={
                                                <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                                                    <LocationOnIcon sx={{ fontSize: 14 }} />
                                                    מגרשים ומשחקים
                                                </Box>
                                            }
                                        />
                                    </ListItemButton>
                                ))}
                            </List>
                        ) : !hasResults && !loading ? (
                            <Box sx={{ p: 3, textAlign: "center" }}>
                                <Typography variant="body2" color="text.secondary">
                                    לא נמצאו תוצאות
                                </Typography>
                            </Box>
                        ) : (
                            <List dense disablePadding sx={{ opacity: loading ? 0.6 : 1, transition: "opacity 0.2s" }}>
                                {results.users.length > 0 && (
                                    <>
                                        <SectionHeader label="אנשים" />
                                        {results.users.map((u) => (
                                            <ListItemButton
                                                key={u.id}
                                                onClick={() => go(`/users/${u.id}`)}
                                                sx={{ gap: 1.5 }}
                                            >
                                                <Avatar
                                                    src={u.imageUrl}
                                                    alt={u.name || ""}
                                                    name={u.name || undefined}
                                                    size="md"
                                                />
                                                <ListItemText primary={u.name || "משתמש"} />
                                            </ListItemButton>
                                        ))}
                                    </>
                                )}

                                {results.fields.length > 0 && (
                                    <>
                                        {results.users.length > 0 && <Divider />}
                                        <SectionHeader label="מגרשים" />
                                        {results.fields.map((f) => (
                                            <ListItemButton
                                                key={f.id}
                                                onClick={() => go(`/fields/${f.id}`)}
                                            >
                                                <ListItemText
                                                    primary={f.name}
                                                    secondary={
                                                        f.city ? (
                                                            <Box
                                                                component="span"
                                                                sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                                                            >
                                                                <LocationOnIcon sx={{ fontSize: 14 }} />
                                                                {f.city}
                                                            </Box>
                                                        ) : null
                                                    }
                                                />
                                            </ListItemButton>
                                        ))}
                                    </>
                                )}

                                {results.games.length > 0 && (
                                    <>
                                        {(results.users.length > 0 || results.fields.length > 0) && <Divider />}
                                        <SectionHeader label="משחקים" />
                                        {results.games.map((g) => {
                                            const sportLabel = g.sport ? SPORT_MAPPING[g.sport] || g.sport : "";
                                            const title = g.title || sportLabel || "משחק";
                                            const meta = [sportLabel, g.field?.city, g.time]
                                                .filter(Boolean)
                                                .join(" · ");
                                            return (
                                                <ListItemButton
                                                    key={g.id}
                                                    onClick={() => go(`/games/${g.id}`)}
                                                    sx={{ gap: 1.5 }}
                                                >
                                                    <SportsSoccerIcon color="primary" fontSize="small" />
                                                    <ListItemText primary={title} secondary={meta || null} />
                                                </ListItemButton>
                                            );
                                        })}
                                    </>
                                )}
                            </List>
                        )}

                        <Box
                            component={Link}
                            href="/search"
                            onClick={() => setOpen(false)}
                            sx={{
                                display: "block",
                                px: 2,
                                py: 1.25,
                                textAlign: "center",
                                textDecoration: "none",
                                fontSize: "0.8125rem",
                                fontWeight: 600,
                                color: "primary.main",
                                borderTop: 1,
                                borderColor: "divider",
                                bgcolor: "action.hover",
                                "&:hover": { bgcolor: "action.selected" },
                            }}
                        >
                            מחפש משחקים לפי אזור ותאריך? עבור למפת המשחקים 🗺️
                        </Box>
                    </Paper>
                )}
            </Box>
        </ClickAwayListener>
    );
}

function SectionHeader({ label }: { label: string }) {
    return (
        <Typography
            variant="caption"
            sx={{
                display: "block",
                px: 2,
                pt: 1,
                pb: 0.5,
                fontWeight: 700,
                color: "text.secondary",
                bgcolor: "action.hover",
            }}
        >
            {label}
        </Typography>
    );
}
