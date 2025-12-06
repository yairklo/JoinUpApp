"use client";
import { useEffect, useMemo, useState } from "react";
import GamesDateNav from "@/components/GamesDateNav";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import Link from "next/link";
import { useUser, useAuth } from "@clerk/nextjs";

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

export default function GamesByDateClient({
  initialDate,
  fieldId,
}: {
  initialDate: string;
  fieldId?: string;
}) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(false);
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id || "";

  const groups = useMemo(() => {
    return games.reduce<Record<string, Game[]>>((acc, g) => {
      (acc[g.date] ||= []).push(g);
      return acc;
    }, {});
  }, [games]);

  useEffect(() => {
    let ignore = false;
    async function run() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("date", selectedDate);
        if (fieldId) qs.set("fieldId", fieldId);
        const token = await getToken({ template: undefined }).catch(() => "");
        const isGuest = !token;
        const url = isGuest
          ? `${API_BASE}/api/games/public?${qs.toString()}`
          : `${API_BASE}/api/games/search?${qs.toString()}`;
        const res = await fetch(url, {
          cache: "no-store",
          headers: isGuest ? {} : { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch games");
        const data: Game[] = await res.json();
        // Only keep ongoing/future games
        const now = new Date();
        const filtered = data.filter((g) => {
          const start = new Date(`${g.date}T${g.time}:00`);
          const end = new Date(start.getTime() + (g.duration ?? 1) * 3600000);
          return end >= now;
        });
        // Sort ascending by start
        filtered.sort(
          (a, b) =>
            new Date(`${a.date}T${a.time}:00`).getTime() -
            new Date(`${b.date}T${b.time}:00`).getTime()
        );
        if (!ignore) setGames(filtered);
      } catch {
        if (!ignore) setGames([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    run();
    return () => {
      ignore = true;
    };
  }, [selectedDate, fieldId]);

  return (
    <div>
      <div className="mb-3">
        <GamesDateNav
          selectedDate={selectedDate}
          fieldId={fieldId}
          onSelectDate={(d) => setSelectedDate(d)}
        />
      </div>

      {loading ? (
        <div className="text-muted">Loading...</div>
      ) : games.length === 0 ? (
        <div className="text-gray-600">No games found.</div>
      ) : (
        <div className="space-y-3">
          {(groups[selectedDate] || []).map((g) => {
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
                {joined ? (
                  <LeaveGameButton gameId={g.id} />
                ) : (
                  <JoinGameButton gameId={g.id} />
                )}
                <Link href={`/games/${g.id}`} className="btn btn-secondary btn-sm ms-2">
                  Details
                </Link>
              </GameHeaderCard>
            );
          })}
        </div>
      )}
    </div>
  );
}


