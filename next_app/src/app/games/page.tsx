import Link from "next/link";
import GameListClient from "../../components/GameListClient";
import Container from "@/components/ui/Container";

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
async function fetchGames(searchParams: Record<string, string | string[] | undefined>): Promise<Game[]> {
  const base = `${API_BASE}/api/games`;
  const qs = new URLSearchParams();
  if (searchParams.fieldId && typeof searchParams.fieldId === "string") {
    qs.set("fieldId", searchParams.fieldId);
  }
  const url = qs.toString() ? `${base}/search?${qs}` : base;
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
  futureOrActive.sort((a, b) => new Date(`${a.date}T${a.time}:00`).getTime() - new Date(`${b.date}T${b.time}:00`).getTime());
  return futureOrActive;
}

export default async function GamesPage(props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await props.searchParams;
  const games = await fetchGames(searchParams);
  // Selected date: default to today
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const selectedDate = (typeof searchParams.date === "string" && searchParams.date) || todayStr;
  // Group by date (YYYY-MM-DD)
  const groups = games.reduce<Record<string, Game[]>>((acc, g) => {
    (acc[g.date] ||= []).push(g);
    return acc;
  }, {});
  // Make a 7-day window starting today
  const dayKeys: string[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  return (
    <main>
      <Container>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Upcoming Games</h1>
        {typeof searchParams.fieldId === "string" && (
          <Link href={`/games/new?fieldId=${searchParams.fieldId}`} className="inline-flex items-center rounded bg-blue-600 text-white px-3 py-1 text-sm hover:bg-blue-700">
            + New Game
          </Link>
        )}
      </div>
      {typeof searchParams.fieldId === "string" && games[0] && (
        <div className="text-sm text-gray-700 mb-3">{games[0].fieldName} • {games[0].fieldLocation}</div>
      )}
      <div className="flex gap-2 mb-4 overflow-x-auto sticky top-[64px] z-30 bg-[rgb(var(--bg))]/80 backdrop-blur supports-[backdrop-filter]:bg-[rgb(var(--bg))/0.7] py-2">
        {dayKeys.map((d) => {
          const label = d === todayStr ? "Today" : d;
          const href = typeof searchParams.fieldId === "string" ? `/games?fieldId=${searchParams.fieldId}&date=${d}` : `/games?date=${d}`;
          const isActive = d === selectedDate;
          return (
            <Link key={d} href={href} className={`px-3 py-1 rounded-full text-sm border transition ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-gray-800 hover:bg-gray-50'}`}>{label}</Link>
          );
        })}
      </div>
      {games.length === 0 ? (
        <div className="text-gray-600">No games found.</div>
      ) : (
        <GameListClient games={(groups[selectedDate] || [])} />
      )}
      </Container>
    </main>
  );
}

// end

