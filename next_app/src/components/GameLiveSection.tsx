"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import PendingJoinRequests from "@/components/PendingJoinRequests";
import { useSocket } from "@/context/SocketContext";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";

type Participant = { id: string; name: string | null; avatar?: string | null };

export type LiveGame = {
  id: string;
  time: string;
  date?: string;
  start?: string;
  duration?: number;
  title?: string | null;
  fieldName: string;
  fieldLocation: string;
  currentPlayers: number;
  maxPlayers: number;
  sport?: string;
  teamSize?: number | null;
  price?: number | null;
  participants: Participant[];
  registrationOpensAt?: string | null;
  joinPolicy?: "INSTANT" | "REQUIRES_APPROVAL";
  viewerParticipationStatus?: "PENDING" | "CONFIRMED" | "WAITLISTED" | "REJECTED" | null;
  lotteryEnabled?: boolean;
  lotteryPending?: boolean;
  totalSignups?: number;
};

// mapGameForClient on the server only ever returns the raw `start` ISO string — the pre-formatted
// `date`/`time` strings this component (and GameHeaderCard) render are computed once, server-side,
// by this same page's fetchGame(). Any payload arriving later — the `game:updated` socket
// broadcast, or a mutation's own HTTP response (join/leave/approve/reject) — is that same raw
// shape, so it must be normalized the exact same way before merging into state, or `date`/`time`
// end up missing and downstream consumers (e.g. GameHeaderCard's time-string parsing) blow up.
function normalizeIncomingGame<T extends { start?: string }>(payload: T): T {
  if (!payload || !payload.start) return payload;
  try {
    return {
      ...payload,
      date: formatJerusalemDate(payload.start),
      time: formatJerusalemTime(payload.start),
    };
  } catch (e) {
    console.error("[GameLiveSection] Failed to format incoming game date/time", e);
    return payload;
  }
}

// Owns the "live" slice of a game's state (header counts, join/leave button, pending requests)
// so that approving/rejecting a request, joining, or leaving instantly reflects everywhere this
// game is open — without a full page reload. Seeded from the server-rendered game and kept in
// sync via the `game:updated` socket broadcast that every mutating game endpoint now emits.
export default function GameLiveSection({
  initialGame,
  viewerId,
  canManageSeries,
}: {
  initialGame: LiveGame;
  viewerId: string;
  canManageSeries: boolean;
}) {
  const [game, setGame] = useState<LiveGame>(initialGame);
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const handler = (updated: LiveGame) => {
      if (updated?.id === initialGame.id) {
        setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
      }
    };
    socket.on("game:updated", handler);
    return () => {
      socket.off("game:updated", handler);
    };
  }, [socket, initialGame.id]);

  const mergeAndSet = (updated?: any) => {
    if (updated) setGame((prev) => ({ ...prev, ...normalizeIncomingGame(updated) }));
  };

  const joined = !!viewerId && (game.participants || []).some((p) => p.id === viewerId);
  const headerCount =
    (game.lotteryEnabled && game.lotteryPending
      ? game.totalSignups ?? game.currentPlayers
      : game.currentPlayers) || 0;

  return (
    <>
      <GameHeaderCard
        time={game.time}
        date={game.date}
        durationHours={game.duration ?? 1}
        title={game.title || game.fieldName}
        subtitle={game.title ? `${game.fieldName} • ${game.fieldLocation}` : game.fieldLocation}
        currentPlayers={headerCount}
        maxPlayers={game.maxPlayers}
        sport={game.sport}
        teamSize={game.teamSize}
        price={game.price}
      >
        {joined ? (
          <LeaveGameButton
            gameId={game.id}
            currentPlayers={game.participants?.length || 0}
            onLeft={mergeAndSet}
          />
        ) : (
          <JoinGameButton
            gameId={game.id}
            registrationOpensAt={game.registrationOpensAt}
            joinPolicy={game.joinPolicy}
            viewerParticipationStatus={game.viewerParticipationStatus}
            onJoined={mergeAndSet}
            onRequestSent={mergeAndSet}
          />
        )}
      </GameHeaderCard>

      {canManageSeries && game.joinPolicy === "REQUIRES_APPROVAL" && (
        <Box mt={2}>
          <PendingJoinRequests gameId={game.id} onDecision={mergeAndSet} />
        </Box>
      )}
    </>
  );
}
