"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import IconButton from "@mui/material/IconButton";
import SearchIcon from "@mui/icons-material/Search";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

import Dialog from "@mui/material/Dialog"; // Ensure imported

import { useGamesByCity } from "@/hooks/useGamesByCity";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter } from "@/utils/sports";

import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import FullPageList from "@/components/FullPageList";

export default function GamesByCityClient({ city: initialCity, sportFilter = "ALL" }: { city?: string; sportFilter?: SportFilter }) {
    const { games, loading, displayedCity, setDisplayedCity, availableCities } = useGamesByCity(initialCity);
    const { user } = useUser();
    const router = useRouter();
    const userId = user?.id || "";
    const { notifyGameUpdate } = useGameUpdate();

    const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [tempCity, setTempCity] = useState("");

    const handleEditClick = () => {
        setTempCity(displayedCity);
        setIsEditing(true);
    };

    const handleSaveClick = () => {
        if (tempCity.trim()) setDisplayedCity(tempCity.trim());
        setIsEditing(false);
    };

    const filteredGames = games.filter((g) => {
        if (sportFilter === "ALL") return true;
        return g.sport === sportFilter;
    });

    if (loading && games.length === 0) {
        return (
            <Box display="flex" justifyContent="center" p={2}>
                <CircularProgress size={20} />
            </Box>
        );
    }

    const renderGameCard = (g: any) => {
        const joined = !!userId && (g.participants || []).some((p: any) => p.id === userId);
        const mainTitle = g.title || g.fieldName;
        const subtitle = g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation;
        return (
            <GameHeaderCard
                key={g.id}
                time={g.time}
                date={g.date && g.date.includes('-') ? g.date.split('-').reverse().join('/') : g.date}
                durationHours={g.duration ?? 1}
                title={mainTitle}
                subtitle={subtitle}
                currentPlayers={g.currentPlayers}
                maxPlayers={g.maxPlayers}
                sport={g.sport}
                teamSize={g.teamSize}
                price={g.price}
                isJoined={joined}
            >
                {joined ? (
                    <LeaveGameButton
                        gameId={g.id}
                        currentPlayers={g.currentPlayers}
                        onLeft={() => {
                            notifyGameUpdate(g.id, 'leave', userId);
                            router.refresh();
                        }}
                    />
                ) : (
                    <JoinGameButton
                        gameId={g.id}
                        registrationOpensAt={g.registrationOpensAt}
                        onJoined={() => {
                            notifyGameUpdate(g.id, 'join', userId);
                            router.refresh();
                        }}
                    />
                )}
                <Link href={`/games/${g.id}`} passHref legacyBehavior>
                    <Button component="a" variant="text" color="primary" size="small" endIcon={<ArrowForwardIcon />}>פרטים</Button>
                </Link>
            </GameHeaderCard>
        );
    };

    return (
        <>
            <GamesHorizontalList
                title={`משחקים ב${displayedCity}`}
                onSeeAll={() => setIsSeeAllOpen(true)}
                customHeaderAction={
                    <IconButton size="small" onClick={handleEditClick} sx={{ ml: 1, opacity: 0.8 }} title="חפש עיר">
                        <SearchIcon fontSize="small" />
                    </IconButton>
                }
            >
                {filteredGames.length === 0 ? (
                    <Box p={2} width="100%">
                        <Typography variant="body2" color="text.secondary">
                            לא נמצאו משחקים ב{displayedCity}{sportFilter !== "ALL" ? ` עבור ${sportFilter}` : ""}.
                            <Button size="small" onClick={handleEditClick} startIcon={<SearchIcon />}>חפש עיר אחרת</Button>
                        </Typography>
                    </Box>
                ) : filteredGames.map(renderGameCard)}
            </GamesHorizontalList>

            <Dialog open={isEditing} onClose={() => setIsEditing(false)} fullWidth maxWidth="xs">
                <Box p={3}>
                    <Typography variant="h6" mb={2} display="flex" alignItems="center" gap={1}>
                        <SearchIcon color="action" />
                        חפש עיר
                    </Typography>
                    <Autocomplete
                        options={availableCities}
                        value={availableCities.includes(tempCity) ? tempCity : null}
                        onChange={(event, newValue) => { setTempCity(newValue || ""); }}
                        renderInput={(params) => <TextField {...params} label="שם העיר" placeholder="בחר עיר..." autoFocus />}
                        noOptionsText="לא נמצאו ערים"
                        fullWidth
                    />
                    <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
                        <Button onClick={() => setIsEditing(false)}>ביטול</Button>
                        <Button variant="contained" onClick={handleSaveClick} disabled={!tempCity}>חפש</Button>
                    </Box>
                </Box>
            </Dialog>

            <FullPageList
                open={isSeeAllOpen}
                onClose={() => setIsSeeAllOpen(false)}
                title={`משחקים ב${displayedCity}`}
                items={filteredGames}
                renderItem={renderGameCard}
            />
        </>
    );
}
