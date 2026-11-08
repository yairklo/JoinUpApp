export type AdminCandidate = { id: string; name?: string | null; status?: string | null };

/** Only confirmed people can take over a game; the server enforces the same rule. */
export function eligibleSuccessors(participants: AdminCandidate[] | undefined, leaverId?: string | null): AdminCandidate[] {
    return (participants || []).filter((p) => p.id !== leaverId && (!p.status || p.status === 'CONFIRMED'));
}
