"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Container from "@mui/material/Container";
import Skeleton from "@mui/material/Skeleton";
import ManageConsole from "@/components/tournaments/manage/ManageConsole";
import { useTournament } from "@/hooks/tournaments";

/** Tournament manage console. Visible only to manager+ (`capabilities.canManage`); everyone else sees a plain notice. */
export default function TournamentManagePage() {
    const params = useParams<{ id: string }>();
    const id = params?.id;
    const { tournament, loading, error, notFound, updated, reload } = useTournament(id);

    if (loading && !tournament) {
        return (
            <Container maxWidth="lg" sx={{ py: 3 }} data-testid="manage-loading">
                <Skeleton variant="rounded" height={64} sx={{ mb: 2 }} />
                <Skeleton variant="rounded" height={240} />
            </Container>
        );
    }
    if (notFound || (!tournament && !error)) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="manage-not-found">
                <Alert severity="info" action={<Button component={Link} href="/tournaments" color="inherit" size="small">לטורנירים</Button>}>
                    הטורניר לא נמצא.
                </Alert>
            </Container>
        );
    }
    if (error || !tournament) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="manage-error">
                <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void reload()}>נסו שוב</Button>}>
                    לא הצלחנו לטעון את הטורניר.
                </Alert>
            </Container>
        );
    }
    if (!tournament.capabilities.canManage) {
        return (
            <Container maxWidth="sm" sx={{ py: 6 }} dir="rtl" data-testid="manage-forbidden">
                <Alert severity="info" action={<Button component={Link} href={`/tournaments/${tournament.id}`} color="inherit" size="small">לעמוד הטורניר</Button>}>
                    רק מנהלי הטורניר יכולים לנהל אותו.
                </Alert>
            </Container>
        );
    }
    return <ManageConsole tournament={tournament} updated={updated} onChanged={() => void reload()} />;
}
