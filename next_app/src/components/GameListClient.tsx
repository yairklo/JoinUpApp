"use client";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import JoinGameButton from "./JoinGameButton";

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
  participants?: Array<{ id: string; name?: string | null; avatar?: string | null }>;
  // lottery extras
  lotteryEnabled?: boolean;
  lotteryAt?: string | null;
  lotteryPending?: boolean;
  overbooked?: boolean;
  totalSignups?: number;
  registrationOpensAt?: string | null;
  title?: string | null;
};

export default function GameListClient({ games }: { games: Game[] }) {
  const { userId } = useAuth();
  return (
    <div className="space-y-4">
      {games.map((g) => {
        const joined = !!userId && (g.participants || []).some((p) => p.id === userId);
        const capacityLeft = Math.max(0, (g.maxPlayers || 0) - (g.currentPlayers || 0));
        return (
          <div key={g.id} className={`rounded-xl border p-4 shadow-sm transition ${joined ? "bg-emerald-50 border-emerald-200" : "bg-white border-[rgb(var(--border))]"}`}>
            <div className="flex items-center justify-between gap-4">
              {/* Left: time + capacity chip */}
              <div className="min-w-[140px]">
                <div className="text-sm font-semibold tracking-tight">{g.time}{g.duration ? `–${formatEndTime(g.date, g.time, g.duration)}` : ""}</div>
                <div className="mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-[rgb(var(--fg)/0.8)]">
                  {g.currentPlayers}/{g.maxPlayers}
                </div>
                <div className="mt-1 text-xs text-[rgb(var(--fg)/0.65)]">Spots left: {capacityLeft}</div>
                {g.lotteryEnabled && g.lotteryPending && g.overbooked ? (
                  <div className="mt-1 text-[11px] text-amber-700">
                    Waiting for lottery at {g.lotteryAt ? new Date(g.lotteryAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "—"} • Registered: {g.totalSignups ?? 0}
                  </div>
                ) : null}
              </div>

              {/* Middle: field name + address */}
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium">{g.title || g.fieldName}</div>
                <div className="truncate text-xs text-[rgb(var(--fg)/0.7)]">
                  {g.title ? `${g.fieldName} • ${g.fieldLocation}` : g.fieldLocation}
                </div>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center gap-2">
                <Link
                  href={`/games/${g.id}`}
                  aria-label={`View details for game at ${g.fieldName}`}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white shadow-sm hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-primary/60"
                >
                  View details
                </Link>
                {g.isOpenToJoin && !joined ? <JoinGameButton gameId={g.id} registrationOpensAt={g.registrationOpensAt} /> : null}
              </div>
            </div>

            {g.participants && g.participants.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {g.participants.map((p) => (
                  <Link key={p.id} href={`/users/${p.id}`} className="flex items-center gap-2 group">
                    <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[28px] h-[28px] ring-1 ring-gray-300">
                      {p.avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.avatar} alt={p.name || p.id} className="w-full h-full object-cover block" />
                      ) : (
                        <span className="text-[11px] font-semibold">
                          {getInitials(p.name || '')}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-700 group-hover:underline">{p.name || p.id}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatEndTime(date: string, startTime: string, durationHours: number): string {
  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  const hh = String(end.getHours()).padStart(2, "0");
  const mm = String(end.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


