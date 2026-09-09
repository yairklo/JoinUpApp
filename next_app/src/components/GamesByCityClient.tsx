"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";
import Chip from "@mui/material/Chip";
import SearchIcon from "@mui/icons-material/Search";
import Typography from "@mui/material/Typography";

import Dialog from "@mui/material/Dialog"; // Ensure imported

import { useGamesByCity } from "@/hooks/useGamesByCity";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter, sportLabel } from "@/utils/sports";

import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import InlineErrorRow from "@/components/InlineErrorRow";
import CityPicker from "@/components/CityPicker";
import { buildSearchHref } from "@/utils/searchHref";

export default function GamesByCityClient({ city: initialCity, sportFilter = "ALL" }: { city?: string; sportFilter?: SportFilter }) {
    const { games, loading, error, refetch, displayedCity, setDisplayedCity, availableCities } = useGamesByCity(initialCity);
    const { user } = useUser();
    const router = useRouter();
    const userId = user?.id || "";
    const { notifyGameUpdate } = useGameUpdate();

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
            <GamesHorizontalList title={displayedCity ? `משחקים ב${displayedCity}` : "משחקים לפי עיר"}>
                <GameCardSkeletonRow />
            </GamesHorizontalList>
        );
    }

    if (error && games.length === 0) {
        return (
            <GamesHorizontalList title={displayedCity ? `משחקים ב${displayedCity}` : "משחקים לפי עיר"}>
                <Box p={2} width="100%">
                    <InlineErrorRow message={error} onRetry={refetch} />
                </Box>
            </GamesHorizontalList>
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
                isFriendsOnly={g.isFriendsOnly}
                href={`/games/${g.id}`}
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
                        joinPolicy={g.joinPolicy}
                        viewerParticipationStatus={g.viewerParticipationStatus}
                        onJoined={() => {
                            notifyGameUpdate(g.id, 'join', userId);
                            router.refresh();
                        }}
                    />
                )}
            </GameHeaderCard>
        );
    };

    return (
        <>
            <GamesHorizontalList
                title={`משחקים ב${displayedCity}`}
                seeAllHref={buildSearchHref({ sport: sportFilter, city: displayedCity })}
                isRefreshing={loading}
                customHeaderAction={
                    <Chip
                        size="small"
                        clickable
                        onClick={handleEditClick}
                        icon={<SearchIcon fontSize="small" />}
                        label="שנה עיר"
                        sx={{ ml: 1, fontWeight: 600 }}
                    />
                }
            >
                {filteredGames.length === 0 ? (
                    <Box p={2} width="100%">
                        <Typography variant="body2" color="text.secondary">
                            לא נמצאו {sportFilter !== "ALL" ? `משחקי ${sportLabel(sportFilter)}` : "משחקים"} ב{displayedCity}.
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
                    <CityPicker
                        value={tempCity}
                        onChange={setTempCity}
                        cities={availableCities}
                        label="שם העיר"
                        autoFocus
                        fullWidth
                    />
                    <Box display="flex" justifyContent="flex-end" gap={2} mt={3}>
                        <Button onClick={() => setIsEditing(false)}>ביטול</Button>
                        <Button variant="contained" onClick={handleSaveClick} disabled={!tempCity}>חפש</Button>
                    </Box>
                </Box>
            </Dialog>
        </>
    );
}
