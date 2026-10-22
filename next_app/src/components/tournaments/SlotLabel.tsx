"use client";

import TeamBadge, { type TeamBadgeProps } from "./TeamBadge";
import { describeSlot, type SlotContext } from "@/utils/tournament";
import type { MatchSlot, TeamLite } from "@/types/tournament";

export interface SlotLabelProps extends Pick<TeamBadgeProps, "size" | "lines" | "hideName" | "emphasis" | "strikeThrough"> {
    /** A match side (`match.home` / `match.away`), a bracket/preview slot, or null for TBD. */
    slot: MatchSlot | { team?: TeamLite | null; source?: unknown } | null | undefined;
    /** Match-number and group-name lookups (`useTournamentSchedule` returns both) and locale. */
    context?: SlotContext;
    /** Default `slot-label`. */
    testId?: string;
}

/** A team (TeamBadge) or a placeholder such as "Winner of match 3" / "TBD" (spec 0.4). */
export default function SlotLabel({ slot, context, testId = "slot-label", ...badge }: SlotLabelProps) {
    const view = describeSlot(slot, context);
    if (view.kind === "team") return <TeamBadge team={view.team} testId={testId} {...badge} />;
    return <TeamBadge team={null} placeholder fallbackName={view.text} testId={testId} {...badge} />;
}
