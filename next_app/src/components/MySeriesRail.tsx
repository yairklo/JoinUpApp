"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import MuiAvatar from "@mui/material/Avatar";
import GroupsIcon from "@mui/icons-material/Groups";
import AddIcon from "@mui/icons-material/Add";

type MySeries = {
    id: string;
    name: string;
    imageUrl?: string | null;
    fieldImage?: string | null;
    isSubscribed?: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
const SIZE = 64;

/** Compact "My groups" rail at the top of the home feed. Hidden when the viewer has no groups. */
export default function MySeriesRail() {
    const { getToken, isSignedIn } = useAuth();
    const [groups, setGroups] = useState<MySeries[]>([]);

    useEffect(() => {
        if (!isSignedIn) {
            setGroups([]);
            return;
        }
        let ignore = false;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const res = await fetch(`${API_BASE}/api/series/active`, {
                    cache: "no-store",
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!res.ok) return;
                const data: MySeries[] = await res.json();
                if (!ignore) setGroups(data.filter((s) => s.isSubscribed));
            } catch {
                // The full groups section below reports load errors; the rail just stays hidden.
            }
        })();
        return () => {
            ignore = true;
        };
    }, [getToken, isSignedIn]);

    if (groups.length === 0) return null;

    return (
        <Box component="section" aria-label="הקבוצות שלי">
            <Typography variant="h6" component="h2" fontWeight={700} mb={1.5}>
                הקבוצות שלי
            </Typography>
            <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1 }}>
                {groups.map((s) => (
                    <Box
                        key={s.id}
                        component={Link}
                        href={`/series/${s.id}`}
                        aria-label={s.name}
                        sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: SIZE + 16, flexShrink: 0, textDecoration: "none", color: "inherit" }}
                    >
                        <MuiAvatar src={s.imageUrl || s.fieldImage || undefined} alt="" sx={{ width: SIZE, height: SIZE, bgcolor: "action.selected", color: "primary.main" }}>
                            <GroupsIcon />
                        </MuiAvatar>
                        <Typography variant="caption" noWrap sx={{ maxWidth: "100%", mt: 0.5 }}>
                            {s.name}
                        </Typography>
                    </Box>
                ))}
                <Box
                    component={Link}
                    href="/games/new?mode=group"
                    aria-label="צור קבוצה"
                    sx={{ display: "flex", flexDirection: "column", alignItems: "center", width: SIZE + 16, flexShrink: 0, textDecoration: "none", color: "primary.main" }}
                >
                    <MuiAvatar sx={{ width: SIZE, height: SIZE, bgcolor: "transparent", color: "primary.main", border: "2px dashed", borderColor: "primary.main" }}>
                        <AddIcon />
                    </MuiAvatar>
                    <Typography variant="caption" noWrap sx={{ mt: 0.5 }}>
                        צור קבוצה
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
