"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import InputAdornment from "@mui/material/InputAdornment";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";

import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import Dialog from "@mui/material/Dialog";
import FullPageList from "@/components/FullPageList";

type Game = {
    id: string;
    fieldId: string;
    fieldName: string;
    fieldLocation: string;
    date: string;
    time: string;
    duration?: number;
    maxPlayers: number;
    currentPlayers: number;
    participants?: Array<{ id: string; name?: string | null }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function GamesByCityClient({ city: initialCity }: { city?: string }) {
    const [games, setGames] = useState<Game[]>([]);
    const [displayedCity, setDisplayedCity] = useState(initialCity || "");
    const [loading, setLoading] = useState(true);
    const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [tempCity, setTempCity] = useState("");

    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const userId = user?.id || "";

    // 1. Fetch User City if not provided initially
    useEffect(() => {
        if (!isLoaded || initialCity) return; // If we have prop, use it (and it's already set in state)
        if (!user) return;

        let ignore = false;
        async function fetchUserCity() {
            try {
                const token = await getToken();
                const res = await fetch(`${API_BASE}/api/users/${user?.id}`, {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.city && !ignore) {
                        setDisplayedCity(data.city);
                    } else if (!ignore) {
                        // Fallback if user has no city
                        setDisplayedCity("Tel Aviv");
                    }
                }
            } catch (e) {
                console.error("Error fetching user city", e);
                if (!ignore) setDisplayedCity("Tel Aviv");
            }
        }
        fetchUserCity();
        return () => { ignore = true; };
    }, [isLoaded, user, initialCity, getToken]);


    // 2. Fetch Games whenever displayedCity changes
    useEffect(() => {
        if (!displayedCity) return;

        let ignore = false;
        async function fetchGames() {
            setLoading(true);
            try {
                const token = await getToken({ template: undefined }).catch(() => "");
                const qs = new URLSearchParams();
                qs.set("city", displayedCity);

                const res = await fetch(`${API_BASE}/api/games/city?${qs.toString()}`, {
                    cache: "no-store",
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });

                if (!res.ok) throw new Error("Failed to fetch city games");
                const data: Game[] = await res.json();

                data.sort(
                    (a, b) =>
                        new Date(`${a.date}T${a.time}:00`).getTime() -
                        new Date(`${b.date}T${b.time}:00`).getTime()
                );

                if (!ignore) setGames(data);
            } catch (err) {
                console.error("Error loading city games:", err);
                if (!ignore) setGames([]);
            } finally {
                if (!ignore) setLoading(false);
            }
        }

        fetchGames();
        return () => { ignore = true; };
    }, [displayedCity, getToken]);

    const handleEditClick = () => {
        setTempCity(displayedCity);
        setIsEditing(true);
    };

    const handleSaveClick = () => {
        if (tempCity.trim()) {
            setDisplayedCity(tempCity.trim());
        }
        setIsEditing(false);
    };

    const handleCancelClick = () => {
        setIsEditing(false);
    };

    // Custom Header for the List to include Edit functionality



    if (loading && games.length === 0) {
        return (
            <Box display="flex" justifyContent="center" p={2}>
                <CircularProgress size={20} />
            </Box>
        );
    }

    // Even if empty, we might want to show the header so they can change city? 
    // But current design returns null if empty. 
    // Let's allow returning empty list if we are editing or have a city, 
    // so user effectively sees "No games in X" but can change X.
    // For now, let's keep it simple: if no games found, we still show the component 
    // BUT we need to handle "No games" UI. 
    // To minimize UI disruption, if games is empty, we render the header and a message.

    return (
        <>
            <GamesHorizontalList
                title={`Games in ${displayedCity}`}
                onSeeAll={() => setIsSeeAllOpen(true)}
                customHeaderAction={
                    <IconButton size="small" onClick={handleEditClick} sx={{ ml: 1, opacity: 0.8 }} title="Search City">
                        <SearchIcon fontSize="small" />
                    </IconButton>
                }
            >
                {/* LIST CONTENT */}
                {games.length === 0 ? (
                    <Box p={2} width="100%">
                        <Typography variant="body2" color="text.secondary">
                            No games found in {displayedCity}.
                            <Button size="small" onClick={handleEditClick} startIcon={<SearchIcon />}>Search Another City</Button>
                        </Typography>
                    </Box>
                ) : (
                    games.map((g) => {
                        const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
                        const title = `${g.fieldName} • ${g.fieldLocation}`;
                        return (
                            <GameHeaderCard
                                key={g.id}
                                time={g.time}
                                durationHours={g.duration ?? 1}
                                title={title}
                                currentPlayers={g.currentPlayers}
                                maxPlayers={g.maxPlayers}
                            >
                                {joined ? <LeaveGameButton gameId={g.id} /> : <JoinGameButton gameId={g.id} />}
                                <Link href={`/games/${g.id}`} passHref legacyBehavior>
                                    <Button component="a" variant="text" color="primary" size="small" endIcon={<ArrowForwardIcon />}>Details</Button>
                                </Link>
                            </GameHeaderCard>
                        )
                    })
                )}
            </GamesHorizontalList>

            <Dialog open={isEditing} onClose={handleCancelClick}>
                <Box p={3} minWidth={300}>
                    <Typography variant="h6" mb={2} display="flex" alignItems="center" gap={1}>
                        <SearchIcon color="action" />
                        Search City
                    </Typography>
                    <TextField
                        label="City Name"
                        value={tempCity}
                        onChange={(e) => setTempCity(e.target.value)}
                        fullWidth
                        autoFocus
                        placeholder="e.g. Tel Aviv"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveClick();
                        }}
                    />
                    <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
                        <Button onClick={handleCancelClick}>Cancel</Button>
                        <Button variant="contained" onClick={handleSaveClick}>Search</Button>
                    </Box>
                </Box>
            </Dialog>

            <FullPageList
                open={isSeeAllOpen}
                onClose={() => setIsSeeAllOpen(false)}
                title={`Games in ${displayedCity}`}
                items={games}
                renderItem={(g) => {
                    const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
                    const title = `${g.fieldName} • ${g.fieldLocation}`;
                    return (
                        <GameHeaderCard
                            key={g.id}
                            time={g.time}
                            durationHours={g.duration ?? 1}
                            title={title}
                            currentPlayers={g.currentPlayers}
                            maxPlayers={g.maxPlayers}
                        >
                            {joined ? <LeaveGameButton gameId={g.id} /> : <JoinGameButton gameId={g.id} />}
                            <Link href={`/games/${g.id}`} passHref legacyBehavior>
                                <Button component="a" variant="text" color="primary" size="small" endIcon={<ArrowForwardIcon />}>Details</Button>
                            </Link>
                        </GameHeaderCard>
                    )
                }}
            />
        </>
    );
}

// Wait, I need to make sure I import Dialog.

