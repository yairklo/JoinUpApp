import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import Container from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import FieldsCarousel from "@/components/FieldsCarousel";
import GameHeaderCard from "@/components/GameHeaderCard";

type Game = {
  id: string;
  date: string;
  time: string;
  duration?: number;
  fieldName: string;
  fieldLocation: string;
};
type Field = { id: string; name: string; location: string };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchMyActiveGames(userId: string): Promise<Game[]> {
  // reuse search endpoint per field for simplicity – in real impl create dedicated endpoint
  // here assume client-side join list is embedded in game and filtered on page
  try {
    const res = await fetch(`${API_BASE}/api/games`, { cache: "no-store" });
    if (!res.ok) return [];
    const all: any[] = await res.json();
    const now = new Date();
    return all
      .filter((g) => (g.participants || []).some((p: any) => p.id === userId))
      .filter((g) => {
        const start = new Date(`${g.date}T${g.time}:00`);
        const end = new Date(start.getTime() + (g.duration || 1) * 3600000);
        return end >= now;
      });
  } catch (e) {
    return [];
  }
}

async function fetchFavorites(userId: string): Promise<Field[]> {
  try {
    const res = await fetch(`${API_BASE}/api/users/${userId}/favorites`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    return [];
  }
}

async function fetchCityFields(city?: string): Promise<Field[]> {
  try {
    const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
    if (!res.ok) return [];
    const arr: any[] = await res.json();
    return city
      ? arr.filter((f) => (f.city || "").toLowerCase() === city.toLowerCase())
      : arr;
  } catch (e) {
    return [];
  }
}

async function fetchTodayCityGames(city?: string): Promise<Game[]> {
  try {
    const qs = city ? `?city=${encodeURIComponent(city)}` : "";
    const res = await fetch(`${API_BASE}/api/games/today-city${qs}`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch (e) {
    return [];
  }
}

export default async function Home() {
  const user = await currentUser();
  const userId = user?.id || "";
  const myGames = userId ? await fetchMyActiveGames(userId) : [];
  const favorites = userId ? await fetchFavorites(userId) : [];
  const userCity = user?.publicMetadata?.city as string | undefined;
  const nearbyFields = await fetchCityFields(userCity);
  const todayCityGames = await fetchTodayCityGames(userCity);

  return (
    <main>
      <Container>
        <div className="py-6 md:py-8">
          <PageHeader
            title={`Welcome${user?.firstName ? `, ${user.firstName}` : ""}`}
            description="Your active games, favorites, and nearby action at a glance."
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            {userId && (
              <section>
                <h2 className="text-2xl font-semibold mb-3">My active games</h2>
                {myGames.length === 0 ? (
                  <Card className="text-center">
                    <CardHeader>
                      <div className="mx-auto mb-2 h-12 w-12 rounded-full border-2 border-dashed border-[rgb(var(--border))] flex items-center justify-center">
                        🎮
                      </div>
                      <p className="text-sm text-muted-foreground">
                        You have no active games. Join one to see it here.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button asChild>
                        <Link href="/games">Browse games</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {myGames.map((g) => (
                      <Card
                        key={g.id}
                        className="transition hover:-translate-y-[1px] hover:shadow-md"
                      >
                        <CardHeader>
                          <div className="font-semibold tracking-tight text-lg">
                            {g.fieldName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {g.fieldLocation}
                          </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between">
                          <div className="text-sm">
                            {g.date} • {g.time}
                            {g.duration
                              ? `–${formatEndTime(g.date, g.time, g.duration)}`
                              : ""}
                          </div>
                          <Button asChild>
                            <Link href={`/games/${g.id}`}>Open</Link>
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Nearby section as two cards */}
            <section>
              <h2 className="text-2xl font-semibold mb-3">Nearby</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <div className="font-medium">Fields in your city</div>
                  </CardHeader>
                  <CardContent>
                    {nearbyFields.length === 0 ? (
                      <div className="text-sm text-[rgb(var(--fg)/0.7)]">
                        No fields found.
                      </div>
                    ) : (
                      <FieldsCarousel fields={nearbyFields.slice(0, 8)} />
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="font-medium">
                      Today’s games in your city
                    </div>
                  </CardHeader>
                  <CardContent>
                    {todayCityGames.length === 0 ? (
                      <div className="text-sm text-[rgb(var(--fg)/0.7)]">
                        No games today.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {todayCityGames.slice(0, 6).map((g) => (
                          <GameHeaderCard
                            key={g.id}
                            time={g.time}
                            durationHours={g.duration ?? 1}
                            title={`${g.fieldName} • ${g.fieldLocation}`}
                            currentPlayers={(g as any).currentPlayers ?? 0}
                            maxPlayers={(g as any).maxPlayers ?? 0}
                          >
                            <Link href={`/games/${g.id}`} className="btn btn-secondary btn-sm">
                              Details
                            </Link>
                          </GameHeaderCard>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {userId && (
              <section>
                <h2 className="text-2xl font-semibold mb-3">Favorite fields</h2>
                {favorites.length === 0 ? (
                  <Card className="text-center">
                    <CardHeader>
                      <div className="mx-auto mb-2 h-12 w-12 rounded-full border-2 border-dashed border-[rgb(var(--border))] flex items-center justify-center">
                        ⭐
                      </div>
                      <p className="text-sm text-muted-foreground">
                        No favorites yet. Mark fields as favorites to see them
                        here.
                      </p>
                    </CardHeader>
                    <CardContent>
                      <Button asChild variant="secondary">
                        <Link href="/fields">Browse fields</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <FieldsCarousel fields={favorites as any} />
                )}
              </section>
            )}
          </div>
        </div>
      </Container>
    </main>
  );
}

function formatEndTime(
  date: string,
  startTime: string,
  durationHours: number
): string {
  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const hh = String(end.getHours()).padStart(2, "0");
  const mm = String(end.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
