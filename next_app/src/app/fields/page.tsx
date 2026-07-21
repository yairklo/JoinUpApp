import FieldCard from "@/components/FieldCard";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

type Field = {
  id: string;
  name: string;
  location: string;
  price: number;
  rating: number;
  image: string;
  available: boolean;
  type: "open" | "closed";
  description?: string;
  games: Array<{ id: string; date: string; time: string }>;
  favoritesCount?: number;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

async function fetchFields(): Promise<Field[]> {
  try {
    const res = await fetch(`${API_BASE}/api/fields`, { cache: "no-store" });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function FieldsPage() {
  const fields = await fetchFields();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      <Box mb={4}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom>
          מגרשים
        </Typography>
        <Typography variant="body1" color="text.secondary">
          מצאו את המגרש הקרוב אליכם – לוחות זמנים, שעות עומס ומשחקים פתוחים
        </Typography>
      </Box>

      {fields.length === 0 ? (
        <Box
          sx={{
            textAlign: "center",
            py: 8,
            borderRadius: 4,
            bgcolor: "action.hover",
          }}
        >
          <Typography variant="body1" color="text.secondary">
            לא נמצאו מגרשים כרגע. נסו שוב מאוחר יותר.
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, 1fr)",
              md: "repeat(3, 1fr)",
              lg: "repeat(4, 1fr)",
            },
            gap: 2.5,
          }}
        >
          {fields.map((f) => (
            <FieldCard key={f.id} field={f} />
          ))}
        </Box>
      )}
    </Container>
  );
}
