import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useRouter } from './useRouter.adapter';
import { usersApi, chatsApi } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { useWindowDimensions } from 'react-native';

export type FriendStatus = 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE' | 'SELF' | 'LOADING';

interface UseUserActionsProps {
    targetUserId: string;
    targetUserName?: string;
    targetUserImage?: string | null;
}

export function useUserActions({ targetUserId, targetUserName, targetUserImage }: UseUserActionsProps) {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();
    const { openChat } = useChat();
    const { width } = useWindowDimensions();
    const isMobile = width < 640;

    const [status, setStatus] = useState<FriendStatus>('LOADING');
    const [requestId, setRequestId] = useState<string | null>(null);
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

            const [friends, outgoing, incoming] = await Promise.all([
                usersApi.getFriends(user.id, token),
                usersApi.getOutgoingRequests(user.id, token),
                usersApi.getIncomingRequests(user.id, token)
            ]);

            if (friends.some((f: any) => f.id === targetUserId)) {
                setStatus('FRIEND');
                return;
            }

            const outReq = outgoing.find((r: any) => r.receiver.id === targetUserId);
            if (outReq) {
                setStatus('REQUEST_SENT');
                setRequestId(outReq.id);
                return;
            }

            const inReq = incoming.find((r: any) => r.requester.id === targetUserId);
            if (inReq) {
                setStatus('REQUEST_RECEIVED');
                setRequestId(inReq.id);
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
            await checkStatus();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const removeFriend = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.removeFriend(user.id, targetUserId, token);
            await checkStatus();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptRequest = async () => {
        if (!requestId) return;
        setLoading(true);
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.acceptFriendRequest(requestId, token);
            await checkStatus();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelRequest = async () => {
        // Backend doesn't seem to support cancelling sent requests for requester via API easily?
        // Assuming decline works or just a "Coming Soon" alert if not implemented
        // For now, let's use decline if we have requestId, but decline check verifies receiver.
        // Effectively we can't cancel.
        console.warn("Cancel request not fully implemented on backend for requester");
        // Try decline? it will fail 404/403 probably.
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
        friendStatus: status,
        isPending: loading || actionLoading,
        handleAddFriend: addFriend,
        handleRemoveFriend: removeFriend,
        handleAcceptRequest,
        handleCancelRequest,
        handleSendMessage: handleMessage,
        isLoaded
    };
}
