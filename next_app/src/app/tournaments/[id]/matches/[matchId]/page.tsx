import TournamentMatchDetail from "@/components/tournaments/TournamentMatchDetail";

export default async function TournamentMatchPage(props: {
    params: Promise<{ id: string; matchId: string }>;
}) {
    const { id, matchId } = await props.params;
    return <TournamentMatchDetail tournamentId={id} matchId={matchId} />;
}
