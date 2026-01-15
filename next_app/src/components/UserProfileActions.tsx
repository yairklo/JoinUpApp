"use client";
import { useState, useEffect } from "react";
import { useUser, useAuth } from "@clerk/nextjs";

import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import PersonRemoveIcon from "@mui/icons-material/PersonRemove";
import CheckIcon from "@mui/icons-material/Check";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import ChatIcon from "@mui/icons-material/Chat";
import CloseIcon from "@mui/icons-material/Close";
import Chat from "./Chat";
import { getPrivateChatRoomId } from "@/utils/chatUtils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

export default function UserProfileActions({ targetUserId }: { targetUserId: string }) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();

    const [status, setStatus] = useState<'FRIEND' | 'REQUESTED' | 'NONE' | 'SELF' | 'LOADING'>('LOADING');
    const [loading, setLoading] = useState(false);
    const [chatOpen, setChatOpen] = useState(false);

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

            // Check incoming requests (optional, maybe we can accept here? for now treat as NONE or special)
            // If they sent us a request, we technically aren't friends yet.

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

    if (status === 'SELF' || !isLoaded) return null;
    if (status === 'LOADING') return <CircularProgress size={20} />;

    return (
        <>
            <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
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
                    <Button
                        variant="text"
                        color="success"
                        startIcon={<CheckIcon />}
                        disabled
                    >
                        Request Sent
                    </Button>
                ) : (
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
                    startIcon={<ChatIcon />}
                    onClick={() => setChatOpen(true)}
                >
                    Message
                </Button>
            </Box>

            <Dialog
                open={chatOpen}
                onClose={() => setChatOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: { height: '80vh', maxHeight: 800 }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    Chat
                    <IconButton onClick={() => setChatOpen(false)} size="small">
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ p: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ flex: 1, display: 'flex' }}>
                        {user && (
                            <Chat
                                roomId={getPrivateChatRoomId(user.id, targetUserId)}
                            />
                        )}
                    </Box>
                </DialogContent>
            </Dialog>
        </>
    );
}
