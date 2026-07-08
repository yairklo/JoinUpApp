"use client";

import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import PendingJoinRequests from "@/components/PendingJoinRequests";
import { useSocket } from "@/context/SocketContext";
import { normalizeIncomingGame } from "@/utils/timezone";

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
