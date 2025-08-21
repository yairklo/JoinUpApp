"use client";
import { useEffect, useMemo, useState } from "react";
import { useUser, SignedIn, SignedOut, SignInButton, useAuth } from "@clerk/nextjs";
import Container from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import AddFriendButton from "@/components/AddFriendButton";

type PublicUser = {
  id: string;
  name: string | null;
  email?: string | null;
  phone?: string | null;
  imageUrl?: string | null;
  city?: string | null;
  birthYear?: number | null;
  sports?: { id: string; name: string }[];
  positions?: { id: string; name: string; sportId: string }[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function ProfilePage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const userId = user?.id;
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null; city?: string | null }>>([]);
  const [friends, setFriends] = useState<Array<{ id: string; name: string | null; imageUrl?: string | null; mutualCount?: number }>>([]);
  const [incoming, setIncoming] = useState<Array<{ id: string; requester: PublicUser; createdAt: string }>>([]);
  const [outgoing, setOutgoing] = useState<Array<{ id: string; receiver: PublicUser; createdAt: string }>>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    imageUrl: "",
    city: "",
    birthYear: "",
  });

  useEffect(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/users/${userId}`).then(r => r.json()).then(setProfile).catch(() => {});
    fetch(`${API_BASE}/api/users`).then(r => r.json()).then(setAllUsers).catch(() => {});
    fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then(setFriends).catch(() => {});
    (async () => {
      try {
        const token = await getToken({ template: undefined }).catch(() => "");
        const headers = token ? { Authorization: `Bearer ${token}` } : {} as any;
        const inc = await fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers });
        if (inc.ok) setIncoming(await inc.json());
        const out = await fetch(`${API_BASE}/api/users/${userId}/requests/outgoing`, { headers });
        if (out.ok) setOutgoing(await out.json());
      } catch {}
    })();
  }, [userId]);

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || "",
      email: profile.email || "",
      phone: profile.phone || "",
      imageUrl: profile.imageUrl || "",
      city: profile.city || "",
      birthYear: profile.birthYear ? String(profile.birthYear) : "",
    });
  }, [profile]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      const res = await fetch(`${API_BASE}/api/users/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...form, birthYear: form.birthYear ? Number(form.birthYear) : null }),
      });
      if (!res.ok) throw new Error("Save failed");
      const updated = await res.json();
      setProfile(updated);
      setEditing(false);
    } catch (e) {
      // noop minimal
    } finally {
      setSaving(false);
    }
  };

  async function requestFriend(receiverId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/users/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receiverId })
      });
      if (res.ok) {
        // refresh outgoing
        const out = await fetch(`${API_BASE}/api/users/${userId}/requests/outgoing`, { headers: { Authorization: `Bearer ${token}` } });
        if (out.ok) setOutgoing(await out.json());
      }
    } catch {}
  }

  async function acceptRequest(reqId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/users/requests/${reqId}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && userId) {
        // refresh friends & incoming
        fetch(`${API_BASE}/api/users/${userId}/friends`).then(r => r.json()).then(setFriends).catch(() => {});
        const inc = await fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers: { Authorization: `Bearer ${token}` } });
        if (inc.ok) setIncoming(await inc.json());
      }
    } catch {}
  }

  async function declineRequest(reqId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/users/requests/${reqId}/decline`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok && userId) {
        const inc = await fetch(`${API_BASE}/api/users/${userId}/requests/incoming`, { headers: { Authorization: `Bearer ${token}` } });
        if (inc.ok) setIncoming(await inc.json());
      }
    } catch {}
  }

  async function removeFriend(friendId: string) {
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      if (!token || !userId) return;
      const res = await fetch(`${API_BASE}/api/users/${userId}/friends/${friendId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        setFriends(prev => prev.filter(f => f.id !== friendId));
      }
    } catch {}
  }

  const friendIdSet = new Set(friends.map((f) => f.id));

  return (
    <main>
      <Container>
      <SignedOut>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 text-sm rounded mb-3">
          כדי לצפות בפרופיל ולהערוך אותו צריך להתחבר. <SignInButton mode="modal">Sign in</SignInButton>
        </div>
      </SignedOut>
      <SignedIn>
        {!profile ? (
          <div className="text-gray-500">Loading...</div>
        ) : (
          <div className="grid md:grid-cols-12 gap-6">
            <section className="md:col-span-9 space-y-4">
              <div className="flex items-center gap-4 py-4">
                <span className="avatar" style={{width:72, height:72}}>
                  {profile.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.imageUrl} alt={profile.name || profile.id} />
                  ) : (
                    <span className="text-xl font-semibold">{getInitials(profile.name || '')}</span>
                  )}
                </span>
                <div className="flex-1">
                  <PageHeader title={profile.name || 'Unnamed user'} description={profile.city || 'Unknown city'} />
                </div>
              </div>

              <div className="rounded-xl border border-[rgb(var(--border))] bg-white/90 p-6 shadow-sm space-y-2">
                {!editing ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="text-xl font-semibold">Profile info</h2>
                      <button className="rounded bg-blue-600 text-white px-3 py-1 text-sm" onClick={() => setEditing(true)}>Edit profile</button>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                      <div className="sm:col-span-1"><dt className="text-xs text-[rgb(var(--fg)/0.7)]">Email</dt><dd className="text-sm font-medium">{profile.email || '-'}</dd></div>
                      <div className="sm:col-span-1"><dt className="text-xs text-[rgb(var(--fg)/0.7)]">Phone</dt><dd className="text-sm font-medium">{profile.phone || '-'}</dd></div>
                      <div className="sm:col-span-1"><dt className="text-xs text-[rgb(var(--fg)/0.7)]">Birth year</dt><dd className="text-sm font-medium">{profile.birthYear || '-'}</dd></div>
                      <div className="sm:col-span-3"><dt className="text-xs text-[rgb(var(--fg)/0.7)]">Sports</dt><dd className="text-sm font-medium">{(profile.sports || []).map(s => s.name).join(', ') || '-'}</dd></div>
                      <div className="sm:col-span-3"><dt className="text-xs text-[rgb(var(--fg)/0.7)]">Positions</dt><dd className="text-sm font-medium">{(profile.positions || []).map(p => p.name).join(', ') || '-'}</dd></div>
                    </dl>
                  </>
                ) : (
                  <form className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium">Name</label>
                      <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Email</label>
                      <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Phone</label>
                      <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">City</label>
                      <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium">Birth year</label>
                      <input type="number" className="mt-1 w-full border rounded px-2 py-1 text-sm" value={form.birthYear} onChange={(e) => setForm({ ...form, birthYear: e.target.value })} />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium">Avatar URL</label>
                      <input className="mt-1 w-full border rounded px-2 py-1 text-sm" value={form.imageUrl} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} />
                    </div>
                    <div className="col-span-2 pt-2 flex gap-2">
                      <button type="button" className="rounded bg-blue-600 text-white px-3 py-1 text-sm disabled:opacity-50" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                      <button type="button" className="rounded border px-3 py-1 text-sm" onClick={() => { setEditing(false); setForm({ name: profile.name || '', email: profile.email || '', phone: profile.phone || '', imageUrl: profile.imageUrl || '', city: profile.city || '', birthYear: profile.birthYear ? String(profile.birthYear) : '' }); }}>Cancel</button>
                    </div>
                  </form>
                )}
              </div>
            </section>

            <aside className="md:col-span-3 space-y-4">
              <div>
                <div className="font-semibold mb-2 flex items-center justify-between">Friends
                  <Link href="/profile/friends" className="text-xs text-blue-600 hover:underline">Show all</Link>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {friends.slice(0, 6).map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 border rounded p-2 bg-white">
                      <Link href={`/users/${f.id}`} className="flex items-center gap-2 group">
                        <span className="inline-flex items-center justify-center rounded-full bg-gray-200 text-gray-700 overflow-hidden w-[28px] h-[28px] ring-1 ring-gray-300">
                          {f.imageUrl ? (<img src={f.imageUrl} alt={f.name || f.id} className="w-full h-full object-cover block" />) : (<span className="text-[11px] font-semibold">{getInitials(f.name || '')}</span>)}
                        </span>
                        <span className="text-sm text-gray-800 group-hover:underline">{f.name || f.id}</span>
                      </Link>
                      <div className="flex items-center gap-2">
                        {typeof f.mutualCount === 'number' && <span className="text-xs text-gray-500">{f.mutualCount} mutual</span>}
                        <button onClick={() => removeFriend(f.id)} className="text-xs border rounded px-2 py-0.5">Remove</button>
                      </div>
                    </div>
                  ))}
                  {friends.length === 0 && <div className="text-xs text-gray-500">No friends yet.</div>}
                </div>
              </div>

              <div>
                <div className="font-semibold mb-2">Friend requests</div>
                <div className="space-y-2">
                  {incoming.length === 0 && <div className="text-xs text-gray-500">No incoming requests.</div>}
                  {incoming.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 border rounded p-2 bg-white">
                      <Link href={`/users/${r.requester.id}`} className="flex items-center gap-2 group">
                        <span className="avatar-sm">
                          {r.requester.imageUrl ? (<img src={r.requester.imageUrl} alt={r.requester.name || r.requester.id} />) : (<span className="text-[10px] font-semibold">{getInitials(r.requester.name || '')}</span>)}
                        </span>
                        <span className="text-sm text-gray-800 group-hover:underline">{r.requester.name || r.requester.id}</span>
                      </Link>
                      <div className="flex items-center gap-2">
                        <button onClick={() => acceptRequest(r.id)} className="text-xs rounded bg-green-600 text-white px-2 py-0.5">Accept</button>
                        <button onClick={() => declineRequest(r.id)} className="text-xs rounded border px-2 py-0.5">Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-semibold mb-2">People</div>
                <div className="space-y-2">
                  {allUsers.filter(u => u.id !== profile.id).map((u) => {
                    const isFriend = friendIdSet.has(u.id);
                    return (
                      <div key={u.id} className="flex items-center justify-between gap-2">
                        <Link href={`/users/${u.id}`} className="flex items-center gap-2 group">
                          <span className="avatar-sm">
                            {u.imageUrl ? (<img src={u.imageUrl} alt={u.name || u.id} />) : (<span className="text-[10px] font-semibold">{getInitials(u.name || '')}</span>)}
                          </span>
                          <span className="text-sm text-gray-800 group-hover:underline">{u.name || u.id}</span>
                        </Link>
                        {isFriend ? (
                          <span className="text-xs text-green-700">Friends</span>
                        ) : (
                          <AddFriendButton receiverId={u.id} />
                        )}
                      </div>
                    );
                  })}
                  {allUsers.length <= 1 && (
                    <div className="text-xs text-gray-500">No other users yet.</div>
                  )}
                </div>
              </div>
            </aside>
          </div>
        )}
      </SignedIn>
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


