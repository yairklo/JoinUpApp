import Link from "next/link";
import Container from "@/components/ui/Container";
import GameHeaderCard from "@/components/GameHeaderCard";
import JoinGameButton from "@/components/JoinGameButton";
import LeaveGameButton from "@/components/LeaveGameButton";
import { currentUser } from "@clerk/nextjs/server";
import GamesDateNav from "@/components/GamesDateNav";

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
  description: string;
  isOpenToJoin: boolean;
  participants?: Array<{ id: string; name?: string | null }>;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
async function fetchGames(
  searchParams: Record<string, string | string[] | undefined>
): Promise<Game[]> {
  const base = `${API_BASE}/api/games`;
  const qs = new URLSearchParams();
  if (searchParams.fieldId && typeof searchParams.fieldId === "string") {
    qs.set("fieldId", searchParams.fieldId);
  }
  const url = qs.toString() ? `${base}/search?${qs}` : base;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const data: Game[] = await res.json();
    // Filter to show only future or ongoing games
    const now = new Date();
    const futureOrActive = data.filter((g) => {
      const [hour, minute] = g.time.split(":").map(Number);
      const start = new Date(`${g.date}T${g.time}:00`);
      const durationHours = g.duration ?? 1;
      const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
      return end >= now; // keep ongoing (end in future) or future
    });
    // Sort by start time ascending
    futureOrActive.sort(
      (a, b) =>
        new Date(`${a.date}T${a.time}:00`).getTime() -
        new Date(`${b.date}T${b.time}:00`).getTime()
    );
    return futureOrActive;
  } catch (e) {
    return [];
  }
  // old code moved into try block
}

export default async function GamesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  const games = await fetchGames(searchParams);
  const user = await currentUser();
  const userId = user?.id || "";
  // Selected date: default to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const selectedDate =
    (typeof searchParams.date === "string" && searchParams.date) || todayStr;
  // Group by date (YYYY-MM-DD)
  const groups = games.reduce<Record<string, Game[]>>((acc, g) => {
    (acc[g.date] ||= []).push(g);
    return acc;
  }, {});
  // Make a 7-day window starting today
  const dayKeys: string[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + i
    );
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  return (
    <main>
      <Container>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h1 className="h4 m-0">Upcoming Games</h1>
          {typeof searchParams.fieldId === "string" && (
            <Link href={`/games/new?fieldId=${searchParams.fieldId}`} className="btn btn-primary btn-sm">
              + New Game
            </Link>
          )}
        </div>
        {typeof searchParams.fieldId === "string" && games[0] && (
          <div className="mb-3">
            <div className="h5 m-0">{games[0].fieldName}</div>
            <div className="text-muted">{games[0].fieldLocation}</div>
          </div>
        )}

        <div className="mb-3">
          <GamesDateNav selectedDate={selectedDate} fieldId={typeof searchParams.fieldId === "string" ? searchParams.fieldId : undefined} />
        </div>
        {games.length === 0 ? (
          <div className="text-gray-600">No games found.</div>
        ) : (
          <div className="space-y-3">
            {(groups[selectedDate] || []).map((g) => {
              const joined =
                !!userId && (g.participants || []).some((p) => p.id === userId);
              const showTitle =
                !(typeof searchParams.fieldId === "string" && searchParams.fieldId);
              const title = showTitle ? `${g.fieldName} • ${g.fieldLocation}` : "";
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
      </Container>
    </main>
  );
}

// end
