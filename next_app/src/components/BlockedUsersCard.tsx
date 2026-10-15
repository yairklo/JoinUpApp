"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Avatar from "@mui/material/Avatar";
import BlockIcon from "@mui/icons-material/Block";
import { usersApi, type BlockedUser } from "@/services/api/users";

export default function BlockedUsersCard() {
    const { getToken } = useAuth();
    const [items, setItems] = useState<BlockedUser[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            setItems(await usersApi.getBlockedUsers(token));
        } catch (e) {
            console.error("Failed to load blocked users:", e);
            setItems([]);
            setError("טעינת המשתמשים החסומים נכשלה.");
        }
    }, [getToken]);

    useEffect(() => { load(); }, [load]);

    const unblock = async (id: string) => {
        setBusyId(id);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.unblockUser(id, token);
            setItems((prev) => (prev || []).filter((b) => b.id !== id));
        } catch (e) {
            console.error("Failed to unblock:", e);
            setError("ביטול החסימה נכשל. נסו שוב.");
        } finally {
            setBusyId(null);
        }
    };

    return (
        <Card elevation={3} sx={{ borderRadius: 3, mt: 3 }}>
            <CardContent>
                <Stack direction="row" alignItems="center" spacing={1} mb={1}>
                    <BlockIcon color="primary" />
                    <Typography variant="h6" fontWeight="bold">משתמשים חסומים</Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    משתמשים שחסמתם לא יכולים לשלוח לכם הודעות או בקשות חברות, ותוכן שלהם מוסתר מכם.
                </Typography>
                {items === null ? (
                    <CircularProgress size={22} />
                ) : items.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">לא חסמתם אף משתמש.</Typography>
                ) : (
                    <Stack spacing={1.5}>
                        {items.map((b) => (
                            <Stack key={b.id} direction="row" alignItems="center" spacing={1.5}>
                                <Avatar src={b.imageUrl || undefined} sx={{ width: 36, height: 36 }}>
                                    {(b.name || "?").slice(0, 1)}
                                </Avatar>
                                <Typography
                                    component={Link}
                                    href={`/users/${b.id}`}
                                    sx={{ flex: 1, color: "inherit", textDecoration: "none" }}
                                >
                                    {b.name || "משתמש"}
                                </Typography>
                                <Button size="small" variant="outlined" disabled={busyId === b.id} onClick={() => unblock(b.id)}>
                                    בטל חסימה
                                </Button>
                            </Stack>
                        ))}
                    </Stack>
                )}
                {error && (
                    <Typography variant="caption" color="error" role="alert" display="block" mt={1}>
                        {error}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
}
