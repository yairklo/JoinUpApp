import Link from "next/link";
import Avatar from "@/components/Avatar";

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
  try {
    const res = await fetch(`${API_BASE}/api/users/${id}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch (e) {
    return null;
  }
}

export default async function UserPublicPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const u = await fetchUser(id);
  if (!u) return <div className="p-6">User not found</div>;
  return (
    <main className="mx-auto max-w-3xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Avatar src={u.imageUrl} alt={u.name || u.id} name={u.name || u.id} size="md" />
        <div>
          <h1 className="text-2xl font-bold">{u.name || u.id}</h1>
          <div className="text-sm text-gray-600">{u.city || ""}</div>
        </div>
      </div>
      <div className="bg-white border rounded p-4">
        <div className="text-sm">
          <span className="font-medium">Email:</span> {u.email || "-"}
        </div>
        <div className="text-sm">
          <span className="font-medium">Sports:</span>{" "}
          {(u.sports || []).map((s) => s.name).join(", ") || "-"}
        </div>
        <div className="text-sm">
          <span className="font-medium">Positions:</span>{" "}
          {(u.positions || []).map((p) => p.name).join(", ") || "-"}
        </div>
      </div>
      {/* Intentionally no back-to-profile link to avoid wrong navigation assumption */}
    </main>
  );
}

// initials handled by shared Avatar
