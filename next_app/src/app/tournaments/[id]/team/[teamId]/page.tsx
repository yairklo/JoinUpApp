import TeamPageContainer from "@/components/tournaments/team/TeamPageContainer";

export default async function Page({ params }: { params: Promise<{ id: string; teamId: string }> }) {
    const p = await params;
    return <TeamPageContainer tournamentId={p.id} teamId={p.teamId} />;
}
