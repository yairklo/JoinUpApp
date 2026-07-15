"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useAuth, useUser } from "@clerk/clerk-expo";
import { ChatMessage } from "@/types/chat";
import { chatsApi } from "@/services/api/chats";
import { apiClient } from "@/services/api/client";
import { SocketManager } from "@/services/socketManager";
import * as Notifications from 'expo-notifications';

export interface HeaderInfo {
    name: string;
    image?: string | null;
    id?: string;
}

export interface ChatPreview {
    id: string;
    type: 'group' | 'private';
    name: string;
    image: string | null;
    unreadCount: number;
    lastMessage: {
        text: string;
        createdAt: string;
        senderId: string;
        status: string;
    } | null;
    otherUserId?: string;
}

interface ChatContextProps {
    activeChatId: string | null;
    isWidgetOpen: boolean;
    isMinimized: boolean;
    headerInfo: HeaderInfo | null;
    chats: ChatPreview[];
    loadingChats: boolean;
    totalUnread: number;
    typingStatus: Record<string, string>;
    messagesCache: Record<string, ChatMessage[]>;
    openChat: (chatId: string, info?: HeaderInfo) => void;
    openWidget: () => void;
    closeChat: () => void;
    minimizeChat: () => void;
    maximizeChat: () => void;
    goBackToList: () => void;
    loadChats: () => Promise<void>;
    loadMessages: (chatId: string) => Promise<ChatMessage[]>;
    updateChatList: (newMessage: any) => void;
    markChatAsRead: (chatId: string) => void;
}

const ChatContext = createContext<ChatContextProps | undefined>(undefined);

