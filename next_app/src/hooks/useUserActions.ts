import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { usersApi, chatsApi } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { useMediaQuery, useTheme } from '@mui/material';

export type FriendStatus = 'FRIEND' | 'REQUESTED' | 'NONE' | 'SELF' | 'LOADING';

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

            const [friends, outgoing] = await Promise.all([
                usersApi.getFriends(user.id, token),
                usersApi.getOutgoingRequests(user.id, token)
            ]);

            if (friends.some((f: any) => f.id === targetUserId)) {
                setStatus('FRIEND');
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
            await usersApi.sendFriendRequest(targetUserId, token);
            setStatus('REQUESTED');
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const removeFriend = async () => {
        if (!user || !confirm("Are you sure you want to remove this friend?")) return;
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
        } catch (e) {
            console.error("Error starting chat:", e);
        } finally {
            setActionLoading(false);
        }
    };

    return {
        status,
        loading,
        actionLoading,
        addFriend,
        removeFriend,
        handleMessage,
        isLoaded
    };
}
