import TournamentWizardContainer from "@/components/tournaments/wizard/TournamentWizardContainer";

export default async function EditTournamentPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <TournamentWizardContainer tournamentId={id} />;
}