/** Keep one row per chat id — last writer wins; merge unread + newest preview when colliding. */
export function dedupeChatsById(chats: ChatPreview[]): ChatPreview[] {
    const byId = new Map<string, ChatPreview>();
    for (const chat of chats) {
        if (!chat?.id) continue;
        const existing = byId.get(chat.id);
        if (!existing) {
            byId.set(chat.id, chat);
            continue;
        }
        const existingTs = existing.lastMessage?.createdAt
            ? new Date(existing.lastMessage.createdAt).getTime()
            : 0;
        const chatTs = chat.lastMessage?.createdAt
            ? new Date(chat.lastMessage.createdAt).getTime()
            : 0;
        const newer = chatTs >= existingTs ? chat : existing;
        byId.set(chat.id, {
            ...newer,
            unreadCount: Math.max(existing.unreadCount || 0, chat.unreadCount || 0),
        });
    }
    return Array.from(byId.values());
}

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const { user } = useUser();
    const { getToken } = useAuth();

    // UI State
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [isWidgetOpen, setIsWidgetOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);

    // Data State
    const [chats, setChats] = useState<ChatPreview[]>([]);
    const [loadingChats, setLoadingChats] = useState(false);
    const [totalUnread, setTotalUnread] = useState(0);
    const [messagesCache, setMessagesCache] = useState<Record<string, ChatMessage[]>>({});

    const [typingStatus, setTypingStatus] = useState<Record<string, string>>({});

    // Fix #3: ref-based guard so loadChats has a stable reference
    const chatsLoadedRef = useRef(false);
    const loadChatsInFlightRef = useRef(false);
    const chatsRef = useRef<ChatPreview[]>([]);
    const activeChatIdRef = useRef<string | null>(null);
    const updateChatListRef = useRef<(newMessage: any) => void>(() => {});
    const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        chatsRef.current = chats;
    }, [chats]);

    useEffect(() => {
        activeChatIdRef.current = activeChatId;
    }, [activeChatId]);

    // API Client handles base URL


    // Restore personal room + chat rooms on socket (re)connect.
    // Soft AppState wake only — never tear down / forceNew the singleton.
    useEffect(() => {
        if (!user?.id) return;

        const sendSetup = () => {
            SocketManager.emit('setup', { id: user.id });
        };

        const rejoinAllChats = () => {
            const chatIds = chatsRef.current.map(c => c.id).filter(Boolean);
            if (chatIds.length === 0) return;
            SocketManager.emit('joinChats', chatIds);
        };

        // Called only after a successful connect — rooms were cleared server-side
        const onSocketConnected = () => {
            sendSetup();
            rejoinAllChats();
        };

        // If already connected (AuthGuard connected first), join immediately
        if (SocketManager.connected) {
            onSocketConnected();
        }

        const unsubConnect = SocketManager.on('connect', onSocketConnected);

        const onAppStateChange = (next: AppStateStatus) => {
            if (next !== 'active') return;
            // Soft wake only. Room rejoin happens via the 'connect' listener once up.
            // If still connected after background, rejoin rooms now (no disconnect event).
            if (SocketManager.connected) {
                onSocketConnected();
            } else {
                SocketManager.ensureConnected();
            }
        };
        const appSub = AppState.addEventListener('change', onAppStateChange);

        return () => {
            unsubConnect();
            appSub.remove();
        };
    }, [user?.id]);

    // Also rejoin when the chat list first populates / length changes (ids via ref stay fresh on connect)
    useEffect(() => {
        if (!user?.id || chats.length === 0) return;
        SocketManager.emit('joinChats', chats.map(c => c.id).filter(Boolean));
    }, [user?.id, chats.length]);

    // 1. Load Chats
    const loadChats = useCallback(async (forceRefresh = false) => {
        if (!user?.id) return;
        if (!forceRefresh && chatsLoadedRef.current) return;
        if (loadChatsInFlightRef.current) return;

        loadChatsInFlightRef.current = true;
        setLoadingChats(true);
        try {
            const token = await getToken();
            if (!token) return;

            const data = await chatsApi.getUserChats(user.id, token);
            const unique = dedupeChatsById(data);
            setChats(unique);

            const total = unique.filter((chat: ChatPreview) => (chat.unreadCount || 0) > 0).length;
            setTotalUnread(total);
            chatsLoadedRef.current = true;
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoadingChats(false);
            loadChatsInFlightRef.current = false;
        }
    }, [user?.id, getToken]);

    // 2. Load Messages (Prefetch/Cache)
    const loadMessages = useCallback(async (chatId: string, forceFetch = false): Promise<ChatMessage[]> => {
        if (!chatId || chatId === 'global') return [];

        // Check Cache - Instant Return
        if (!forceFetch && messagesCache[chatId]) {
            return messagesCache[chatId];
        }

        try {
            const token = await getToken();
            if (!token) return [];

            // Fetch messages using apiClient
            const arr = await apiClient<any[]>(`/api/messages?roomId=${encodeURIComponent(chatId)}&limit=200`, { token });

            const mapped: ChatMessage[] = arr.map((m: any) => ({
                id: m.id ?? Date.parse(m.ts),
                text: m.text,
                senderId: m.userId || m.senderId || "",
                ts: m.ts,
                roomId: chatId,
                userId: m.userId,
                senderName: m.senderName || m.sender?.name,
                sender: m.sender
                    ? {
                        id: m.sender.id || m.userId,
                        name: m.sender.name,
                        image: m.sender.image || m.sender.imageUrl,
                    }
                    : undefined,
                replyTo: m.replyTo,
                reactions: m.reactions,
                status: m.status || "sent",
                isEdited: m.isEdited,
                isDeleted: m.isDeleted
            }));

            // Update Cache
            setMessagesCache(prev => ({ ...prev, [chatId]: mapped }));

            // Update Chat List preview with the latest fetched message
            if (mapped.length > 0) {
                const lastMsg = mapped[mapped.length - 1];
                setChats(prevChats => {
                    const chatIndex = prevChats.findIndex(c => c.id === chatId);
                    if (chatIndex === -1) return prevChats;

                    const currentLastMsg = prevChats[chatIndex].lastMessage;
                    if (!currentLastMsg || new Date(lastMsg.ts) > new Date(currentLastMsg.createdAt)) {
                        const newChats = [...prevChats];
                        newChats[chatIndex] = {
                            ...newChats[chatIndex],
                            lastMessage: {
                                text: lastMsg.text,
                                createdAt: lastMsg.ts,
                                senderId: lastMsg.senderId,
                                status: lastMsg.status || 'sent'
                            }
                        };
                        return dedupeChatsById(newChats.sort((a, b) => {
                            const dateA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
                            const dateB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
                            return dateB - dateA;
                        }));
                    }
                    return prevChats;
                });
            }

            return mapped;
        } catch (error) {
            console.error("Failed to load messages:", error);
            return [];
        }
    }, [messagesCache, getToken]);

    // 3. Socket Update Handler
    const updateChatList = useCallback((newMessage: any) => {
        const roomId = newMessage.chatId || newMessage.roomId;
        const isActiveChat = !!activeChatIdRef.current && (
            activeChatIdRef.current === roomId
        );

        const chatExists = chatsRef.current.some(c => c.id === roomId);
        if (!chatExists) {
            // New conversation arrived: fetch updated chat list layout asynchronously
            loadChats(true);
            return;
        }

        // A. Update the Chat List (Preview & Order)
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === roomId);

            if (chatIndex === -1) return prevChats;

            // Extract correct properties depending on payload type (message vs chat:sync)
            const text = newMessage.lastMessage?.text || newMessage.content || newMessage.text;
            const createdAt = newMessage.lastMessage?.createdAt || newMessage.ts || new Date().toISOString();
            const senderId = newMessage.lastMessage?.senderId || newMessage.senderId || newMessage.userId;
            const status = newMessage.lastMessage?.status || newMessage.status || 'sent';
            
            // Deduplication Guard: If user is actively inside the chat room, do NOT increment unread.
            const incrementAmount = newMessage.unreadCountIncrement || 1;
            const shouldIncrementUnread = (!isActiveChat && senderId !== user?.id);

            const prevUnread = prevChats[chatIndex].unreadCount || 0;
            const updatedChat = {
                ...prevChats[chatIndex],
                lastMessage: {
                    text,
                    createdAt,
                    senderId,
                    status
                },
                unreadCount: shouldIncrementUnread
                    ? prevUnread + incrementAmount
                    : prevUnread
            };

            // Global badge: +1 only when this room newly gains unread (was 0 before)
            if (shouldIncrementUnread && prevUnread === 0) {
                setTotalUnread(prev => prev + 1);
            }

            // Move to top — always dedupe in case a stale duplicate id was already in state
            const otherChats = prevChats.filter((c) => c.id !== roomId);
            return dedupeChatsById([updatedChat, ...otherChats]);
        });

        // B. Update Messages Cache
        if (roomId) {
            setMessagesCache(prevCache => {
                const currentMessages = prevCache[roomId];
                if (!currentMessages) return prevCache; // Not cached yet, loadMessages will handle it

                // Avoid duplicates
                if (currentMessages.some(m => m.id === newMessage.id)) return prevCache;

                const newChatMessage: ChatMessage = {
                    id: newMessage.id || Date.now(),
                    text: newMessage.content || newMessage.text,
                    senderId: newMessage.senderId || newMessage.userId,
                    ts: newMessage.ts || new Date().toISOString(),
                    roomId: roomId,
                    userId: newMessage.userId || newMessage.senderId,
                    senderName: newMessage.senderName || newMessage.sender?.name,
                    sender: newMessage.sender,
                    status: newMessage.status || 'sent',
                    reactions: {},
                    isEdited: false,
                    isDeleted: false
                };

                return {
                    ...prevCache,
                    [roomId]: [...currentMessages, newChatMessage]
                };
            });
        }
    }, [user?.id, loadChats]);

    useEffect(() => {
        updateChatListRef.current = updateChatList;
    }, [updateChatList]);

    // 4. Socket Listeners for Global Chat State — stable deps so we never tear down on chat open/close
    useEffect(() => {
        if (!user?.id) return;
        
        const handleIncoming = (incomingMsg: any) => {
            updateChatListRef.current(incomingMsg);
        };
        // chat:sync is the canonical feed update — do not also listen to `message` here
        // (room `message` + user `chat:sync` double-fire caused redundant state churn / dupes)
        const unsubSync = SocketManager.on('chat:sync', handleIncoming);

        const unsubTypingStart = SocketManager.on('typing:start', ({ chatId, userName, senderId }) => {
            if (!chatId) return;
            if (String(senderId) === String(user?.id)) return;
            const name = userName || "Someone";
            if (typingTimeoutsRef.current[chatId]) clearTimeout(typingTimeoutsRef.current[chatId]);
            setTypingStatus(prev => ({ ...prev, [chatId]: `${name} מקליד...` }));
            typingTimeoutsRef.current[chatId] = setTimeout(() => {
                setTypingStatus(prev => {
                    const newState = { ...prev };
                    delete newState[chatId];
                    return newState;
                });
                delete typingTimeoutsRef.current[chatId];
            }, 3000);
        });

        const unsubTypingStop = SocketManager.on('typing:stop', ({ chatId }) => {
            if (!chatId) return;
            if (typingTimeoutsRef.current[chatId]) {
                clearTimeout(typingTimeoutsRef.current[chatId]);
                delete typingTimeoutsRef.current[chatId];
            }
            setTypingStatus(prev => {
                const newState = { ...prev };
                delete newState[chatId];
                return newState;
            });
        });

        return () => {
            unsubSync();
            unsubTypingStart();
            unsubTypingStop();
            Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
            typingTimeoutsRef.current = {};
        };
    }, [user?.id]);

    // 5. Update OS Badge Count
    useEffect(() => {
        Notifications.setBadgeCountAsync(totalUnread).catch(e => console.warn('Failed to set badge count:', e));
    }, [totalUnread]);

    const openChat = useCallback((chatId: string, info?: HeaderInfo) => {
        setActiveChatId(chatId);
        if (info) {
            setHeaderInfo(info);
        } else {
            setHeaderInfo(null);
        }
        setIsWidgetOpen(true);
        setIsMinimized(false);
    }, []);

    const openWidget = () => {
        setActiveChatId(null);
        setIsWidgetOpen(true);
        setIsMinimized(false);
    };

    const closeChat = useCallback(() => {
        setIsWidgetOpen(false);
        setActiveChatId(null);
        setIsMinimized(false);
        setHeaderInfo(null);
    }, []);

    const minimizeChat = () => {
        setIsMinimized(true);
    };

    const maximizeChat = () => {
        setIsMinimized(false);
    };

    const goBackToList = () => {
        setActiveChatId(null);
    };

    const markChatAsRead = useCallback((chatId: string) => {
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === chatId);
            if (chatIndex === -1 || !prevChats[chatIndex].unreadCount) return prevChats;

            setTotalUnread(prev => Math.max(0, prev - 1));

            const newChats = [...prevChats];
            newChats[chatIndex] = { ...newChats[chatIndex], unreadCount: 0 };
            return dedupeChatsById(newChats);
        });
    }, []);

    const value = {
        activeChatId,
        isWidgetOpen,
        isMinimized,
        headerInfo,
        chats,
        loadingChats,
        totalUnread,
        typingStatus,
        messagesCache,
        openChat,
        openWidget,
        closeChat,
        minimizeChat,
        maximizeChat,
        goBackToList,
        loadChats,
        loadMessages,
        updateChatList,
        markChatAsRead
    };

    return (
        <ChatContext.Provider value={value}>
            {children}
        </ChatContext.Provider>
    );
};

export const useChat = () => {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error("useChat must be used within a ChatProvider");
    }
    return context;
};