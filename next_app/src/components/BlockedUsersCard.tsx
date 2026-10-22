"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuthTokenRef } from "@/hooks/useAuthTokenRef";
import Link from "next/link";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Avatar from "@mui/material/Avatar";
import { alpha } from "@mui/material/styles";
import BlockIcon from "@mui/icons-material/Block";
import { usersApi, type BlockedUser } from "@/services/api/users";

export default function BlockedUsersCard() {
    const getTokenRef = useAuthTokenRef();
    const [items, setItems] = useState<BlockedUser[] | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);

    const load = useCallback(async () => {
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            setItems(await usersApi.getBlockedUsers(token));
        } catch (e) {
            console.error("Failed to load blocked users:", e);
            setLoadFailed(true);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const unblock = async (id: string) => {
        setBusyId(id);
        setError(null);
        try {
            const token = await getTokenRef.current();
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
        <Card
            elevation={0}
            sx={(theme) => ({
                borderRadius: 2.5,
                mt: 2.5,
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "background.paper",
                boxShadow: theme.shadows[1],
            })}
        >
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
                <Stack direction="row" alignItems="center" spacing={1.5} mb={1}>
                    <Box
                        sx={(theme) => ({
                            width: 36,
                            height: 36,
                            borderRadius: 2,
                            display: "grid",
                            placeItems: "center",
                            bgcolor: alpha(theme.palette.primary.main, 0.12),
                            color: "primary.main",
                            flexShrink: 0,
                        })}
                    >
                        <BlockIcon fontSize="small" />
                    </Box>
                    <Typography variant="h6" fontWeight={800}>
                        משתמשים חסומים
                    </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" mb={2.5} sx={{ lineHeight: 1.6 }}>
                    משתמשים שחסמתם לא יכולים לשלוח לכם הודעות או בקשות חברות, ותוכן שלהם מוסתר מכם.
                </Typography>
                {loadFailed ? (
                    <Stack
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        spacing={1.5}
                        sx={(theme) => ({
                            p: 1.5,
                            px: 2,
                            borderRadius: 2,
                            bgcolor: alpha(theme.palette.error.main, 0.08),
                            border: "1px solid",
                            borderColor: alpha(theme.palette.error.main, 0.25),
                        })}
                    >
                        <Typography variant="body2" color="error" fontWeight={600} role="alert">
                            טעינת המשתמשים החסומים נכשלה.
                        </Typography>
                        <Button size="small" variant="outlined" color="error" onClick={() => { setLoadFailed(false); load(); }}>
                            נסו שוב
                        </Button>
                    </Stack>
                ) : items === null ? (
                    <Box sx={{ py: 2, display: "flex", justifyContent: "center" }}>
                        <CircularProgress size={22} />
                    </Box>
                ) : items.length === 0 ? (
                    <Box
                        sx={(theme) => ({
                            p: 2,
                            borderRadius: 2,
                            border: "1px dashed",
                            borderColor: "divider",
                            bgcolor: alpha(theme.palette.text.primary, 0.015),
                            textAlign: "center",
                        })}
                    >
                        <Typography variant="body2" color="text.secondary">
                            לא חסמתם אף משתמש.
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={1.25}>
                        {items.map((b) => (
                            <Stack
                                key={b.id}
                                direction="row"
                                alignItems="center"
                                spacing={1.5}
                                sx={{
                                    p: 1.25,
                                    borderRadius: 2,
                                    border: "1px solid",
                                    borderColor: "divider",
                                }}
                            >
                                <Avatar src={b.imageUrl || undefined} sx={{ width: 36, height: 36 }}>
                                    {(b.name || "?").slice(0, 1)}
                                </Avatar>
                                <Typography
                                    component={Link}
                                    href={`/users/${b.id}`}
                                    sx={{ flex: 1, color: "inherit", textDecoration: "none", fontWeight: 600 }}
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
                    <Typography variant="caption" color="error" role="alert" display="block" mt={1.5}>
                        {error}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
}
