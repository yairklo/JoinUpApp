"use client";
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Nav from "react-bootstrap/Nav";
import NavDropdown from "react-bootstrap/NavDropdown";

export default function GamesDateNav({
  selectedDate,
  fieldId,
}: {
  selectedDate: string;
  fieldId?: string;
}) {
  const router = useRouter();

  const today = useMemo(() => new Date(), []);
  function ymd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const todayStr = ymd(today);
  const tomorrowStr = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const afterTomorrowStr = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2));

  const activeKey =
    selectedDate === todayStr
      ? "1"
      : selectedDate === tomorrowStr
      ? "2"
      : selectedDate === afterTomorrowStr
      ? "3"
      : "4";

  function goToDate(dateStr: string) {
    const base = "/games";
    const url = new URL(base, window.location.origin);
    url.searchParams.set("date", dateStr);
    if (fieldId) url.searchParams.set("fieldId", fieldId);
    router.push(url.pathname + url.search);
  }

  return (
    <Nav variant="pills" activeKey={activeKey} onSelect={(k) => {
      if (!k) return;
      if (k === "1") goToDate(todayStr);
      if (k === "2") goToDate(tomorrowStr);
      if (k === "3") goToDate(afterTomorrowStr);
    }}>
      <Nav.Item>
        <Nav.Link eventKey="1">Today</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="2" title="Tomorrow">Tomorrow</Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link eventKey="3">Day after</Nav.Link>
      </Nav.Item>
      <NavDropdown title="Pick date" id="nav-dropdown">
        <div className="px-3 py-2">
          <input
            type="date"
            className="form-control form-control-sm"
            value={selectedDate}
            min={todayStr}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v) goToDate(v);
            }}
          />
        </div>
      </NavDropdown>
    </Nav>
  );
}


