import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { Socket } from "socket.io-client";
import { useUser, useAuth } from "@clerk/nextjs";
import { useChat } from "@/context/ChatContext";
import { chatsApi, usersApi, API_BASE } from "@/services/api";
import { ChatMessage, Reaction, MessageStatus } from "@/components/types";
import { useSocket } from "@/context/SocketContext";

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
    const { socket: socketInstance, isConnected } = useSocket();

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
    }, [roomId]); // Removed getToken to prevent re-fetching on every re-render

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
                // Temporary debug block
                try {
                    const token = await getToken();
                    if (token) {
                        const debugRes = await fetch(`${API_BASE}/api/debug/chatAuth/${encodeURIComponent(roomId)}`, {
                            headers: { Authorization: `Bearer ${token}` }
                        });
                        const debugData = await debugRes.json();
                        console.log("[DEBUG CHAT_AUTH]", debugData);
                    }
                } catch (err) {
                    console.error("Debug fetch failed", err);
                }

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

        const handleMessageStatusUpdate = (payload: any) => {
            if (payload.roomId === roomId) {
                setMessages(prev => prev.map(m => (m.userId === user?.id && m.status !== 'read') ? { ...m, status: payload.status } : m));
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

        return () => {
            socketInstance.off('presence:update', handlePresenceUpdate);
            socketInstance.off('typing:start', handleTypingStart);
            socketInstance.off('typing:stop', handleTypingStop);
            socketInstance.off("message", handleMessage);
            socketInstance.off("messageUpdated", handleMessageUpdated);
            socketInstance.off("messageDeleted", handleMessageDeleted);
            socketInstance.off("messageReaction", handleMessageReaction);
            socketInstance.off("messageStatusUpdate", handleMessageStatusUpdate);
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
            console.log("SENDING MESSAGE TO:", API_BASE);
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
