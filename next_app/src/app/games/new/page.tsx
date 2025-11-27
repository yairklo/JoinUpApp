"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";

function NewGamePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const fieldId = params?.get("fieldId") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { getToken, isSignedIn } = useAuth();

  const [form, setForm] = useState({
    fieldId,
    fieldName: "",
    fieldLocation: "",
    fieldType: "open",
    date: "",
    time: "",
    duration: 1,
    maxPlayers: 10,
    description: "",
  });

  // Helpers to block past dates/times
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;
  const nowHH = String(today.getHours()).padStart(2, "0");
  const nowMM = String(today.getMinutes()).padStart(2, "0");
  const nowTimeStr = `${nowHH}:${nowMM}`;

  // Round to next quarter hour for today's minimum selectable time
  function roundUpToNextQuarter(d: Date) {
    const t = new Date(d.getTime());
    t.setSeconds(0, 0);
    const minutes = t.getMinutes();
    const add = (15 - (minutes % 15)) % 15;
    if (add > 0) t.setMinutes(minutes + add);
    const h = String(t.getHours()).padStart(2, "0");
    const m = String(t.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  const nextQuarterTimeStr = roundUpToNextQuarter(today);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

  useEffect(() => {
    if (!fieldId) return;
    // Pre-fill from field data if available
    fetch(`${API_BASE}/api/fields/${fieldId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => {
        if (f) {
          setForm((prev) => ({
            ...prev,
            fieldId: f.id,
            fieldName: f.name,
            fieldLocation: f.location,
            fieldType: f.type,
          }));
        }
      })
      .catch(() => {});
  }, [fieldId]);

  // Ensure time defaults correctly when selecting today's date
  useEffect(() => {
    if (form.date === todayStr) {
      const t = nextQuarterTimeStr;
      if (!form.time || form.time < t) {
        setForm((prev) => ({ ...prev, time: t }));
      }
    }
  }, [form.date]);

  const canSubmit = useMemo(() => {
    return Boolean(
      isSignedIn && form.fieldId && form.date && form.time && form.maxPlayers
    );
  }, [isSignedIn, form]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");
      const res = await fetch(`${API_BASE}/api/games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          isOpenToJoin: true,
          // price will be derived on the server based on fieldType
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create game");
      }
      const created = await res.json();
      setSuccess("Game created");
      // redirect to list filtered by this field
      router.push(`/games?fieldId=${created.fieldId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold mb-1">New Game</h1>
      {form.fieldName && (
        <div className="text-sm text-gray-600 mb-4">
          {form.fieldName} • {form.fieldLocation}
        </div>
      )}

      {error && (
        <div className="mb-3 text-red-700 bg-red-50 border border-red-200 p-2 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-3 text-green-700 bg-green-50 border border-green-200 p-2 text-sm">
          {success}
        </div>
      )}

      <SignedOut>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 p-3 text-sm rounded mb-3">
          כדי ליצור משחק צריך להתחבר.{" "}
          <SignInButton mode="modal">Sign in</SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <form
          onSubmit={onSubmit}
          className="space-y-3 bg-white border rounded p-4 shadow"
        >
          {/* Field details are fixed and loaded by fieldId; no need to edit them here */}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
                min={todayStr}
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Start time</label>
              <input
                type="time"
                step={900}
                list="quarterHours"
                value={form.time}
                onChange={(e) => update("time", e.target.value)}
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
                min={form.date === todayStr ? nextQuarterTimeStr : undefined}
              />
              <datalist id="quarterHours">
                {Array.from({ length: 24 * 4 }).map((_, idx) => {
                  const h = String(Math.floor(idx / 4)).padStart(2, "0");
                  const m = String((idx % 4) * 15).padStart(2, "0");
                  return <option key={idx} value={`${h}:${m}`} />;
                })}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium">
                Duration (hours)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={form.duration}
                onChange={(e) => update("duration", Number(e.target.value))}
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium">Max players</label>
              <input
                type="number"
                min={2}
                max={30}
                value={form.maxPlayers}
                onChange={(e) => update("maxPlayers", Number(e.target.value))}
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              className="mt-1 w-full border rounded px-3 py-2 text-sm"
              rows={3}
            />
          </div>

          <div className="pt-2">
            <button
              disabled={!canSubmit || submitting}
              className="rounded bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {submitting ? "Creating..." : "+ Create Game"}
            </button>
          </div>
        </form>
      </SignedIn>
    </main>
  );
}

export default function NewGamePage() {
  return (
    <Suspense fallback={<main className="mx-auto max-w-xl p-6">Loading...</main>}>
      <NewGamePageInner />
    </Suspense>
  );
}
