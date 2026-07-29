import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "next/link";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import LiveTeamManagement from "@/components/LiveTeamManagement";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchGame(id: string, token?: string | null) {
  try {
    const res = await fetch(`${API_BASE}/api/games/${id}`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function TeamManagementPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const { getToken, userId: authUserId } = await auth();
  const token = await getToken().catch(() => null);
  const userId = authUserId || "";

  if (!userId) {
    redirect(`/sign-in?redirect_url=/games/${id}/team-management`);
  }

  const game = await fetchGame(id, token);
  if (!game) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">המשחק לא נמצא</Alert>
      </Container>
    );
  }

  const isManager =
    game.organizerId === userId ||
    (game.managers || []).some((m: { id: string }) => m.id === userId);

  if (!isManager) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="warning">למנהלים בלבד — ניהול קבוצות חי אינו זמין לשחקנים.</Alert>
        <Button component={Link} href={`/games/${id}`} sx={{ mt: 2 }} startIcon={<ArrowBackIcon />}>
          חזרה למשחק
        </Button>
      </Container>
    );
  }

  return (
    <main>
      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 3 } }}>
        <Box mb={2} display="flex" alignItems="center" gap={2}>
          <Button component={Link} href={`/games/${id}`} startIcon={<ArrowBackIcon />} size="small">
            חזרה
          </Button>
          <Typography variant="h5" fontWeight={800}>
            ניהול קבוצות חי
          </Typography>
        </Box>
        <LiveTeamManagement gameId={id} currentUserId={userId} />
      </Container>
    </main>
  );
}
