import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from './useRouter.adapter';
import { usersApi, chatsApi } from '@/services/api';
import { useChat } from '@/context/ChatContext';
import { Alert, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getErrorCode, mapFriendRequestError } from '@/utils/apiError';
import { useAuthTokenRef } from './useAuthTokenRef';

export type FriendStatus = 'FRIEND' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE' | 'SELF' | 'LOADING';

interface UseUserActionsProps {
    targetUserId: string;
    targetUserName?: string;
    targetUserImage?: string | null;
}

export function useUserActions({ targetUserId, targetUserName, targetUserImage }: UseUserActionsProps) {
    const { user, isLoaded } = useUser();
    const getTokenRef = useAuthTokenRef();
    const viewerId = user?.id ?? null;
    const router = useRouter();
    const { openChat } = useChat();
    const { t } = useTranslation();
    const { width } = useWindowDimensions();
    const isMobile = width < 640;

    const [status, setStatus] = useState<FriendStatus>('LOADING');
    const [requestId, setRequestId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const checkStatus = useCallback(async () => {
        if (!isLoaded || !viewerId) {
            setStatus('NONE');
            return;
        }
        if (viewerId === targetUserId) {
            setStatus('SELF');
            return;
        }

        try {
            const token = await getTokenRef.current();
            if (!token) return;

            const [friends, outgoing, incoming] = await Promise.all([
                usersApi.getFriends(viewerId, token),
                usersApi.getOutgoingRequests(viewerId, token),
                usersApi.getIncomingRequests(viewerId, token)
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
    }, [viewerId, isLoaded, targetUserId]);

    useEffect(() => {
        checkStatus();
    }, [checkStatus]);

    const addFriend = async () => {
        setLoading(true);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            await usersApi.sendFriendRequest(targetUserId, token);
            await checkStatus();
        } catch (e) {
            console.error(e);
            Alert.alert(t('common.error', 'שגיאה'), mapFriendRequestError(e));
            // Only an incoming request should resync the button. A generic failure must not
            // look like "request sent" just because a pending row already exists.
            if (getErrorCode(e) === 'INCOMING_REQUEST_EXISTS') {
                await checkStatus();
            }
        } finally {
            setLoading(false);
        }
    };

    const removeFriend = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const token = await getTokenRef.current();
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
            const token = await getTokenRef.current();
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
        if (!requestId) return;
        setLoading(true);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            await usersApi.cancelFriendRequest(requestId, token);
            await checkStatus();
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
            const token = await getTokenRef.current();
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
