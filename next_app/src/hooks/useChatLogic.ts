import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { Socket } from "socket.io-client";
import { useUser, useAuth } from "@clerk/nextjs";
import { useMyName, useMyAvatar } from "@/hooks/useMyAvatar";
import { useChat } from "@/context/ChatContext";
import { chatsApi, usersApi } from "@/services/api";
import { ChatMessage, Reaction, MessageStatus } from "@/components/types";
import { useSocket } from "@/context/SocketContext";
import { SEND_TIMEOUT_MS, markFailed, markPending, discardFailed, applyStatusUpdate } from "@joinup/shared/chatSend";

export interface UseChatLogicProps {
    roomId: string;
    chatName?: string;
}

export function useChatLogic({ roomId, chatName }: UseChatLogicProps) {
    const { user } = useUser();
    const myName = useMyName();
    const myAvatar = useMyAvatar();
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const { messagesCache, loadMessages } = useChat();

    const [isLoading, setIsLoading] = useState(true);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
    const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
    const [chatDetails, setChatDetails] = useState<any>(null);

    const [replyToMessage, setReplyToMessage] = useState<ChatMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
    const [showScrollButton, setShowScrollButton] = useState(false);
    const [unreadNewMessages, setUnreadNewMessages] = useState(0);
    const { socket: socketInstance, isConnected } = useSocket();

    const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
    const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isUserAtBottomRef = useRef(true);
    const prevMessagesLengthRef = useRef(0);
    const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    const sendTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    // 1. Fetch Chat Details
    useEffect(() => {
        if (!roomId || roomId === 'global') return;
        // Wait for Clerk to finish loading before requesting a token. Firing this on the very
        // first mount (e.g. the embedded game-chat panel, which mounts as part of the initial
        // page paint) can race Clerk's client-side bootstrap: getToken() resolves to nothing,
        // the request never retries since `roomId` doesn't change again, and the panel is left
        // permanently blank until a manual re-navigation. Re-running once `isLoaded` flips to
        // true fixes that without affecting the floating popup, which only mounts after the
        // user opens it (by which time Clerk is already loaded).
        if (!isLoaded || !isSignedIn) return;
        const fetchDetails = async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const data = await chatsApi.getDetails(roomId, token);
                setChatDetails(data);
            } catch (e) {
                console.error("Failed to fetch chat details", e);
            }
        };
        fetchDetails();
        // getToken intentionally omitted: not referentially stable across renders, and
        // isLoaded/isSignedIn already capture the states we need to react to.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, isLoaded, isSignedIn]);

    // 2. Load Messages
    useEffect(() => {
        if (!roomId) return;
        if (messagesCache[roomId]) {
            setMessages(messagesCache[roomId]);
            setIsLoading(false);
            prevMessagesLengthRef.current = messagesCache[roomId].length;
            return;
        }

        // Same race as above: don't attempt the authenticated history fetch until Clerk is
        // ready. isLoading stays true (spinner shown) until this effect re-fires with
        // isLoaded === true, instead of resolving once against a missing/invalid token and
        // permanently settling on an empty message list.
        if (!isLoaded || !isSignedIn) return;

        const initMessages = async () => {
            if (messagesCache[roomId]) return;
            setIsLoading(true);
            try {
                const msgs = await loadMessages(roomId);
                setMessages(msgs);
                prevMessagesLengthRef.current = msgs.length;
            } catch (e) {
                console.error("Failed to load messages", e);
            } finally {
                setIsLoading(false);
            }
        };
        initMessages();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId, isLoaded, isSignedIn]);

    // Helper Props for UI
    const isPrivate = chatDetails?.type?.toUpperCase() === 'PRIVATE';
    const otherParticipant = isPrivate ? chatDetails?.participants?.find((p: any) => p.userId !== user?.id) : null;
    const otherUserId = otherParticipant?.userId;
    const otherUserAvatar = otherParticipant?.user?.imageUrl;
    const effectiveChatName = chatName || (isPrivate ? otherParticipant?.user?.name : "Game Chat") || (roomId === "global" ? "Global Chat" : "Chat");

    // 3. Socket Logic
    useEffect(() => {
        if (!socketInstance || !isConnected || !roomId || !user?.id) return;

        // Emit initial setup
        socketInstance.emit("joinRoom", roomId);
        socketInstance.emit("markAsRead", { roomId, userId: user.id });

        // Event Handlers
        const handlePresenceUpdate = ({ userId: uid, isOnline }: any) => {
            if (uid === otherUserId) setIsOtherUserOnline(isOnline);
        };

        const handleTypingStart = ({ chatId, userName, senderId }: any) => {
            if (String(chatId) !== String(roomId)) return;
            if (String(senderId) === String(user?.id)) return;
            const name = userName || "Someone";
            if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
            setTypingUsers(prev => { const next = new Set(prev); next.add(name); return next; });
            typingTimeoutsRef.current[senderId] = setTimeout(() => {
                setTypingUsers(prev => { const next = new Set(prev); next.delete(name); return next; });
            }, 3000);
        };

        const handleTypingStop = ({ chatId, userName, senderId }: any) => {
            if (String(chatId) !== String(roomId)) return;
            if (String(senderId) === String(user?.id)) return;
            const name = userName || "Someone";
            if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
            setTypingUsers(prev => { const next = new Set(prev); next.delete(name); return next; });
        };

        const handleMessage = (incomingMsg: ChatMessage) => {
            if (incomingMsg.roomId && String(incomingMsg.roomId) !== String(roomId)) return;
            if (incomingMsg.tempId) clearSendTimer(incomingMsg.tempId);

            setMessages(prev => {
                const matchIndex = prev.findIndex(m => {
                    const idMatch = String(m.id) === String(incomingMsg.id);
                    const tempMatch = incomingMsg.tempId && (String(m.id) == String(incomingMsg.tempId));
                    return idMatch || tempMatch;
                });
                if (matchIndex > -1) {
                    const existingMsg = prev[matchIndex];
                    const safeReply = existingMsg.replyTo || incomingMsg.replyTo;
                    const newMessages = [...prev];
                    newMessages[matchIndex] = { ...incomingMsg, status: incomingMsg.status || 'sent', sender: existingMsg.sender || incomingMsg.sender, replyTo: safeReply };
                    return newMessages;
                } else {
                    return [...prev, incomingMsg];
                }
            });
            if (incomingMsg.userId !== user?.id) socketInstance.emit("markAsRead", { roomId, userId: user?.id });
        };

        const handleMessageUpdated = (payload: any) => {
            if (!payload.roomId || payload.roomId === roomId) {
                setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, text: payload.text, isEdited: payload.isEdited } : m));
            }
        };

        const handleMessageDeleted = (payload: any) => {
            if (payload.roomId && String(payload.roomId) !== String(roomId)) return;
            setMessages(prev => prev.map(msg => String(msg.id) === String(payload.id) ? { ...msg, isDeleted: true, text: "[Content Removed]", status: 'rejected' } : msg));
        };

        const handleMessageReaction = (payload: any) => {
            if (!payload.roomId || payload.roomId === roomId) {
                setMessages((prev) => prev.map(m => (String(m.id) === String(payload.messageId)) ? { ...m, reactions: payload.reactions } : m));
            }
        };

        // Server could not accept the message (not a moderation block - that arrives as status 'blocked').
        const handleMessageFailed = (payload: { tempId?: string | number; roomId?: string; retryable?: boolean }) => {
            if (payload.roomId && String(payload.roomId) !== String(roomId)) return;
            if (payload.tempId === undefined || payload.tempId === null) return;
            clearSendTimer(payload.tempId);
            setMessages(prev => markFailed(prev, payload.tempId as string | number, payload.retryable !== false));
        };

        const handleMessageStatusUpdate = (payload: any) => {
            if (payload.roomId === roomId) {
                setMessages(prev => applyStatusUpdate(prev, user?.id, payload.status));
            }
        };

        socketInstance.on('presence:update', handlePresenceUpdate);
        socketInstance.on('typing:start', handleTypingStart);
        socketInstance.on('typing:stop', handleTypingStop);
        socketInstance.on("message", handleMessage);
        socketInstance.on("messageUpdated", handleMessageUpdated);
        socketInstance.on("messageDeleted", handleMessageDeleted);
        socketInstance.on("messageReaction", handleMessageReaction);
        socketInstance.on("messageStatusUpdate", handleMessageStatusUpdate);
        socketInstance.on("messageFailed", handleMessageFailed);

        return () => {
            socketInstance.off('presence:update', handlePresenceUpdate);
            socketInstance.off('typing:start', handleTypingStart);
            socketInstance.off('typing:stop', handleTypingStop);
            socketInstance.off("message", handleMessage);
            socketInstance.off("messageUpdated", handleMessageUpdated);
            socketInstance.off("messageDeleted", handleMessageDeleted);
            socketInstance.off("messageReaction", handleMessageReaction);
            socketInstance.off("messageStatusUpdate", handleMessageStatusUpdate);
            socketInstance.off("messageFailed", handleMessageFailed);
        };
    }, [socketInstance, isConnected, roomId, user?.id, otherUserId]);

    // 4. Hydrate Users
    useEffect(() => {
        const missing = Array.from(new Set(messages.map((m) => m.userId).filter((id): id is string => !!id))).filter(id => !(id in avatarByUserId));
        if (missing.length === 0) return;
        
        const hydrateUsers = async () => {
            const token = await getToken();
            missing.forEach(async (uid) => {
                try {
                    const u = await usersApi.getProfile(uid, token || undefined);
                    setAvatarByUserId((prev) => ({ ...prev, [uid]: u?.imageUrl || null }));
                    if (u?.name) setNameByUserId((prev) => ({ ...prev, [uid]: String(u.name) }));
                } catch {
                    setAvatarByUserId((prev) => ({ ...prev, [uid]: null }));
                }
            });
        };
        hydrateUsers();
    }, [messages, avatarByUserId, getToken]);



    // A confirmed message (or a failure) clears the timer; no response at all => mark failed so the
    // user can retry instead of staring at a single "sending" tick forever. If the server did store
    // it, the late echo (matched by tempId) replaces the failed state, and a retry is de-duplicated
    // server-side (which re-sends the stored echo).
    function clearSendTimer(id: string | number) {
        const k = String(id);
        if (sendTimersRef.current[k]) { clearTimeout(sendTimersRef.current[k]); delete sendTimersRef.current[k]; }
    }
    useEffect(() => () => { Object.values(sendTimersRef.current).forEach(clearTimeout); }, []);

    // Kept in sync synchronously so a fast double tap on "retry" can't send twice (state is async).
    const messagesRef = useRef<ChatMessage[]>([]);
    messagesRef.current = messages;

    const emitMessage = (msg: ChatMessage) => {
        if (!socketInstance || !socketInstance.connected) {
            setMessages(prev => markFailed(prev, msg.id));
            return;
        }
        clearSendTimer(msg.id);
        sendTimersRef.current[String(msg.id)] = setTimeout(() => {
            delete sendTimersRef.current[String(msg.id)];
            setMessages(prev => markFailed(prev, msg.id));
        }, SEND_TIMEOUT_MS);
        socketInstance.emit("message", { text: msg.text, roomId, userId: user?.id, replyTo: msg.replyTo, status: "sent", tempId: msg.id });
    };

    const handleRetryMessage = (id: string | number) => {
        const msg = messagesRef.current.find(m => String(m.id) === String(id));
        if (!msg || msg.status !== 'failed' || msg.retryable === false) return;
        const next = markPending(messagesRef.current, id);
        messagesRef.current = next;
        setMessages(next);
        emitMessage(msg);
    };

    const handleDiscardMessage = (id: string | number) => {
        clearSendTimer(id);
        setMessages(prev => discardFailed(prev, id));
    };

    // Actions
    const handleSendMessage = () => {
        const trimmed = inputValue.trim();
        if (!trimmed || !socketInstance) return;

        if (editingMessage) {
            socketInstance.emit("editMessage", { messageId: editingMessage.id, text: trimmed, roomId });
            setEditingMessage(null);
        } else {
            const optimisticId = Date.now();
            const optimisticMessage: ChatMessage & { content: string } = {
                id: optimisticId, text: trimmed, content: trimmed, roomId,
                userId: user?.id || "anon", senderId: user?.id || "anon", senderName: myName || "Me",
                ts: new Date().toISOString(), status: "pending",
                sender: { id: user?.id, name: myName || undefined, image: myAvatar || undefined },
                replyTo: replyToMessage ? {
                    id: replyToMessage.id, text: replyToMessage.text,
                    senderName: replyToMessage.sender?.name || replyToMessage.senderName || "User"
                } : undefined
            };
            setMessages((prev) => [...prev, optimisticMessage]);

            emitMessage(optimisticMessage);
        }
        setInputValue("");
        setReplyToMessage(null);
        socketInstance.emit("typing", { isTyping: false, roomId, userName: myName || undefined });
    };

    const handleTyping = () => {
        socketInstance?.emit("typing", { isTyping: true, roomId, userName: myName || undefined });
    };

    const handleStopTyping = () => {
        socketInstance?.emit("typing", { isTyping: false, roomId, userName: myName || undefined });
    };

    return {
        state: {
            messages, isLoading, inputValue, typingUsers, isOtherUserOnline,
            chatDetails, replyToMessage, editingMessage,
            showScrollButton, unreadNewMessages,
            effectiveChatName, otherUserAvatar, isPrivate, otherUserId,
            avatarByUserId, nameByUserId
        },
        refs: { messagesEndRef, scrollContainerRef, isUserAtBottomRef, prevMessagesLengthRef },
        actions: {
            setInputValue, setReplyToMessage, setEditingMessage,
            setShowScrollButton, setUnreadNewMessages,
            handleSendMessage, handleRetryMessage, handleDiscardMessage, handleTyping, handleStopTyping,
            handleDelete: (id: string | number) => socketInstance?.emit("deleteMessage", { messageId: id, roomId }),
            handleReact: (id: string | number, emoji: string) => socketInstance?.emit("addReaction", { messageId: id, emoji, userId: user?.id, roomId }),
        }
    };
}
