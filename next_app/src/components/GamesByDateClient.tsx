"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import GroupIcon from "@mui/icons-material/Group";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";

import { useGamesByDate } from "@/hooks/useGamesByDate";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter, SPORT_MAPPING } from "@/utils/sports";

import GamesDateNav from "@/components/GamesDateNav";
import GameCardSkeletonRow from "@/components/GameCardSkeletonRow";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import InlineErrorRow from "@/components/InlineErrorRow";
import { buildSearchHref } from "@/utils/searchHref";

export default function GamesByDateClient({
  initialDate,
  fieldId,
  sportFilter = "ALL",
}: {
  initialDate: string;
  fieldId?: string;
  sportFilter?: SportFilter;
}) {
  const [networkGames, setNetworkGames] = useState(false);
  const { selectedDate, setSelectedDate, loading, error, refetch, groups } = useGamesByDate(initialDate, fieldId, networkGames);

  const { user } = useUser();
  const router = useRouter();
  const userId = user?.id || "";
  const { notifyGameUpdate } = useGameUpdate();
  const todayIso = new Date().toISOString().split("T")[0];

  const currentDayGames = (groups[selectedDate] || []).filter((g) => {
    if (sportFilter === "ALL") return true;
    return g.sport === sportFilter;
  });

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
    <Box>
      <Box display="flex" alignItems="center" gap={1} mb={0.5} px={1}>
        <CalendarTodayIcon sx={{ fontSize: 18, color: "text.secondary" }} />
        <Typography variant="subtitle2" color="text.secondary" fontWeight="600" textTransform="uppercase" letterSpacing={1}>
          חפש לפי תאריך
        </Typography>
      </Box>

      <Box mb={2}>
        <GamesDateNav
          selectedDate={selectedDate}
          fieldId={fieldId}
          onSelectDate={(d) => setSelectedDate(d)}
        />
      </Box>

      <Box display="flex" justifyContent="flex-start" mb={2} px={1}>
        <Tooltip title={user ? "מציג משחקים של חברים וחברים של חברים" : "זמין למשתמשים מחוברים בלבד"}>
          <span>
            <Button
              variant={networkGames ? "contained" : "outlined"}
              size="small"
              disabled={!user}
              onClick={() => setNetworkGames(!networkGames)}
              startIcon={<GroupIcon />}
              endIcon={networkGames ? <Chip size="small" label="פעיל" sx={{ height: 18, fontSize: "0.65rem", bgcolor: "rgba(255,255,255,0.25)", color: "inherit" }} /> : undefined}
              sx={{ borderRadius: 8, textTransform: "none", fontWeight: 600 }}
            >
              רשת המכרים
            </Button>
          </span>
        </Tooltip>
      </Box>

      {loading ? (
        <GameCardSkeletonRow />
      ) : error ? (
        <InlineErrorRow message={error} onRetry={refetch} />
      ) : currentDayGames.length === 0 ? (
        <Box
          sx={{
            bgcolor: "action.hover",
            borderRadius: 2,
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            {sportFilter !== "ALL"
              ? `לא נמצאו משחקי ${SPORT_MAPPING[sportFilter] || sportFilter} בתאריך זה`
              : `לא נמצאו משחקים בתאריך ${selectedDate}.`}
          </Typography>
          <Button
            size="small"
            sx={{ mt: 1 }}
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
          >
            חזור להיום
          </Button>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            {selectedDate === todayIso
              ? "אין משחקים להיום? צפה במשחקי השבוע במפת המשחקים"
              : "אין משחקים בתאריך הזה? צפה במשחקי השבוע במפת המשחקים"}
          </Typography>
          <Button
            component={Link}
            href="/search"
            variant="outlined"
            size="small"
            sx={{ mt: 1 }}
          >
            למפת המשחקים
          </Button>
        </Box>
      ) : (
        <GamesHorizontalList
          title={`משחקים בתאריך ${selectedDate}`}
          seeAllHref={buildSearchHref({ sport: sportFilter, date: selectedDate })}
        >
          {currentDayGames.map(renderGameCard)}
        </GamesHorizontalList>
      )}
    </Box>
  );
}