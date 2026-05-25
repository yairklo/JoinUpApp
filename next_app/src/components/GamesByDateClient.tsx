"use client";

import { useMemo, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";

import { useGamesByDate } from "@/hooks/useGamesByDate";
import { useGameUpdate } from "@/context/GameUpdateContext";
import { SportFilter } from "@/utils/sports";

import GamesDateNav from "@/components/GamesDateNav";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import GamesHorizontalList from "@/components/GamesHorizontalList";
import FullPageList from "@/components/FullPageList";

export default function GamesByDateClient({
  initialDate,
  fieldId,
  sportFilter = "ALL",
}: {
  initialDate: string;
  fieldId?: string;
  sportFilter?: SportFilter;
}) {
  const { selectedDate, setSelectedDate, games, loading, groups } = useGamesByDate(initialDate, fieldId);
  const [isSeeAllOpen, setIsSeeAllOpen] = useState(false);

  const { user } = useUser();
  const router = useRouter();
  const userId = user?.id || "";
  const { notifyGameUpdate } = useGameUpdate();

  const currentDayGames = (groups[selectedDate] || []).filter((g) => {
    if (sportFilter === "ALL") return true;
    return g.sport === sportFilter;
  });

  const allFilteredGames = games.filter((g) => {
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
          <Button
            component="a"
            variant="text"
            color="primary"
            size="small"
            endIcon={<ArrowForwardIcon />}
          >
            פרטים
          </Button>
        </Link>
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

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress size={30} />
        </Box>
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
            לא נמצאו משחקים בתאריך {selectedDate}.
          </Typography>
          <Button
            size="small"
            sx={{ mt: 1 }}
            onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
          >
            חזור להיום
          </Button>
        </Box>
      ) : (
        <GamesHorizontalList
          title={`משחקים בתאריך ${selectedDate}`}
          onSeeAll={() => setIsSeeAllOpen(true)}
        >
          {currentDayGames.map(renderGameCard)}
        </GamesHorizontalList>
      )}

      {/* Full Screen Overlay for See All */}
      <FullPageList
        open={isSeeAllOpen}
        onClose={() => setIsSeeAllOpen(false)}
        title={`משחקים בתאריך ${selectedDate}`}
        items={allFilteredGames}
        renderItem={renderGameCard}
      />
    </Box>
  );
}