import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";

export default function Loading() {
    return (
        <Container maxWidth="lg" sx={{ py: 3 }} data-testid="tournament-loading" aria-busy="true" aria-label="טוען">
            <Skeleton variant="rounded" height={260} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" height={48} sx={{ mb: 2 }} />
            <Skeleton variant="rounded" height={200} />
        </Container>
    );
}
