"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";

export default function TournamentError({ reset }: { error: Error; reset: () => void }) {
    return (
        <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="tournament-error">
            <Alert severity="error" action={<Button color="inherit" size="small" onClick={reset}>נסו שוב</Button>}>
                משהו השתבש בטעינת הטורניר.
            </Alert>
        </Container>
    );
}
