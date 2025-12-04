"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import dynamic from "next/dynamic";

function NewGamePageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const fieldId = params?.get("fieldId") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { getToken, isSignedIn } = useAuth();
  const [showMap, setShowMap] = useState(false);
  const MapWithNoSSR = useMemo(
    () => dynamic(() => import("@/components/MapComponent"), { ssr: false, loading: () => <div className="text-muted">Loading map…</div> }),
    []
  );
  const [fields, setFields] = useState<Array<{ id: string; name: string; location?: string | null }>>([]);
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [newFieldMode, setNewFieldMode] = useState(false);
  const [newField, setNewField] = useState<{ name: string; location: string }>({
    name: "",
    location: "",
  });
  const [customPoint, setCustomPoint] = useState<{ lat: number; lng: number } | null>(null);

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

  // Load fields when there's no fixed fieldId
  useEffect(() => {
    if (fieldId) return;
    let ignore = false;
    async function run() {
      try {
        const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
        if (!res.ok) return;
        const arr = await res.json();
        if (!ignore) setFields(arr.map((f: any) => ({ id: f.id, name: f.name, location: f.location })));
      } catch {}
    }
    run();
    return () => {
      ignore = true;
    };
  }, [fieldId]);

  const normalized = (s: string) =>
    s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, "");

  function buildPrefixIndex(list: Array<{ id: string; name: string; location?: string | null }>) {
    const prefixToIds = new Map<string, string[]>();
    const idToField = new Map<string, { id: string; name: string; location?: string | null }>();
    for (const f of list) {
      idToField.set(f.id, f);
      const text = normalized(`${f.name} ${f.location || ""}`);
      const words = text.split(/\s+/).filter(Boolean);
      for (const w of words) {
        const max = Math.min(w.length, 20);
        for (let len = 2; len <= max; len++) {
          const pref = w.slice(0, len);
          const arr = prefixToIds.get(pref);
          if (arr) {
            if (arr[arr.length - 1] !== f.id) arr.push(f.id);
          } else {
            prefixToIds.set(pref, [f.id]);
          }
        }
      }
    }
    return { prefixToIds, idToField };
  }
  function intersectIdLists(lists: string[][]): string[] {
    if (lists.length === 0) return [];
    let result = lists[0];
    for (let i = 1; i < lists.length; i++) {
      const set = new Set(lists[i]);
      result = result.filter((id) => set.has(id));
      if (result.length === 0) break;
    }
    return result;
  }
  const index = useMemo(() => buildPrefixIndex(fields), [fields]);
  const suggestions = useMemo(() => {
    const q = normalized(query).trim();
    if (!q) return fields.slice(0, 8);
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return fields.slice(0, 8);
    const lists = tokens.map((t) => index.prefixToIds.get(t) || []);
    if (lists.some((l) => l.length === 0)) return [];
    const ids = intersectIdLists(lists);
    return ids.slice(0, 8).map((id) => index.idToField.get(id)!).filter(Boolean);
  }, [fields, query, index]);

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
    const hasExistingField = !!form.fieldId;
    const hasNewFieldText = newFieldMode && (newField.name.trim() || newField.location.trim());
    const hasCustomPoint = !form.fieldId && newFieldMode ? !!customPoint : true;
    return Boolean(
      isSignedIn &&
        (hasExistingField || hasNewFieldText || (!!customPoint && newFieldMode)) &&
        hasCustomPoint &&
        form.date &&
        form.time &&
        form.maxPlayers
    );
  }, [isSignedIn, form, newFieldMode, newField, customPoint]);

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
          ...(newFieldMode && !form.fieldId && (newField.name.trim() || newField.location.trim())
            ? {
                newField: {
                  name: newField.name.trim(),
                  location: newField.location.trim(),
                },
              }
            : {}),
          ...(customPoint ? { customLat: customPoint.lat, customLng: customPoint.lng } : {}),
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
          You must sign in to create a game.{" "}
          <SignInButton mode="modal">Sign in</SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <form
          onSubmit={onSubmit}
          className="space-y-3 bg-white border rounded p-4 shadow"
        >
          {/* Field selector (typeahead) if not provided */}
          {!fieldId && (
            <div className="relative">
              <label className="block text-sm font-medium mb-1">Field:</label>
              {!newFieldMode ? (
                <div className="d-flex flex-column flex-sm-row gap-2 align-items-stretch">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => {
                      const v = e.target.value;
                      setQuery(v);
                      if (form.fieldId) setForm((prev) => ({ ...prev, fieldId: "" }));
                    }}
                    onFocus={() => setShowSuggest(true)}
                    onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                    className="form-control form-control-sm flex-grow-1"
                    placeholder="Search a field or type a new name"
                  />
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowMap(true)}>
                    Search on Map
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => {
                      setNewFieldMode(true);
                      setForm((prev) => ({ ...prev, fieldId: "" }));
                      setShowSuggest(false);
                      setNewField((prev) => ({ ...prev, name: query.trim(), location: "" }));
                    }}
                  >
                    Add new field
                  </button>
                  {showSuggest && (
                    <div
                      className="absolute z-10 mt-1 w-full border rounded bg-white shadow text-sm"
                      style={{ maxHeight: 240, overflowY: "auto" }}
                    >
                      {suggestions.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50"
                          onMouseDown={() => {
                            setForm((prev) => ({ ...prev, fieldId: f.id }));
                            setQuery(`${f.name}${f.location ? ` • ${f.location}` : ""}`);
                            setShowSuggest(false);
                          }}
                        >
                          {f.name}
                          {f.location ? ` • ${f.location}` : ""}
                        </button>
                      ))}
                      <div className="border-top my-1 px-3 py-2 text-muted">
                        To add a new field, click "Add new field"
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-1 border rounded p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Name</label>
                      <input
                        type="text"
                        value={newField.name}
                        onChange={(e) => setNewField((prev) => ({ ...prev, name: e.target.value }))}
                        className="form-control form-control-sm w-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Location</label>
                      <input
                        type="text"
                        value={newField.location}
                        onChange={(e) => setNewField((prev) => ({ ...prev, location: e.target.value }))}
                        className="form-control form-control-sm w-100"
                      />
                    </div>
                  </div>
                  <div className="mt-3 d-flex align-items-center gap-2">
                    <div className="text-xs text-gray-600 me-auto">
                    {customPoint
                      ? `Picked location: ${customPoint.lat.toFixed(5)}, ${customPoint.lng.toFixed(5)}`
                      : "Pick a location on the map (click on map)"}
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowMap(true)}>
                      Pick location on map
                    </button>
                    <button
                      type="button"
                      className="btn btn-light btn-sm"
                      onClick={() => {
                        setNewFieldMode(false);
                        setNewField({ name: "", location: "" });
                      setCustomPoint(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

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
              className="btn btn-success"
            >
              {submitting ? "Creating..." : "Create Game"}
            </button>
          </div>
        </form>

        {showMap ? (
          <div className="mt-4">
            <MapWithNoSSR
              onSelect={(f: { id: string; name: string; location?: string | null }) => {
                setForm((prev) => ({
                  ...prev,
                  fieldId: f.id,
                  fieldName: f.name,
                  fieldLocation: f.location || "",
                }));
                setQuery(`${f.name}${f.location ? ` • ${f.location}` : ""}`);
                setShowSuggest(false);
                setShowMap(false);
              }}
              pickMode={newFieldMode && !form.fieldId}
              picked={customPoint}
              onPick={(pt: { lat: number; lng: number }) => {
                setCustomPoint(pt);
              }}
            />
            <div className="mt-2 d-flex justify-content-end">
              <button type="button" className="btn btn-light btn-sm" onClick={() => setShowMap(false)}>
                Close
              </button>
            </div>
          </div>
        ) : null}
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
