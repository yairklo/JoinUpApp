import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { formatJerusalemDate, formatJerusalemTime } from "@/utils/timezone";
import { SPORT_MAPPING } from "@/utils/sports";
import FieldBusyChart from "@/components/FieldBusyChart";
import FieldScheduleTrack from "@/components/FieldScheduleTrack";
import CrowdReportWidget from "@/components/CrowdReportWidget";

// MUI Imports
import Container from "@mui/material/Container";
import Card from "@mui/material/Card";
import CardMedia from "@mui/material/CardMedia";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";

type Field = {
  id: string;
  name: string;
  location?: string | null;
  description?: string | null;
  price?: number;
  rating?: number;
  image?: string | null;
  type?: "open" | "closed";
  supportedSports?: string[];
  city?: string | null;
  neighborhood?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  phone?: string | null;
  favoritesCount?: number;
};

type BusyCell = { avg: number | null; samples: number };

type FieldAnalytics = {
  schedule: Array<{
    id: string;
    title?: string | null;
    start: string;
    duration: number;
    sport: string;
    maxPlayers: number;
    price?: number | null;
    confirmedCount: number;
    date?: string;
    time?: string;
  }>;
  busyProfile: BusyCell[][];
  totalReports: number;
  reportWindowDays: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchField(id: string): Promise<Field | null> {
  try {
    const res = await fetch(`${API_BASE}/api/fields/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchAnalytics(id: string, token?: string | null): Promise<FieldAnalytics | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/fields/${id}/analytics`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data: FieldAnalytics = await res.json();
    // Pre-format schedule dates/times server-side (Jerusalem local, matching the app convention)
    data.schedule = (data.schedule || []).map((g) => ({
      ...g,
      date: formatJerusalemDate(g.start),
      time: formatJerusalemTime(g.start),
    }));
    return data;
  } catch {
    return null;
  }
}

function buildAddress(field: Field): string {
  const streetPart = [field.street, field.streetNumber].filter(Boolean).join(" ");
  return [streetPart, field.neighborhood, field.city].filter(Boolean).join(", ") || field.location || "";
}

export default async function FieldProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { getToken, userId } = await auth();
  const token = await getToken().catch(() => null);

  const [field, analytics] = await Promise.all([fetchField(id), fetchAnalytics(id, token)]);

  if (!field) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">המגרש לא נמצא</Alert>
      </Container>
    );
  }

  const address = buildAddress(field);
  const imgSrc = field.image && field.image.trim().length > 0 ? field.image : "/images/default-field.jpg";
  const sports = field.supportedSports || [];

  return (
    <main dir="rtl">
      <Container maxWidth="md" sx={{ py: 4 }}>
        {/* Field Header & Info */}
        <Card sx={{ mb: 3, overflow: "hidden" }}>
          <CardMedia component="img" image={imgSrc} alt={field.name} sx={{ height: 220, objectFit: "cover" }} />
          <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={1}>
              <Box>
                <Typography variant="h4" fontWeight={800}>{field.name}</Typography>
                {address && (
                  <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                    {address}
                  </Typography>
                )}
              </Box>
              <Chip
                label={field.type === "closed" ? "מגרש סגור (מקורה)" : "מגרש פתוח"}
                color={field.type === "closed" ? "secondary" : "success"}
                variant="outlined"
              />
            </Stack>

            {sports.length > 0 && (
              <Stack direction="row" spacing={1} sx={{ mt: 2 }} flexWrap="wrap">
                {sports.map((s) => (
                  <Chip key={s} label={SPORT_MAPPING[s] || s} size="small" color="primary" />
                ))}
              </Stack>
            )}

            {field.description && (
              <>
                <Divider sx={{ my: 2 }} />
                <Typography variant="body2" color="text.secondary">{field.description}</Typography>
              </>
            )}

            <Stack direction="row" spacing={3} sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary">
                {!field.price || field.price <= 0 ? "חינם" : `₪${field.price} לשעה`}
              </Typography>
              {typeof field.favoritesCount === "number" && field.favoritesCount > 0 && (
                <Typography variant="body2" color="text.secondary">
                  ♥ {field.favoritesCount} מועדפים
                </Typography>
              )}
            </Stack>
          </Box>
        </Card>

        {!userId && (
          <Alert severity="info" sx={{ mb: 3 }}>
            יש להתחבר כדי לצפות בלוח המשחקים ובנתוני העומס של המגרש.
          </Alert>
        )}

        {analytics && (
          <>
            {/* JoinUp Roster Schedule */}
            <Card sx={{ mb: 3, p: 3 }}>
              <Typography variant="h6" fontWeight={700} sx={{ mb: 2 }}>
                משחקים קרובים במגרש (שבוע קדימה)
              </Typography>
              <FieldScheduleTrack schedule={analytics.schedule} />
            </Card>

            {/* Visual Busy Times Chart */}
            <Card sx={{ mb: 3, p: 3 }}>
              <Typography variant="h6" fontWeight={700}>שעות עומס במגרש</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
                מבוסס על {analytics.totalReports} דיווחי שחקנים ב-{analytics.reportWindowDays} הימים האחרונים
              </Typography>
              <FieldBusyChart busyProfile={analytics.busyProfile} />
            </Card>
          </>
        )}

        {/* Crowdsource Feedback Widget (sticky) */}
        {userId && <CrowdReportWidget fieldId={field.id} />}

        <Box sx={{ mt: 2 }}>
          <Link href="/fields" style={{ textDecoration: "none" }}>
            <Typography variant="body2" color="primary">→ חזרה לכל המגרשים</Typography>
          </Link>
        </Box>
      </Container>
    </main>
  );
}
