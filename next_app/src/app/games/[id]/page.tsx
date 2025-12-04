import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";
import Link from "next/link";
import Container from "@/components/ui/Container";
import LeaveGameButton from "@/components/LeaveGameButton";
import JoinGameButton from "@/components/JoinGameButton";
import GameHeaderCard from "@/components/GameHeaderCard";
import { currentUser } from "@clerk/nextjs/server";
import dynamic from "next/dynamic";
import GameActions from "@/components/GameActions";

type Participant = { id: string; name: string | null; avatar?: string | null };
type Game = {
  id: string;
  fieldId: string;
  fieldName: string;
  fieldLocation: string;
  date: string;
  time: string;
  duration?: number;
  description: string;
  maxPlayers: number;
  currentPlayers: number;
  participants: Participant[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchGame(id: string): Promise<Game | null> {
  try {
    const res = await fetch(`${API_BASE}/api/games/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

export default async function GameDetails(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const game = await fetchGame(id);
  const user = await currentUser();
  const userId = user?.id || "";
  const joined = !!userId && (game?.participants || []).some((p) => p.id === userId);
  if (!game) {
    return <div className="p-6">Game not found</div>;
  }

  return (
    <main>
      <Container>
        <GameHeaderCard
          time={game.time}
          durationHours={game.duration ?? 1}
          title={game.fieldName}
          currentPlayers={game.currentPlayers}
          maxPlayers={game.maxPlayers}
        >
          {joined ? <LeaveGameButton gameId={game.id} /> : <JoinGameButton gameId={game.id} />}
        </GameHeaderCard>

        {/* Actions: Map / Navigate / Invite */}
        <GameActions
          gameId={game.id}
          fieldName={game.fieldName}
          lat={(game as any).field?.["lat"] ?? null}
          lng={(game as any).field?.["lng"] ?? null}
        />
        {typeof (game as any).field?.lat === "number" && typeof (game as any).field?.lng === "number" ? (
          <div id="game-map" className="mt-3">
            <GameLocationMap
              lat={(game as any).field.lat as number}
              lng={(game as any).field.lng as number}
              title={game.fieldName}
              height={260}
            />
          </div>
        ) : null}

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
                      <span key={p.id} title={p.name || p.id} className="ring-2 ring-white rounded-full overflow-hidden">
                        <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="sm" />
                      </span>
                    ))}
                    {game.participants.length > 5 && (
                      <span className="inline-flex items-center justify-center rounded-full bg-gray-100 text-gray-700 w-[20px] h-[20px] ring-2 ring-white text-[10px] font-medium">
                        +{game.participants.length - 5}
                      </span>
                    )}
                  </div>

                  {/* List */}
                  <div className="divide-y">
                    {game.participants.map((p) => (
                      <Link
                        key={p.id}
                        href={`/users/${p.id}`}
                        className="flex items-center justify-between py-2 group"
                      >
                        <div className="flex items-center gap-2">
                          <Avatar src={p.avatar} alt={p.name || p.id} name={p.name || p.id} size="sm" />
                          <span className="text-sm text-gray-800 group-hover:underline">
                            {p.name || p.id}
                          </span>
                        </div>
                        <span className="text-xs text-[rgb(var(--fg)/0.6)]">
                          Player
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No participants yet.
                </div>
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

// client-only map component
const GameLocationMap = dynamic(() => import("@/components/GameLocationMap"), { ssr: false });

