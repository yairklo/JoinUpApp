import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { io, Socket } from "socket.io-client";
import { useUser, useAuth } from "@clerk/nextjs";
import { useChat } from "@/context/ChatContext";
import { chatsApi, usersApi, API_BASE } from "@/services/api";
import { ChatMessage, Reaction, MessageStatus } from "@/components/types";

// NOTE: We import API_BASE from services, but socket still needs it.
// We might want to move socket logic to a service later, but for now hook is fine.

export interface UseChatLogicProps {
    roomId: string;
    chatName?: string;
}

export function useChatLogic({ roomId, chatName }: UseChatLogicProps) {
    const { user } = useUser();
    const { getToken } = useAuth();
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
    const [socketInstance, setSocketInstance] = useState<Socket | null>(null);

    const [avatarByUserId, setAvatarByUserId] = useState<Record<string, string | null>>({});
    const [nameByUserId, setNameByUserId] = useState<Record<string, string>>({});

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const isUserAtBottomRef = useRef(true);
    const prevMessagesLengthRef = useRef(0);
    const typingTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

    // 1. Fetch Chat Details
    useEffect(() => {
        if (!roomId || roomId === 'global') return;
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
    }, [roomId, getToken]);

    // 2. Load Messages
    useEffect(() => {
        if (!roomId) return;
        if (messagesCache[roomId]) {
            setMessages(messagesCache[roomId]);
            setIsLoading(false);
            prevMessagesLengthRef.current = messagesCache[roomId].length;
        }

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
    }, [roomId]);

    // 3. Socket Logic
    useEffect(() => {
        let socket: Socket | null = null;
        const initSocket = async () => {
            try {
                const token = await getToken();
                socket = io(API_BASE, {
                    path: "/api/socket",
                    transports: ["websocket"],
                    withCredentials: true,
                    auth: { token }
                });
                setSocketInstance(socket);

                socket.on("connect", () => {
                    socket?.emit("joinRoom", roomId);
                    socket?.emit("markAsRead", { roomId, userId: user?.id });
                });

                socket.on("connect_error", async (err: any) => {
                    if (err.message.includes("Authentication error") || err.message.includes("JWT") || err.message.includes("token")) {
                        try {
                            const newToken = await getToken();
                            if (newToken && socket) {
                                socket.auth = { token: newToken };
                                socket.connect();
                            }
                        } catch (e) { console.error("Refresh token failed", e); }
                    }
                });

                // Event Listeners (Same as before)
                socket.on('presence:update', ({ userId: uid, isOnline }) => {
                    if (uid === otherUserId) setIsOtherUserOnline(isOnline);
                });

                socket.on('typing:start', ({ chatId, userName, senderId }) => {
                    if (String(chatId) !== String(roomId)) return;
                    if (String(senderId) === String(user?.id)) return;
                    const name = userName || "Someone";
                    if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
                    setTypingUsers(prev => { const next = new Set(prev); next.add(name); return next; });
                    typingTimeoutsRef.current[senderId] = setTimeout(() => {
                        setTypingUsers(prev => { const next = new Set(prev); next.delete(name); return next; });
                    }, 3000);
                });

                socket.on('typing:stop', ({ chatId, userName, senderId }) => {
                    if (String(chatId) !== String(roomId)) return;
                    if (String(senderId) === String(user?.id)) return;
                    const name = userName || "Someone";
                    if (typingTimeoutsRef.current[senderId]) clearTimeout(typingTimeoutsRef.current[senderId]);
                    setTypingUsers(prev => { const next = new Set(prev); next.delete(name); return next; });
                });

                socket.on("message", (incomingMsg: ChatMessage) => {
                    if (incomingMsg.roomId && String(incomingMsg.roomId) !== String(roomId)) return;

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
                    if (incomingMsg.userId !== user?.id) socket?.emit("markAsRead", { roomId, userId: user?.id });
                });

                // ... Other events (updated, deleted, reactions) ...
                socket.on("messageUpdated", (payload) => {
                    if (!payload.roomId || payload.roomId === roomId) {
                        setMessages(prev => prev.map(m => m.id === payload.id ? { ...m, text: payload.text, isEdited: payload.isEdited } : m));
                    }
                });

                socket.on("messageDeleted", (payload) => {
                    if (payload.roomId && String(payload.roomId) !== String(roomId)) return;
                    setMessages(prev => prev.map(msg => String(msg.id) === String(payload.id) ? { ...msg, isDeleted: true, text: "[Content Removed]", status: 'rejected' } : msg));
                });

                socket.on("messageReaction", (payload) => {
                    if (!payload.roomId || payload.roomId === roomId) {
                        setMessages((prev) => prev.map(m => (String(m.id) === String(payload.messageId)) ? { ...m, reactions: payload.reactions } : m));
                    }
                });

                socket.on("messageStatusUpdate", (payload) => {
                    if (payload.roomId === roomId) {
                        setMessages(prev => prev.map(m => (m.userId === user?.id && m.status !== 'read') ? { ...m, status: payload.status } : m));
                    }
                });

            } catch (e) {
                console.error("Socket connection failed", e);
            }
        };

        if (user?.id) initSocket();
        return () => { if (socket) socket.disconnect(); };
    }, [roomId, user?.id, getToken]); // Removed otherUserId from dep to avoid infinite loop / simplified

    // 4. Hydrate Users
    useEffect(() => {
        const missing = Array.from(new Set(messages.map((m) => m.userId).filter((id): id is string => !!id))).filter(id => !(id in avatarByUserId));
        if (missing.length === 0) return;
        missing.forEach(async (uid) => {
            try {
                const u = await usersApi.getProfile(uid);
                setAvatarByUserId((prev) => ({ ...prev, [uid]: u?.imageUrl || null }));
                if (u?.name) setNameByUserId((prev) => ({ ...prev, [uid]: String(u.name) }));
            } catch {
                setAvatarByUserId((prev) => ({ ...prev, [uid]: null }));
            }
        });
    }, [messages, avatarByUserId]);


    // Helper Props for UI
    const isPrivate = chatDetails?.type?.toUpperCase() === 'PRIVATE';
    const otherParticipant = isPrivate ? chatDetails?.participants?.find((p: any) => p.userId !== user?.id) : null;
    const otherUserId = otherParticipant?.userId;
    const otherUserAvatar = otherParticipant?.user?.imageUrl;
    const effectiveChatName = chatName || (isPrivate ? otherParticipant?.user?.name : "Game Chat") || (roomId === "global" ? "Global Chat" : "Chat");


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
                userId: user?.id || "anon", senderId: user?.id || "anon", senderName: user?.fullName || "Me",
                ts: new Date().toISOString(), status: "sent",
                sender: { id: user?.id, name: user?.fullName || undefined, image: user?.imageUrl || undefined },
                replyTo: replyToMessage ? {
                    id: replyToMessage.id, text: replyToMessage.text,
                    senderName: replyToMessage.sender?.name || replyToMessage.senderName || "User"
                } : undefined
            };
            setMessages((prev) => [...prev, optimisticMessage]);

            socketInstance.emit("message", { text: trimmed, roomId, userId: user?.id, replyTo: optimisticMessage.replyTo, status: "sent", tempId: optimisticId });
        }
        setInputValue("");
        setReplyToMessage(null);
        socketInstance.emit("typing", { isTyping: false, roomId, userName: user?.fullName });
    };

    const handleTyping = () => {
        socketInstance?.emit("typing", { isTyping: true, roomId, userName: user?.fullName });
    };

    const handleStopTyping = () => {
        socketInstance?.emit("typing", { isTyping: false, roomId, userName: user?.fullName });
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
            handleDelete: (id: string | number) => socketInstance?.emit("deleteMessage", { messageId: id, roomId }),
            handleReact: (id: string | number, emoji: string) => socketInstance?.emit("addReaction", { messageId: id, emoji, userId: user?.id, roomId }),
        }
    };
}
