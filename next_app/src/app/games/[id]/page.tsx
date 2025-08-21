import Chat from "@/components/Chat";
import Link from "next/link";
import Container from "@/components/ui/Container";
import LeaveGameButton from "@/components/LeaveGameButton";
import JoinGameButton from "@/components/JoinGameButton";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Game = {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  date: string;
  time: string;
  description: string;
  maxPlayers: number;
  currentPlayers: number;
  participants: Participant[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchGame(id: string): Promise<Game | null> {
  const res = await fetch(`${API_BASE}/api/games/${id}`, { cache: "no-store" });
  if (!res.ok) return null;
  return res.json();
}

export default async function GameDetails(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const game = await fetchGame(id);
  if (!game) {
    return <div className="p-6">Game not found</div>;
  }

  return (
    <main>
      <Container>
        {/* Compact header card */}
        <div className="rounded-xl border border-[rgb(var(--border))] bg-white/90 p-4 shadow-sm mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-base font-semibold">{game.fieldName}</div>
              <div className="text-xs text-[rgb(var(--fg)/0.7)]">{game.date} • {game.time} • {game.currentPlayers}/{game.maxPlayers} players</div>
            </div>
            <a
              href={`https://calendar.google.com/calendar/u/0/r/eventedit?text=${encodeURIComponent(`Game at ${game.fieldName}`)}&dates=${toGCalTime(game.date, game.time, 1)}&details=${encodeURIComponent(game.description || '')}&location=${encodeURIComponent(game.fieldLocation || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-[rgb(var(--border))] bg-white/80 px-3 py-2 text-xs font-medium text-[rgb(var(--fg))] shadow-sm transition hover:bg-[rgb(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              Add to calendar
            </a>
          </div>
        </div>

        {/* Main grid */}
        <div className="grid md:grid-cols-12 gap-6">
          <section className="md:col-span-7">
            <div className="rounded-xl border border-[rgb(var(--border))] bg-white/90 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold">Participants</h2>
                <div className="flex items-center gap-2">
                  <LeaveGameButton gameId={game.id} />
                  <JoinGameButton gameId={game.id} />
                </div>
              </div>
              {game.participants?.length ? (
                <div className="space-y-3">
                  {/* Avatar group */}
                  <div className="flex -space-x-2">
                    {game.participants.slice(0, 5).map((p) => (
                      <span key={p.id} title={p.name || p.id} className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[32px] h-[32px] ring-2 ring-white">
                        {p.avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.avatar} alt={p.name || p.id} className="w-full h-full object-cover block" />
                        ) : (
                          <span className="text-[11px] font-semibold">{getInitials(p.name || '')}</span>
                        )}
                      </span>
                    ))}
                    {game.participants.length > 5 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-700 w-[32px] h-[32px] ring-2 ring-white text-[11px] font-medium">+{game.participants.length - 5}</span>
                    )}
                  </div>

                  {/* List */}
                  <div className="divide-y">
                    {game.participants.map((p) => (
                      <Link key={p.id} href={`/users/${p.id}`} className="flex items-center justify-between py-2 group">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[28px] h-[28px] ring-1 ring-gray-300">
                            {p.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.avatar} alt={p.name || p.id} className="w-full h-full object-cover block" />
                            ) : (
                              <span className="text-[11px] font-semibold">{getInitials(p.name || '')}</span>
                            )}
                          </span>
                          <span className="text-sm text-gray-800 group-hover:underline">{p.name || p.id}</span>
                        </div>
                        <span className="text-xs text-[rgb(var(--fg)/0.6)]">Player</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">No participants yet.</div>
              )}
            </div>
          </section>

          <aside className="md:col-span-5">
            <div className="rounded-xl border border-[rgb(var(--border))] bg-white/90 p-4 shadow-sm">
              <Chat roomId={game.id} />
            </div>
          </aside>
        </div>
      </Container>
    </main>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

