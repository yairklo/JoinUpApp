"use client";

import { useState } from "react";
import Button from "@mui/material/Button";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import CircularProgress from "@mui/material/CircularProgress";
import Stack from "@mui/material/Stack";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

type RequestStatus = "PENDING" | "REJECTED" | null;

export default function SeriesSubscribeButton({
    seriesId,
    initialSubscribed,
    viewerAccess = "FULL",
    initialRequestStatus = null,
}: {
    seriesId: string;
    initialSubscribed: boolean;
    /** REQUEST: friends-only group seen by an outsider; joining sends a request to the managers. */
    viewerAccess?: "FULL" | "REQUEST";
    initialRequestStatus?: RequestStatus;
}) {
    const { getToken, isSignedIn } = useAuth();
    const router = useRouter();
    const [isSubscribed, setIsSubscribed] = useState(initialSubscribed);
    const [requestStatus, setRequestStatus] = useState<RequestStatus>(initialRequestStatus);
    const [loading, setLoading] = useState(false);

    // DELETE both leaves the group and withdraws a pending request.
    const send = async (method: "POST" | "DELETE") => {
        if (!isSignedIn) return;
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE}/api/series/${seriesId}/subscribe`, {
                method,
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await res.json().catch(() => ({}));

            if (res.ok) {
                if (method === "DELETE") {
                    setIsSubscribed(false);
                    setRequestStatus(null);
                } else if (body.pending) {
                    setRequestStatus("PENDING");
                } else {
                    setIsSubscribed(true);
                }
                router.refresh();
            } else if (body.code === "SERIES_JOIN_DECLINED") {
                setRequestStatus("REJECTED");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (!isSignedIn) return null;

    const buttonSx = { borderRadius: 4, px: 3 };

    if (!isSubscribed && requestStatus === "REJECTED") {
        return (
            <Button variant="outlined" disabled size="large" sx={buttonSx}>
                הבקשה נדחתה
            </Button>
        );
    }

    if (!isSubscribed && requestStatus === "PENDING") {
        return (
            <Stack direction="row" spacing={1} alignItems="center">
                <Button variant="outlined" disabled size="large" startIcon={<HourglassTopIcon />} sx={buttonSx}>
                    הבקשה נשלחה
                </Button>
                <Button variant="text" color="inherit" onClick={() => send("DELETE")} disabled={loading}>
                    {loading ? <CircularProgress size={18} /> : "ביטול בקשה"}
                </Button>
            </Stack>
        );
    }

    const joinLabel = viewerAccess === "REQUEST" ? "בקשת הצטרפות" : "הצטרף לקבוצה";

    return (
        <Button
            variant={isSubscribed ? "outlined" : "contained"}
            color={isSubscribed ? "secondary" : "primary"}
            startIcon={loading ? <CircularProgress size={20} /> : isSubscribed ? <StarIcon /> : <StarBorderIcon />}
            onClick={() => send(isSubscribed ? "DELETE" : "POST")}
            disabled={loading}
            size="large"
            sx={buttonSx}
        >
            {isSubscribed ? "חבר בקבוצה" : joinLabel}
        </Button>
    );
}
