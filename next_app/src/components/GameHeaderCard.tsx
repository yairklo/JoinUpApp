"use client";
import Card from "react-bootstrap/Card";

export default function GameHeaderCard({
  time,
  title,
  currentPlayers,
  maxPlayers,
  durationHours,
  children,
}: {
  time: string;
  title: string;
  currentPlayers: number;
  maxPlayers: number;
  durationHours?: number;
  children?: React.ReactNode;
}) {
  function formatEndTime(startTime: string, hours: number | undefined): string {
    const dur = typeof hours === "number" && Number.isFinite(hours) ? hours : 1;
    const [h, m] = startTime.split(":").map((n) => parseInt(n, 10));
    const base = new Date(1970, 0, 1, isNaN(h) ? 0 : h, isNaN(m) ? 0 : m, 0, 0);
    base.setHours(base.getHours() + dur);
    const hh = String(base.getHours()).padStart(2, "0");
    const mm = String(base.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  const end = formatEndTime(time, durationHours);

  return (
    <Card className="mb-4">
      <Card.Header as="h5" className="d-flex justify-content-between align-items-center">
        <span>
          {time} – {end}
        </span>
        <span className="text-muted small">
          {currentPlayers}/{maxPlayers}
        </span>
      </Card.Header>
      <Card.Body>
        {title ? <Card.Title>{title}</Card.Title> : null}
        <div className="d-flex gap-2">
          {children}
        </div>
      </Card.Body>
    </Card>
  );
}


