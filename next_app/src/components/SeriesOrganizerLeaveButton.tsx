"use client";

import { useRouter } from "next/navigation";
import AppointAdminAndLeaveButton, { AdminCandidate } from "@/components/AppointAdminAndLeaveButton";
import { seriesApi } from "@/services/api/series";

/** Group organizer leaves by appointing another member as organizer. */
export default function SeriesOrganizerLeaveButton({
    seriesId,
    candidates,
}: {
    seriesId: string;
    candidates: AdminCandidate[];
}) {
    const router = useRouter();
    return (
        <AppointAdminAndLeaveButton
            kind="group"
            candidates={candidates}
            testId="series-organizer-leave"
            onLeave={async (successorId, token) => {
                await seriesApi.leaveAsOrganizer(seriesId, successorId, token);
                router.refresh();
            }}
        />
    );
}
