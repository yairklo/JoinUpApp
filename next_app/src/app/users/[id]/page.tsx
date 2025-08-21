import Link from "next/link";

type PublicUser = {
  id: string;
  name: string | null;
  imageUrl?: string | null;
  email?: string | null;
  city?: string | null;
  sports?: { id: string; name: string }[];
  positions?: { id: string; name: string; sportId: string }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchUser(id: string): Promise<PublicUser | null> {
  const res = await fetch(`${API_BASE}/api/users/${id}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export default async function UserPublicPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const u = await fetchUser(id);
  if (!u) return <div className="p-6">User not found</div>;
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[72px] h-[72px] ring-2 ring-gray-300">
          {u.imageUrl ? (<img src={u.imageUrl!} alt={u.name || u.id} className="w-full h-full object-cover block" />) : (<span className="text-xl font-semibold">{getInitials(u.name || '')}</span>)}
        </span>
        <div>
          <h1 className="text-2xl font-bold">{u.name || u.id}</h1>
          <div className="text-sm text-gray-600">{u.city || ''}</div>
        </div>
      </div>
      <div className="bg-white border rounded p-4">
        <div className="text-sm"><span className="font-medium">Email:</span> {u.email || '-'}</div>
        <div className="text-sm"><span className="font-medium">Sports:</span> {(u.sports || []).map(s => s.name).join(', ') || '-'}</div>
        <div className="text-sm"><span className="font-medium">Positions:</span> {(u.positions || []).map(p => p.name).join(', ') || '-'}</div>
      </div>
      {/* Intentionally no back-to-profile link to avoid wrong navigation assumption */}
    </main>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}


