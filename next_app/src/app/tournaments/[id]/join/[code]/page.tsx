import JoinContainer from "@/components/tournaments/team/JoinContainer";

export default async function Page({ params }: { params: Promise<{ id: string; code: string }> }) {
    const p = await params;
    return <JoinContainer tournamentId={p.id} code={p.code} />;
}
