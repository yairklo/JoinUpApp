import FieldsBrowser from "@/components/FieldsBrowser";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import type { FieldListItem } from "@/services/api/fields";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
const PAGE_SIZE = 24;

async function fetchFirstPage(): Promise<{ items: FieldListItem[]; total: number; hasMore: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/fields?take=${PAGE_SIZE}&skip=0`, { cache: "no-store" });
    if (!res.ok) return { items: [], total: 0, hasMore: false };
    return res.json();
  } catch {
    return { items: [], total: 0, hasMore: false };
  }
}

export default async function FieldsPage() {
  const { items, total, hasMore } = await fetchFirstPage();

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, sm: 3 } }}>
      <Box mb={{ xs: 3, md: 4 }}>
        <Typography variant="h4" component="h1" fontWeight={800} gutterBottom sx={{ fontSize: { xs: "1.5rem", md: "2.125rem" } }}>
          מגרשים
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ fontSize: { xs: "0.9rem", md: "1rem" } }}>
          מצאו את המגרש הקרוב אליכם – לוחות זמנים, שעות עומס ומשחקים פתוחים
        </Typography>
      </Box>

      <FieldsBrowser initialItems={items} initialTotal={total} initialHasMore={hasMore} />
    </Container>
  );
}
