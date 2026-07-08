"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";

type BusyCell = { avg: number | null; samples: number };

const DAY_LABELS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const LEVEL_LABELS: Record<number, string> = {
  1: "ריק",
  2: "מעט עומס",
  3: "עומס בינוני",
  4: "עמוס",
  5: "מלא",
};

// Green -> red density scale
function levelColor(avg: number): string {
  if (avg < 2) return "#22c55e";
  if (avg < 3) return "#eab308";
  if (avg < 4) return "#f97316";
  return "#ef4444";
}

function currentJerusalemDay(): number {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(new Date());
  const idx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
  return idx >= 0 ? idx : 0;
}

function BusyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <Paper elevation={3} sx={{ p: 1.5, direction: "rtl" }}>
      <Typography variant="subtitle2" fontWeight={700}>{p.hourLabel}</Typography>
      {p.samples > 0 ? (
        <>
          <Typography variant="body2">{LEVEL_LABELS[Math.round(p.avg)] || p.avg}</Typography>
          <Typography variant="caption" color="text.secondary">{p.samples} דיווחים</Typography>
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">אין נתונים</Typography>
      )}
    </Paper>
  );
}

export default function FieldBusyChart({ busyProfile }: { busyProfile: BusyCell[][] }) {
  const [day, setDay] = useState<number>(() => currentJerusalemDay());

  const data = useMemo(() => {
    const cells = busyProfile?.[day] || [];
    return Array.from({ length: 24 }, (_, hour) => {
      const cell = cells[hour] || { avg: null, samples: 0 };
      return {
        hour,
        hourLabel: `${String(hour).padStart(2, "0")}:00`,
        avg: cell.avg,
        samples: cell.samples,
        // Bars need a numeric value; zero-height for no-data (the faint full-height
        // background column signals "hour exists but no data" instead)
        value: cell.avg ?? 0,
      };
    });
  }, [busyProfile, day]);

  const hasAnyData = data.some((d) => d.samples > 0);

  return (
    <Box>
      <ToggleButtonGroup
        value={day}
        exclusive
        onChange={(_, v) => v !== null && setDay(v)}
        size="small"
        sx={{ mb: 2, direction: "ltr" }}
      >
        {DAY_LABELS.map((label, i) => (
          <ToggleButton key={i} value={i} sx={{ px: 1.5 }}>
            {label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
        יום {DAY_NAMES[day]}
      </Typography>

      <Box sx={{ width: "100%", height: 220, direction: "ltr" }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="hour"
              ticks={[0, 3, 6, 9, 12, 15, 18, 21]}
              tickFormatter={(h) => `${h}:00`}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis domain={[0, 5]} hide />
            <Tooltip content={<BusyTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} background={{ fill: "rgba(128,128,128,0.08)" }}>
              {data.map((entry) => (
                <Cell
                  key={entry.hour}
                  fill={entry.samples > 0 && entry.avg !== null ? levelColor(entry.avg) : "transparent"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Box>

      {!hasAnyData && (
        <Typography variant="body2" color="text.secondary" align="center" sx={{ mt: 1 }}>
          אין עדיין דיווחי עומס ליום זה — היו הראשונים לדווח!
        </Typography>
      )}

      {/* Legend */}
      <Box sx={{ display: "flex", gap: 2, mt: 1.5, flexWrap: "wrap", justifyContent: "center" }}>
        {[
          { color: "#22c55e", label: "ריק" },
          { color: "#eab308", label: "מעט" },
          { color: "#f97316", label: "בינוני" },
          { color: "#ef4444", label: "עמוס" },
        ].map((item) => (
          <Box key={item.label} sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: "2px", bgcolor: item.color }} />
            <Typography variant="caption" color="text.secondary">{item.label}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
