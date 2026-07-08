"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { searchApi, GlobalSearchResults } from "@/services/api/search";
import { SPORT_MAPPING } from "@/utils/sports";
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

const EMPTY: GlobalSearchResults = { users: [], fields: [], games: [] };

export default function GlobalSearchOmnibar() {
    const router = useRouter();
    const { getToken } = useAuth();

    const [query, setQuery] = useState("");
    const [results, setResults] = useState<GlobalSearchResults>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);

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
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => performSearch(val), 300);
    };

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (abortRef.current) abortRef.current.abort();
        };
    }, []);

    const go = (path: string) => {
        setOpen(false);
        setQuery("");
        setResults(EMPTY);
        router.push(path);
    };

    const trimmed = query.trim();
    const hasResults =
        results.users.length > 0 ||
        results.fields.length > 0 ||
        results.games.length > 0;
    const showDropdown = open && trimmed.length >= 2;

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
                    onFocus={() => setOpen(true)}
                    placeholder="חפש אנשים, מגרשים או משחקים..."
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
                        {!hasResults && !loading ? (
                            <Box sx={{ p: 3, textAlign: "center" }}>
                                <Typography variant="body2" color="text.secondary">
                                    לא נמצאו תוצאות
                                </Typography>
                            </Box>
                        ) : (
                            <List dense disablePadding>
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
