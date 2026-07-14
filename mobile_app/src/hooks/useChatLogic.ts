import { useEffect, useRef, useState, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import { SocketManager } from "@/services/socketManager";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { useChat } from "@/context/ChatContext";
import { chatsApi, usersApi, gamesApi } from "@/services/api";
import { ChatMessage } from "@/types/chat";

// NOTE: We import API_BASE from services, but socket still needs it.
// We might want to move socket logic to a service later, but for now hook is fine.

export interface UseChatLogicProps {
    roomId: string;
    chatName?: string;
}

export function useChatLogic({ roomId, chatName }: UseChatLogicProps) {
    const { user } = useUser();
    const { getToken } = useAuth();
    const { messagesCache, loadMessages, markChatAsRead, openChat, closeChat } = useChat();

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

    const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
    const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});
    const [gameChatTitle, setGameChatTitle] = useState<string | null>(null);

    const messagesEndRef = useRef<any>(null);
    const scrollContainerRef = useRef<any>(null);
    const isUserAtBottomRef = useRef(true);
    const prevMessagesLengthRef = useRef(0);
    const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});
    // Fix #5: track fetched user IDs to prevent re-fetching and cascading re-renders
    const fetchedUserIdsRef = useRef<Set<string>>(new Set());
    const otherUserIdRef = useRef<string | undefined>(undefined);

    const mergeUserCaches = useCallback((
        entries: Array<{ id?: string | null; name?: string | null; image?: string | null; imageUrl?: string | null }>
    ) => {
        const newAvatars: Record<string, string | null> = {};
        const newNames: Record<string, string> = {};
        for (const entry of entries) {
            const id = entry?.id;
            if (!id) continue;
            const name = entry.name ? String(entry.name) : null;
            const image = entry.image ?? entry.imageUrl;
            if (!name && image === undefined) continue;
            if (name || image !== undefined) fetchedUserIdsRef.current.add(id);
            if (name) newNames[id] = name;
            if (image !== undefined) newAvatars[id] = image ?? null;
        }
        if (Object.keys(newAvatars).length) {
            setAvatarByUserId(prev => {
                let changed = false;
                const next = { ...prev };
                for (const [id, image] of Object.entries(newAvatars)) {
                    if (prev[id] !== image) {
                        next[id] = image;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }
        if (Object.keys(newNames).length) {
            setNameByUserId(prev => {
                let changed = false;
                const next = { ...prev };
                for (const [id, name] of Object.entries(newNames)) {
                    if (prev[id] !== name) {
                        next[id] = name;
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }
    }, []);

    // 0. Register Active Chat globally
    // Use chatDetails.id (resolved ChatRoom UUID) when available, else raw roomId
    const effectiveRoomId = chatDetails?.id || roomId;

    useEffect(() => {
        if (!roomId || roomId === 'global') return;
        openChat(effectiveRoomId);
        return () => closeChat();
    }, [effectiveRoomId, openChat, closeChat]);

    // 1. Resolve Room ID and Fetch Details
    useEffect(() => {
        if (!roomId || roomId === 'global') return;
        const fetchDetails = async () => {
            try {
                const token = await getToken();
                if (!token) return;

                // Try to resolve game first (in case roomId is a gameId)
                let targetId = roomId;
                try {
                    // Use silent=true to avoid logging 404s if it's a private chat ID (not a game)
                    const game = await gamesApi.getGameForChat(roomId, token, true);
                    if (game) {
                        if (game.chatRoomId) targetId = game.chatRoomId;
                        const title = game.title || game.fieldName || null;
                        if (title) setGameChatTitle(String(title));

                        // Seed participant names/avatars from the game roster (no per-user API calls)
                        const roster = (game.participants || []).map((p: any) => ({
                            id: p.id || p.userId,
                            name: p.name,
                            image: p.avatar || p.imageUrl,
                        }));
                        mergeUserCaches(roster);
                    }
                } catch (e) {
                    // Not a game or failed to fetch, stick with roomId
                }

                if (!targetId || targetId === 'undefined' || targetId === 'null') {
                    return;
                }

                const data = await chatsApi.getDetails(targetId, token);
                setChatDetails(data);

                // Seed from chat room participants
                const chatPeople = (data?.participants || []).map((p: any) => ({
                    id: p.userId || p.user?.id,
                    name: p.user?.name,
                    image: p.user?.imageUrl,
                }));
                mergeUserCaches(chatPeople);
            } catch (e: any) {
                // Ignore expected 404 errors to prevent them from showing as popups in LogBox
                if (!e.message?.includes('Route not found') && !e.message?.includes('Chat not found')) {
                    console.error("Failed to fetch chat details", e);
                }
            }
        };
        fetchDetails();
    }, [roomId, mergeUserCaches]); // Removed getToken to prevent re-fetching on every re-render

    // 2. Load Messages
    useEffect(() => {
        if (!roomId) return;
        if (messagesCache[roomId]) {
            setMessages(messagesCache[roomId]);
            setIsLoading(false);
            prevMessagesLengthRef.current = messagesCache[roomId].length;
        }

        const initMessages = async () => {
            if (!messagesCache[roomId]) {
                setIsLoading(true);
            }
            try {
                const msgs = await loadMessages(roomId, true);
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
    }, [roomId]);

    // Derived before socket effect — avoid TDZ and keep presence via ref so listeners don't remount
    const isPrivate = chatDetails?.type?.toUpperCase() === 'PRIVATE';
    const otherParticipant = isPrivate
        ? chatDetails?.participants?.find((p: any) => p.userId !== user?.id)
        : null;
    const otherUserId = otherParticipant?.userId as string | undefined;
    const otherUserAvatar = otherParticipant?.user?.imageUrl;
    otherUserIdRef.current = otherUserId;

    // 3. Socket Logic via Singleton
    useEffect(() => {
        if (!user?.id || !roomId) return;

        // Use the resolved ChatRoom UUID (effectiveRoomId) so typing/messages reach
        // the correct socket room. Falls back to raw roomId on first render (before
        // chatDetails loads), and re-runs when chatDetails resolves.
        const joinRoom = () => {
            SocketManager.ensureConnected();
            SocketManager.emit("joinRoom", effectiveRoomId);
            if (effectiveRoomId !== roomId) {
                // Also join raw route id (game id) when it differs — matches emit/filter dual-id pattern
                SocketManager.emit("joinRoom", roomId);
            }
            SocketManager.emit("markAsRead", { roomId: effectiveRoomId, userId: user?.id });
            markChatAsRead(effectiveRoomId);
            if (roomId !== effectiveRoomId) markChatAsRead(roomId);
        };

        joinRoom();

        const unsubscribeConnect = SocketManager.on("connect", joinRoom);

        const onAppStateChange = (next: AppStateStatus) => {
            // Server rooms are empty after disconnect/background — rejoin without tearing listeners down
            if (next === 'active') joinRoom();
        };
        const appSub = AppState.addEventListener('change', onAppStateChange);

        const unsubscribePresence = SocketManager.on('presence:update', ({ userId: uid, isOnline }) => {
            if (uid === otherUserIdRef.current) setIsOtherUserOnline(isOnline);
        });

        const unsubscribeTypingStart = SocketManager.on('typing:start', ({ chatId, userName, senderId }) => {
            // Allow both roomId and effectiveRoomId to prevent typing events from being ignored
            if (String(chatId) !== String(roomId) && String(chatId) !== String(effectiveRoomId)) return;
            if (String(senderId) === String(user?.id)) return;
            const name = userName || "Someone";
            if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
            setTypingUsers(prev => { const next = new Set(prev); next.add(name); return next; });
            typingTimeoutsRef.current[senderId] = setTimeout(() => {
                setTypingUsers(prev => { const next = new Set(prev); next.delete(name); return next; });
                delete typingTimeoutsRef.current[senderId];
            }, 3000);
        });

        const unsubscribeTypingStop = SocketManager.on('typing:stop', ({ chatId, userName, senderId }) => {
            if (String(chatId) !== String(roomId) && String(chatId) !== String(effectiveRoomId)) return;
            if (String(senderId) === String(user?.id)) return;
            const name = userName || "Someone";
            if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
            setTypingUsers(prev => { const next = new Set(prev); next.delete(name); return next; });
            delete typingTimeoutsRef.current[senderId];
        });

        const unsubscribeMessage = SocketManager.on("message", (incomingMsg: ChatMessage) => {
            // Accept messages for either the raw roomId or the resolved chatRoom UUID
            if (incomingMsg.roomId &&
                String(incomingMsg.roomId) !== String(roomId) &&
                String(incomingMsg.roomId) !== String(effectiveRoomId)) return;

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
                    newMessages[matchIndex] = { ...incomingMsg, status: 'sent', sender: existingMsg.sender || incomingMsg.sender, replyTo: safeReply };
                    return newMessages;
                } else {
                    return [...prev, incomingMsg];
                }
            });
            if (incomingMsg.userId !== user?.id) {
                SocketManager.emit("markAsRead", { roomId: effectiveRoomId, userId: user?.id });
                markChatAsRead(effectiveRoomId);
                if (roomId !== effectiveRoomId) markChatAsRead(roomId);
            }
        });

        const unsubscribeMessageUpdated = SocketManager.on("messageUpdated", (payload) => {
            if (!payload.roomId || payload.roomId === roomId || payload.roomId === effectiveRoomId) {
                setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, text: payload.text, isEdited: payload.isEdited } : m));
            }
        });

        const unsubscribeMessageDeleted = SocketManager.on("messageDeleted", (payload) => {
            if (payload.roomId && String(payload.roomId) !== String(roomId) && String(payload.roomId) !== String(effectiveRoomId)) return;
            setMessages(prev => prev.map(msg => String(msg.id) === String(payload.id) ? { ...msg, isDeleted: true, text: "[Content Removed]", status: 'rejected' } : msg));
        });

        const unsubscribeMessageReaction = SocketManager.on("messageReaction", (payload) => {
            if (!payload.roomId || payload.roomId === roomId || payload.roomId === effectiveRoomId) {
                setMessages((prev) => prev.map(m => (String(m.id) === String(payload.messageId)) ? { ...m, reactions: payload.reactions } : m));
            }
        });

        const unsubscribeMessageStatusUpdate = SocketManager.on("messageStatusUpdate", (payload) => {
            if (payload.roomId === roomId || payload.roomId === effectiveRoomId) {
                setMessages(prev => prev.map(m => (m.userId === user?.id && m.status !== 'read') ? { ...m, status: payload.status } : m));
            }
        });

        return () => {
            unsubscribeConnect();
            appSub.remove();
            unsubscribePresence();
            unsubscribeTypingStart();
            unsubscribeTypingStop();
            unsubscribeMessage();
            unsubscribeMessageUpdated();
            unsubscribeMessageDeleted();
            unsubscribeMessageReaction();
            unsubscribeMessageStatusUpdate();
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
            typingTimeoutsRef.current = {};
            // Do NOT emit leaveRoom here — that would eject the user from the Socket.io
            // room entirely, breaking ChatContext typing indicators on the chat list.
            // The user should stay passively joined (via joinChats) even when not
            // actively viewing this chat screen.
        };
    }, [effectiveRoomId, roomId, user?.id, markChatAsRead]); // otherUserId via ref — no remount on presence target resolve

    // Keep local message list in sync when ChatContext cache receives socket updates for this room
    useEffect(() => {
        const cached = messagesCache[roomId] || messagesCache[effectiveRoomId];
        if (!cached || cached.length === 0) return;
        setMessages(prev => {
            if (cached.length <= prev.length) return prev;
            // Prefer cache only when it grew (missed live event); avoid clobbering optimistic sends
            const prevIds = new Set(prev.map(m => String(m.id)));
            const hasNew = cached.some(m => !prevIds.has(String(m.id)));
            return hasNew && cached.length >= prev.length ? cached : prev;
        });
    }, [messagesCache, roomId, effectiveRoomId]);

    // 4. Hydrate Users from message payload / participants cache.
    // Only fall back to profile API for IDs still missing after seeding.
    useEffect(() => {
        // Prefer sender data already embedded on each message
        mergeUserCaches(
            messages.map(m => ({
                id: m.userId || m.senderId || m.sender?.id,
                name: m.senderName || m.sender?.name,
                image: m.sender?.image,
            }))
        );

        const missing = [...new Set(
            messages.map(m => m.userId || m.senderId).filter((id): id is string => !!id)
        )].filter(id => !fetchedUserIdsRef.current.has(id));

        if (missing.length === 0) return;

        missing.forEach(id => fetchedUserIdsRef.current.add(id));

        const hydrateUsers = async () => {
            const token = await getToken();
            if (!token) return;

            const results = await Promise.allSettled(
                missing.map(uid => usersApi.getProfile(uid, token).then(u => ({ uid, u })))
            );

            const newAvatars: Record<string, string | null> = {};
            const newNames: Record<string, string> = {};
            results.forEach(r => {
                if (r.status === 'fulfilled') {
                    const { uid, u } = r.value;
                    newAvatars[uid] = u?.imageUrl || null;
                    if (u?.name) newNames[uid] = String(u.name);
                }
            });

            setAvatarByUserId(prev => ({ ...prev, ...newAvatars }));
            setNameByUserId(prev => ({ ...prev, ...newNames }));
        };
        hydrateUsers();
    }, [messages, mergeUserCaches, getToken]);


    const effectiveChatName =
        chatName
        || gameChatTitle
        || (isPrivate ? otherParticipant?.user?.name : null)
        || (roomId === "global" ? "Global Chat" : null)
        || (isPrivate ? "Chat" : "Game Chat");

    // Actions
    const handleSendMessage = () => {
        const trimmed = inputValue.trim();
        if (!trimmed) return;

        if (editingMessage) {
            SocketManager.emit("editMessage", { messageId: editingMessage.id, text: trimmed, roomId: effectiveRoomId });
            setEditingMessage(null);
        } else {
            const optimisticId = Date.now();
            const optimisticMessage: ChatMessage & { content: string } = {
                id: optimisticId, text: trimmed, content: trimmed, roomId: effectiveRoomId,
                userId: user?.id || "anon", senderId: user?.id || "anon", senderName: user?.fullName || "Me",
                ts: new Date().toISOString(), status: "sent",
                sender: { id: user?.id, name: user?.fullName || undefined, image: user?.imageUrl || undefined },
                replyTo: replyToMessage ? {
                    id: replyToMessage.id, text: replyToMessage.text,
                    senderName: replyToMessage.sender?.name || replyToMessage.senderName || "User"
                } : undefined
            };
            setMessages((prev) => [...prev, optimisticMessage]);

            // Always use effectiveRoomId (resolved ChatRoom UUID) so the server routes correctly
            SocketManager.emit("message", { text: trimmed, roomId: effectiveRoomId, userId: user?.id, replyTo: optimisticMessage.replyTo, status: "sent", tempId: optimisticId });
        }
        setInputValue("");
        setReplyToMessage(null);
        SocketManager.emit("typing", { isTyping: false, roomId: effectiveRoomId, userName: user?.fullName });
    };

    const handleTyping = () => {
        // Use effectiveRoomId so typing events reach the correct socket room
        SocketManager.emit("typing", { isTyping: true, roomId: effectiveRoomId, userName: user?.fullName });
    };

    const handleStopTyping = () => {
        SocketManager.emit("typing", { isTyping: false, roomId: effectiveRoomId, userName: user?.fullName });
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
            handleSendMessage, handleTyping, handleStopTyping,
            handleDelete: (id: string | number) => SocketManager.emit("deleteMessage", { messageId: id, roomId: effectiveRoomId }),
            handleReact: (id: string | number, emoji: string) => SocketManager.emit("addReaction", { messageId: id, emoji, userId: user?.id, roomId: effectiveRoomId }),
        }
    };
}
