import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { usersApi, chatsApi } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { useMediaQuery, useTheme } from '@mui/material';

export type FriendStatus = 'FRIEND' | 'REQUESTED' | 'INCOMING' | 'NONE' | 'SELF' | 'LOADING';

export function useUserActions(targetUserId: string, targetUserName?: string, targetUserImage?: string | null) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const { openChat } = useChat();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const [status, setStatus] = useState<FriendStatus>('LOADING');
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [incomingRequestId, setIncomingRequestId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const checkStatus = useCallback(async () => {
        if (!isLoaded || !user) {
            setStatus('NONE');
            return;
        }
        if (user.id === targetUserId) {
            setStatus('SELF');
            return;
        }

        try {
            const token = await getToken();
            if (!token) return;

            const [friends, outgoing, incoming] = await Promise.all([
                usersApi.getFriends(user.id, token),
                usersApi.getOutgoingRequests(user.id, token),
                usersApi.getIncomingRequests(user.id, token)
            ]);

            if (friends.some((f: any) => f.id === targetUserId)) {
                setStatus('FRIEND');
                return;
            }

            // They already asked us: offer accept/decline instead of "Add Friend" (which the
            // server rejects because a request between the pair already exists).
            const theirRequest = incoming.find((r) => r.requester.id === targetUserId);
            if (theirRequest) {
                setIncomingRequestId(theirRequest.id);
                setStatus('INCOMING');
                return;
            }

            if (outgoing.some((r: any) => r.receiver.id === targetUserId)) {
                setStatus('REQUESTED');
                return;
            }

            setStatus('NONE');
        } catch (e) {
            console.error(e);
            setStatus('NONE');
        }
    }, [user, isLoaded, targetUserId, getToken]);

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    const addFriend = async () => {
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            setError(null);
            await usersApi.sendFriendRequest(targetUserId, token);
            setStatus('REQUESTED');
        } catch (e) {
            console.error(e);
            setError("שליחת בקשת החברות נכשלה");
            // The server may know something we don't (e.g. a request already exists): resync.
            checkStatus();
        } finally {
            setLoading(false);
        }
    };

    const removeFriend = async () => {
        if (!user || !confirm("להסיר את המשתמש מרשימת החברים?")) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.removeFriend(user.id, targetUserId, token);
            setStatus('NONE');
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const respondToRequest = async (action: 'accept' | 'decline') => {
        if (!incomingRequestId) return;
        setLoading(true);
        setError(null);
        try {
            const token = await getToken();
            if (!token) return;
            if (action === 'accept') await usersApi.acceptFriendRequest(incomingRequestId, token);
            else await usersApi.declineFriendRequest(incomingRequestId, token);
            setIncomingRequestId(null);
            // Re-read from the server rather than assuming: the profile must show what was persisted.
            await checkStatus();
        } catch (e) {
            console.error(e);
            setError(action === 'accept' ? "אישור הבקשה נכשל" : "דחיית הבקשה נכשלה");
        } finally {
            setLoading(false);
        }
    };

    const handleMessage = async () => {
        if (!user) return;
        setActionLoading(true);
        try {
            const token = await getToken();
            if (!token) return;

            const { chatId } = await chatsApi.createPrivate(targetUserId, token);

            if (isMobile) {
                router.push(`/chat/${chatId}`);
            } else {
                openChat(chatId, { name: targetUserName || "User", image: targetUserImage });
            }
        } catch (e: any) {
            console.error("Error starting chat:", e);
            const status = e?.status || e?.response?.status;
            if (status === 403) {
                alert("משתמש זה מקבל הודעות מחברים בלבד");
            }
        } finally {
            setActionLoading(false);
        }
    };

    return {
        status,
        loading,
        actionLoading,
        error,
        addFriend,
        removeFriend,
        acceptRequest: () => respondToRequest('accept'),
        declineRequest: () => respondToRequest('decline'),
        handleMessage,
        isLoaded
    };
}
