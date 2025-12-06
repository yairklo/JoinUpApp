"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import dynamic from "next/dynamic";
import Form from "react-bootstrap/Form";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type FieldOption = { id: string; name: string; location?: string | null };

export default function NewGameInline({ fieldId, onCreated }: { fieldId?: string; onCreated?: (fieldId: string) => void }) {
  const { getToken, isSignedIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    fieldId: fieldId || "",
    date: "",
    time: "",
    duration: 1,
    maxPlayers: 10,
    description: "",
    lotteryEnabled: false,
    organizerInLottery: false,
    lotteryDate: "",
    lotteryTime: "",
  });
  const [fields, setFields] = useState<FieldOption[]>([]);
  const [query, setQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [newFieldMode, setNewFieldMode] = useState(false);
  const [newField, setNewField] = useState<{ name: string; location: string; type: "open" | "closed" }>({
    name: "",
    location: "",
    type: "open",
  });
  const [showMap, setShowMap] = useState(false);
  const MapWithNoSSR = useMemo(
    () => dynamic(() => import("./MapComponent"), { ssr: false, loading: () => <div className="text-muted">Loading map…</div> }),
    []
  );

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayStr = `${yyyy}-${mm}-${dd}`;

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
  const nextQuarterTimeStr = useMemo(() => roundUpToNextQuarter(today), []);

  // Load fields for suggestions (always)
  useEffect(() => {
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

  // If fieldId provided, prefill the query display to allow editing
  useEffect(() => {
    if (!fieldId) return;
    const found = fields.find((f) => f.id === fieldId);
    if (found) {
      setQuery(`${found.name}${found.location ? ` • ${found.location}` : ""}`);
      return;
    }
    let ignore = false;
    async function run() {
      try {
        const res = await fetch(`${API_BASE}/api/fields/${fieldId}`, { cache: "no-store" });
        if (!res.ok) return;
        const f = await res.json();
        if (!ignore) setQuery(`${f.name}${f.location ? ` • ${f.location}` : ""}`);
      } catch {}
    }
    run();
    return () => { ignore = true; };
  }, [fieldId, fields]);

  useEffect(() => {
    // Ensure time defaults correctly when selecting today's date
    if (form.date === todayStr) {
      const t = nextQuarterTimeStr;
      if (!form.time || form.time < t) {
        setForm((prev) => ({ ...prev, time: t }));
      }
    }
  }, [form.date, nextQuarterTimeStr, todayStr]);

  const canSubmit = useMemo(() => {
    const hasExistingField = !!form.fieldId;
    const hasNewField = newFieldMode && newField.name.trim() && newField.location.trim() && newField.type;
    return Boolean(isSignedIn && (hasExistingField || hasNewField) && form.date && form.time && form.maxPlayers);
  }, [isSignedIn, form, newFieldMode, newField]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const token = await getToken({ template: undefined }).catch(() => "");

      // Validate lottery datetime if enabled
      if (form.lotteryEnabled) {
        if (!form.lotteryDate || !form.lotteryTime) {
          throw new Error("Please select lottery date and time");
        }
        const startTs = new Date(`${form.date}T${form.time}:00`).getTime();
        const lotteryTs = new Date(`${form.lotteryDate}T${form.lotteryTime}:00`).getTime();
        if (!Number.isFinite(startTs) || !Number.isFinite(lotteryTs)) {
          throw new Error("Invalid date/time");
        }
        if (lotteryTs >= startTs) {
          throw new Error("Lottery time must be before game start");
        }
      }
      const res = await fetch(`${API_BASE}/api/games`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          ...form,
          ...(newFieldMode && !form.fieldId
            ? { newField: { name: newField.name.trim(), location: newField.location.trim(), type: newField.type } }
            : {}),
          isOpenToJoin: true,
          ...(form.lotteryEnabled
            ? {
                lotteryEnabled: true,
                organizerInLottery: !!form.organizerInLottery,
                lotteryAt: `${form.lotteryDate}T${form.lotteryTime}:00`,
              }
            : { lotteryEnabled: false }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create game");
      }
      const created = await res.json();
      setSuccess("Game created");
      if (onCreated) onCreated(created.fieldId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function updateNewField<K extends keyof typeof newField>(key: K, value: (typeof newField)[K]) {
    setNewField((prev) => ({ ...prev, [key]: value }));
  }

  const normalized = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu, "");

  type FieldPrefixIndex = {
    prefixToIds: Map<string, string[]>;
    idToField: Map<string, FieldOption>;
  };

  function buildPrefixIndex(list: FieldOption[]): FieldPrefixIndex {
    const prefixToIds = new Map<string, string[]>();
    const idToField = new Map<string, FieldOption>();
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

  return (
    <div>
      <SignedOut>
        <div className="alert alert-warning py-2 px-3 mb-2">
          You must sign in to create a game.{" "}
          <SignInButton mode="modal">
            <Button variant="link" className="p-0 align-baseline">Sign in</Button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        {error ? <div className="alert alert-danger py-2 px-3 mb-2">{error}</div> : null}
        {success ? <div className="alert alert-success py-2 px-3 mb-2">{success}</div> : null}

        <Form onSubmit={onSubmit}>
          <div className="row g-2">
              <div className="col-12 position-relative">
                <div className="d-flex align-items-center justify-content-between">
                  <Form.Label className="small mb-0">Field</Form.Label>
                  <Button variant="outline-secondary" size="sm" onClick={() => setShowMap(true)}>Map</Button>
                </div>
                {!newFieldMode ? (
                  <div>
                    <Form.Control
                      type="text"
                      size="sm"
                      placeholder="Search or type a field name…"
                      value={query}
                      onFocus={() => setShowSuggest(true)}
                      onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
                      onChange={(e) => {
                        const v = e.currentTarget.value;
                        setQuery(v);
                        // clear selected field if user edits
                        if (form.fieldId) update("fieldId", "");
                      }}
                    />
                    {showSuggest && (
                      <div className="border rounded mt-1 bg-white shadow-sm" style={{ maxHeight: 220, overflowY: "auto" }}>
                        {suggestions.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className="dropdown-item text-start w-100"
                            onMouseDown={() => {
                              update("fieldId", f.id);
                              setQuery(`${f.name}${f.location ? ` • ${f.location}` : ""}`);
                              setShowSuggest(false);
                            }}
                          >
                            {f.name}{f.location ? ` • ${f.location}` : ""}
                          </button>
                        ))}
                        <div className="dropdown-divider" />
                        <button
                          type="button"
                          className="dropdown-item text-start w-100 text-primary"
                          onMouseDown={() => {
                            setNewFieldMode(true);
                            update("fieldId", "");
                            setShowSuggest(false);
                            updateNewField("name", query.trim());
                          }}
                        >
                          Create new field: “{query.trim() || "…" }”
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="border rounded p-2">
                    <div className="row g-2">
                      <div className="col-6">
                        <Form.Label className="small mb-0">Name</Form.Label>
                        <Form.Control
                          size="sm"
                          value={newField.name}
                          onChange={(e) => updateNewField("name", e.currentTarget.value)}
                        />
                      </div>
                      <div className="col-6">
                        <Form.Label className="small mb-0">Location</Form.Label>
                        <Form.Control
                          size="sm"
                          value={newField.location}
                          onChange={(e) => updateNewField("location", e.currentTarget.value)}
                        />
                      </div>
                      <div className="col-12">
                        <Form.Label className="small mb-0">Type</Form.Label>
                        <div className="d-flex gap-2">
                          <Form.Check
                            inline
                            type="radio"
                            id="type-open"
                            label="Open (outdoor)"
                            checked={newField.type === "open"}
                            onChange={() => updateNewField("type", "open")}
                          />
                          <Form.Check
                            inline
                            type="radio"
                            id="type-closed"
                            label="Closed (indoor)"
                            checked={newField.type === "closed"}
                            onChange={() => updateNewField("type", "closed")}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="d-flex justify-content-end gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="light"
                        type="button"
                        onClick={() => {
                          setNewFieldMode(false);
                          setNewField({ name: "", location: "", type: "open" });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            <div className="col-6">
              <Form.Label className="small">Date</Form.Label>
              <Form.Control
                type="date"
                value={form.date}
                min={todayStr}
                onChange={(e) => update("date", e.currentTarget.value)}
                size="sm"
              />
            </div>
            <div className="col-6">
              <Form.Label className="small">Start time</Form.Label>
              <Form.Control
                type="time"
                step={900}
                value={form.time}
                min={form.date === todayStr ? nextQuarterTimeStr : undefined}
                onChange={(e) => update("time", e.currentTarget.value)}
                size="sm"
              />
            </div>
            <div className="col-6">
              <Form.Label className="small">Duration (hours)</Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={6}
                value={form.duration}
                onChange={(e) => update("duration", Number(e.currentTarget.value))}
                size="sm"
              />
            </div>
            <div className="col-6">
              <Form.Label className="small">Max players</Form.Label>
              <Form.Control
                type="number"
                min={2}
                max={30}
                value={form.maxPlayers}
                onChange={(e) => update("maxPlayers", Number(e.currentTarget.value))}
                size="sm"
              />
            </div>
            <div className="col-12">
              <Form.Label className="small">Description</Form.Label>
              <Form.Control
                as="textarea"
                rows={2}
                value={form.description}
                onChange={(e) => update("description", e.currentTarget.value)}
                size="sm"
              />
            </div>
          </div>

          {/* Lottery settings */}
          <div className="row g-2 mt-1 border rounded p-2">
            <div className="col-12">
              <Form.Check
                type="checkbox"
                id="lottery-enabled"
                label="Enable lottery (allow overbooking until lottery time)"
                checked={form.lotteryEnabled}
                onChange={(e) => update("lotteryEnabled", e.currentTarget.checked as any)}
              />
            </div>
            {form.lotteryEnabled ? (
              <>
                <div className="col-6">
                  <Form.Label className="small">Lottery date</Form.Label>
                  <Form.Control
                    type="date"
                    size="sm"
                    min={todayStr}
                    value={form.lotteryDate}
                    onChange={(e) => update("lotteryDate", e.currentTarget.value as any)}
                  />
                </div>
                <div className="col-6">
                  <Form.Label className="small">Lottery time</Form.Label>
                  <Form.Control
                    type="time"
                    size="sm"
                    step={900}
                    value={form.lotteryTime}
                    onChange={(e) => update("lotteryTime", e.currentTarget.value as any)}
                  />
                </div>
                <div className="col-12">
                  <Form.Check
                    type="checkbox"
                    id="organizer-in-lottery"
                    label="Include organizer in lottery (not auto-confirmed)"
                    checked={form.organizerInLottery}
                    onChange={(e) => update("organizerInLottery", e.currentTarget.checked as any)}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="pt-2 d-flex justify-content-end">
            <Button type="submit" size="sm" variant="primary" disabled={!canSubmit || submitting}>
              {submitting ? "Creating..." : "Create Game"}
            </Button>
          </div>
        </Form>

        <Modal show={showMap} onHide={() => setShowMap(false)} size="lg" centered>
          <Modal.Header closeButton>
            <Modal.Title>Fields map</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <MapWithNoSSR />
          </Modal.Body>
        </Modal>
      </SignedIn>
    </div>
  );
}


