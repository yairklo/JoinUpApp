"use client";
import { useEffect, useMemo, useState } from "react";
import { useAuth, SignedIn, SignedOut, SignInButton } from "@clerk/nextjs";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function NewGameInline({ fieldId, onCreated }: { fieldId: string; onCreated?: (fieldId: string) => void }) {
  const { getToken, isSignedIn } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    fieldId,
    date: "",
    time: "",
    duration: 1,
    maxPlayers: 10,
    description: "",
  });

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
    return Boolean(isSignedIn && form.fieldId && form.date && form.time && form.maxPlayers);
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

  return (
    <div>
      <SignedOut>
        <div className="alert alert-warning py-2 px-3 mb-2">
          כדי ליצור משחק צריך להתחבר.{" "}
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

          <div className="pt-2 d-flex justify-content-end">
            <Button type="submit" size="sm" variant="primary" disabled={!canSubmit || submitting}>
              {submitting ? "Creating..." : "+ Create Game"}
            </Button>
          </div>
        </Form>
      </SignedIn>
    </div>
  );
}


