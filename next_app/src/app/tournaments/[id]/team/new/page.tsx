import TeamCreateContainer from "@/components/tournaments/team/TeamCreateContainer";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const p = await params;
    return <TeamCreateContainer tournamentId={p.id} />;
}
