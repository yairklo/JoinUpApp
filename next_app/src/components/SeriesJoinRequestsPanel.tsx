"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Avatar from "@/components/Avatar";
import { seriesApi, type SeriesJoinRequest } from "@/services/api/series";

// Managers only: outsiders asking to join a friends-only group. Hidden when there are none.
export default function SeriesJoinRequestsPanel({ seriesId }: { seriesId: string }) {
    const { getToken } = useAuth();
    const router = useRouter();
    const [requests, setRequests] = useState<SeriesJoinRequest[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const res = await seriesApi.getJoinRequests(seriesId, token);
                if (!ignore) setRequests(res.pending || []);
            } catch {
                // Non-critical panel: leave it empty on failure.
            }
        })();
        return () => { ignore = true; };
    }, [seriesId, getToken]);

    const decide = async (userId: string, approve: boolean) => {
        setBusyId(userId);
        try {
            const token = await getToken();
            if (!token) return;
            if (approve) await seriesApi.approveJoinRequest(seriesId, userId, token);
            else await seriesApi.rejectJoinRequest(seriesId, userId, token);
            setRequests((prev) => prev.filter((r) => r.userId !== userId));
            // Approval adds a member: refresh the server-rendered members list.
            if (approve) router.refresh();
        } catch (e) {
            alert(e instanceof Error ? e.message : "הפעולה נכשלה");
        } finally {
            setBusyId(null);
        }
    };

    if (requests.length === 0) return null;

    return (
        <Box mb={2} p={2} borderRadius={2} border={1} borderColor="warning.main" bgcolor="action.hover">
            <Typography variant="subtitle2" fontWeight={800} mb={1}>
                בקשות הצטרפות ({requests.length})
            </Typography>
            <Stack spacing={1}>
                {requests.map((r) => (
                    <Box key={r.userId} display="flex" alignItems="center" gap={1.5}>
                        <Avatar src={r.avatar} name={r.name || "User"} alt={r.name || "User"} size="sm" />
                        <Typography variant="body2" fontWeight={600} flex={1} noWrap>
                            {r.name || "משתמש"}
                        </Typography>
                        <Button size="small" variant="contained" disabled={busyId === r.userId} onClick={() => decide(r.userId, true)}>
                            אשר
                        </Button>
                        <Button size="small" color="inherit" disabled={busyId === r.userId} onClick={() => decide(r.userId, false)}>
                            דחה
                        </Button>
                    </Box>
                ))}
            </Stack>
        </Box>
    );
}
