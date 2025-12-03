import Link from "next/link";
import Container from "@/components/ui/Container";
import { currentUser } from "@clerk/nextjs/server";
import MyJoinedGames from "@/components/MyJoinedGames";
import GamesByDateClient from "@/components/GamesByDateClient";

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
  const initialDate =
    (typeof searchParams.date === "string" && searchParams.date) || todayStr;

  return (
    <main>
      <Container>
        <div className="d-flex align-items-center justify-content-between mb-3">
          <h1 className="h4 m-0">Active Games</h1>
        </div>

        {/* Your joined games (regardless of date) */}
        <MyJoinedGames />

        {/* Big green create-new button */}
        <div className="mb-4">
          <Link
            href={
              typeof searchParams.fieldId === "string"
                ? `/games/new?fieldId=${searchParams.fieldId}`
                : "/games/new"
            }
            className="btn btn-success btn-lg w-100"
          >
            + Create New Game
          </Link>
        </div>

        {/* Date-filtered games list (client-only; no full-page navigation) */}
        {typeof searchParams.fieldId === "string" && games[0] && (
          <div className="mb-3">
            <div className="h5 m-0">{games[0].fieldName}</div>
            <div className="text-muted">{games[0].fieldLocation}</div>
          </div>
        )}
        <GamesByDateClient
          initialDate={initialDate}
          fieldId={typeof searchParams.fieldId === "string" ? searchParams.fieldId : undefined}
        />
      </Container>
    </main>
  );
}

// end
