"use client";
import { useState, useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import ChatIcon from "@mui/icons-material/Chat";
// Remove Chat and ChatIcon if not used elsewhere, but ChatIcon is used in button.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function UserProfileActions({ targetUserId }: { targetUserId: string }) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const [status, setStatus] = useState<'FRIEND' | 'REQUESTED' | 'NONE' | 'SELF' | 'LOADING'>('LOADING');
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (!isLoaded) return;
        if (!user) {
            setStatus('NONE');
            return;
        }
        if (user.id === targetUserId) {
            setStatus('SELF');
            return;
        }
        checkStatus();
    }, [user, isLoaded, targetUserId]);

    const checkStatus = async () => {
        try {
            const token = await getToken();
            if (!token) return;

            // Check friends
            const friendsRes = await fetch(`${API_BASE}/api/users/${user?.id}/friends`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (friendsRes.ok) {
                const friends = await friendsRes.json();
                if (friends.some((f: any) => f.id === targetUserId)) {
                    setStatus('FRIEND');
                    return;
                }
            }

            // Check outgoing requests
            const outRes = await fetch(`${API_BASE}/api/users/${user?.id}/requests/outgoing`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (outRes.ok) {
                const out = await outRes.json();
                if (out.some((r: any) => r.receiver.id === targetUserId)) {
                    setStatus('REQUESTED');
                    return;
                }
            }
            setStatus('NONE');
        } catch (e) {
            console.error(e);
            setStatus('NONE');
        }
    };

    const addFriend = async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE}/api/users/requests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ receiverId: targetUserId })
            });
            if (res.ok) {
                setStatus('REQUESTED');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const removeFriend = async () => {
        if (!confirm("Are you sure you want to remove this friend?")) return;
        setLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE}/api/users/${user?.id}/friends/${targetUserId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setStatus('NONE');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleMessage = async () => {
        if (!user) return;
        setActionLoading(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE}/api/chats/private`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ targetUserId })
            });

            if (res.ok) {
                const { chatId } = await res.json();
                router.push(`/chat/${chatId}`);
            } else {
                console.error("Failed to start chat");
            }
        } catch (e) {
            console.error("Error starting chat:", e);
        } finally {
            setActionLoading(false);
        }
    };

    if (status === 'SELF' || !isLoaded) return null;
    if (status === 'LOADING') return <CircularProgress size={20} />;

    return (
        <>
            <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
                {/* Friend Buttons ... */}
                {status === 'FRIEND' ? (
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonRemoveIcon />}
                        onClick={removeFriend}
                        disabled={loading}
                    >
                        Remove Friend
                    </Button>
                ) : status === 'REQUESTED' ? (
                    // ...
                    <Button
                        variant="text"
                        color="success"
                        startIcon={<CheckIcon />}
                        disabled
                    >
                        Request Sent
                    </Button>
                ) : (
                    // ...
                    <Button
                        variant="contained"
                        color="primary"
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <PersonAddIcon />}
                        onClick={addFriend}
                        disabled={loading}
                    >
                        Add Friend
                    </Button>
                )}

                <Button
                    variant="outlined"
                    color="primary"
                    startIcon={actionLoading ? <CircularProgress size={16} color="inherit" /> : <ChatIcon />}
                    onClick={handleMessage}
                    disabled={actionLoading}
                >
                    Message
                </Button>
            </Box>
            {/* Removed Dialog */}
        </>
    );
}