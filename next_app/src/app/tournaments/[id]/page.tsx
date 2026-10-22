import TournamentPage from "@/components/tournaments/shell/TournamentPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <TournamentPage id={id} />;
}
