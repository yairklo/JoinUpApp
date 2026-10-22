import TournamentMatchScreen from "@/components/tournaments/TournamentMatchScreen";

export default async function TournamentMatchPage(props: {
    params: Promise<{ id: string; matchId: string }>;
}) {
    const { id, matchId } = await props.params;
    return <TournamentMatchScreen tournamentId={id} matchId={matchId} />;
}
