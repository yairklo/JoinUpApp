"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { ChatMessage } from "@/components/types";
import { useAuthTokenRef } from "@/hooks/useAuthTokenRef";
import { publicDisplayName } from "@/utils/publicName";

const CHAT_STORAGE_KEYS = ["activeChatId", "chatMinimized", "chatHeaderInfo", "chatOwnerId"] as const;

function readChatStorage(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeChatStorage(key: string, value: string) {
    try {
        localStorage.setItem(key, value);
    } catch { /* storage blocked */ }
}

function removeChatStorage(key: string) {
    try {
        localStorage.removeItem(key);
    } catch { /* storage blocked */ }
}

function clearChatStorage() {
    for (const key of CHAT_STORAGE_KEYS) removeChatStorage(key);
}

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

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const { user, isLoaded } = useUser();
    const getTokenRef = useAuthTokenRef();

    // UI State. The widget stays closed until we know the stored chat belongs to this user.
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [isWidgetOpen, setIsWidgetOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);
    const [boundUserId, setBoundUserId] = useState<string | null>(null);

    // Data State
    const [chats, setChats] = useState<ChatPreview[]>([]);
    const [loadingChats, setLoadingChats] = useState(false);
    const [totalUnread, setTotalUnread] = useState(0);
    const [messagesCache, setMessagesCache] = useState<Record<string, ChatMessage[]>>({});

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

    const resetChatMemory = useCallback(() => {
        setActiveChatId(null);
        setIsWidgetOpen(false);
        setIsMinimized(false);
        setHeaderInfo(null);
        setChats([]);
        setMessagesCache({});
        setTotalUnread(0);
    }, []);

    // Restore the popup only for the account that opened it. A missing owner (older
    // sessions) or a different user clears the cache so the previous chat cannot flash.
    useEffect(() => {
        if (!isLoaded) return;
        if (!user?.id) {
            resetChatMemory();
            setBoundUserId(null);
            clearChatStorage();
            return;
        }

        const owner = readChatStorage("chatOwnerId");
        if (owner !== user.id) {
            clearChatStorage();
            resetChatMemory();
            writeChatStorage("chatOwnerId", user.id);
            setBoundUserId(user.id);
            return;
        }

        const savedChatId = readChatStorage("activeChatId");
        const savedHeaderInfo = readChatStorage("chatHeaderInfo");
        if (savedChatId) {
            setActiveChatId(savedChatId);
            setIsWidgetOpen(true);
            if (savedHeaderInfo) {
                try {
                    const parsed = JSON.parse(savedHeaderInfo);
                    setHeaderInfo({
                        ...parsed,
                        name: publicDisplayName(parsed?.name, "משתמש"),
                    });
                } catch (e) {
                    console.error("Failed to parse chat header info", e);
                }
            }
        } else {
            setActiveChatId(null);
            setIsWidgetOpen(false);
            setHeaderInfo(null);
        }
        setIsMinimized(readChatStorage("chatMinimized") === "true");
        setBoundUserId(user.id);
    }, [isLoaded, user?.id, resetChatMemory]);

    // 1. Load Chats
    const loadChats = useCallback(async (forceFetch = false) => {
        if (!user?.id) return;

        if (chats.length === 0) {
            setLoadingChats(true);
        }

        try {
            const token = await getTokenRef.current();
            const res = await fetch(`${API_BASE}/api/users/${user.id}/chats`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setChats(data);
                const total = data.filter((chat: ChatPreview) => (chat.unreadCount || 0) > 0).length;
                setTotalUnread(total);
            }
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoadingChats(false);
        }
    }, [user?.id, getTokenRef]);

    // 2. Load Messages (Prefetch/Cache)
    const loadMessages = useCallback(async (chatId: string): Promise<ChatMessage[]> => {
        if (!chatId || chatId === 'global') return [];

        // Check Cache - Instant Return
        if (messagesCache[chatId]) {
            return messagesCache[chatId];
        }

        try {
            const token = await getTokenRef.current();
            const res = await fetch(`${API_BASE}/api/messages?roomId=${encodeURIComponent(chatId)}&limit=200`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Failed to fetch messages");

            const arr = await res.json();
            const mapped: ChatMessage[] = arr.map((m: any) => ({
                id: m.id ?? Date.parse(m.ts),
                text: m.text,
                senderId: m.userId || "",
                ts: m.ts,
                roomId: chatId,
                userId: m.userId,
                replyTo: m.replyTo,
                reactions: m.reactions,
                status: m.status || "sent",
                isEdited: m.isEdited,
                isDeleted: m.isDeleted
            }));

            // Update Cache
            setMessagesCache(prev => ({ ...prev, [chatId]: mapped }));
            return mapped;
        } catch (error) {
            console.error(error);
            return [];
        }
    }, [messagesCache, getTokenRef, API_BASE]);

    // 3. Socket Update Handler (CRITICAL FIX: Updates Cache too)
    const updateChatList = useCallback((newMessage: any) => {
        // A. Update the Chat List (Preview & Order)
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === newMessage.chatId || c.id === newMessage.roomId);

            // If chat doesn't exist in list yet, fetch all chats again to sync
            if (chatIndex === -1) {
                // Trigger a background reload of chats
                setTimeout(() => {
                    loadChats(true);
                }, 100);
                return prevChats;
            }

            const prevUnread = prevChats[chatIndex].unreadCount || 0;
            const isIncomingFromOther = newMessage.senderId !== user?.id && newMessage.userId !== user?.id;

            const updatedChat = {
                ...prevChats[chatIndex],
                lastMessage: {
                    text: newMessage.content || newMessage.text,
                    createdAt: newMessage.ts || new Date().toISOString(),
                    senderId: newMessage.senderId || newMessage.userId,
                    status: newMessage.status || 'sent'
                },
                unreadCount: isIncomingFromOther
                    ? prevUnread + 1
                    : prevUnread
            };

            // Global badge: +1 only when this room newly gains unread (was 0 before)
            if (isIncomingFromOther && prevUnread === 0) {
                setTotalUnread(prev => prev + 1);
            }

            // Move to top
            const otherChats = prevChats.filter((_, i) => i !== chatIndex);
            return [updatedChat, ...otherChats];
        });

        // B. Update Messages Cache (The Fix)
        // If we have a cache for this chat, append the new message so when user opens it, it's there.
        const roomId = newMessage.chatId || newMessage.roomId;
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

    const openChat = (chatId: string, info?: HeaderInfo) => {
        const safeInfo = info
            ? { ...info, name: publicDisplayName(info.name, "משתמש") }
            : undefined;
        setActiveChatId(chatId);
        if (safeInfo) {
            setHeaderInfo(safeInfo);
            writeChatStorage("chatHeaderInfo", JSON.stringify(safeInfo));
        } else {
            setHeaderInfo(null);
            removeChatStorage("chatHeaderInfo");
        }
        setIsWidgetOpen(true);
        setIsMinimized(false);
        writeChatStorage("activeChatId", chatId);
        writeChatStorage("chatMinimized", "false");
        if (user?.id) {
            writeChatStorage("chatOwnerId", user.id);
            setBoundUserId(user.id);
        }
    };

    const openWidget = () => {
        setActiveChatId(null);
        setIsWidgetOpen(true);
        setIsMinimized(false);
    };

    const closeChat = () => {
        setIsWidgetOpen(false);
        setActiveChatId(null);
        setIsMinimized(false);
        setHeaderInfo(null);
        removeChatStorage("activeChatId");
        removeChatStorage("chatHeaderInfo");
        removeChatStorage("chatMinimized");
    };

    const minimizeChat = () => {
        setIsMinimized(true);
        writeChatStorage("chatMinimized", "true");
    };

    const maximizeChat = () => {
        setIsMinimized(false);
        writeChatStorage("chatMinimized", "false");
    };

    const goBackToList = () => {
        setActiveChatId(null);
        removeChatStorage("activeChatId");
    };

    const markChatAsRead = useCallback((chatId: string) => {
        setChats(prev => prev.map(c => {
            if (c.id === chatId) {
                if (c.unreadCount > 0) {
                    setTotalUnread(u => Math.max(0, u - 1));
                }
                return { ...c, unreadCount: 0 };
            }
            return c;
        }));
    }, []);

    return (
        <ChatContext.Provider
            value={{
                activeChatId,
                isWidgetOpen: boundUserId !== null && boundUserId === user?.id && isWidgetOpen,
                isMinimized,
                headerInfo,
                chats,
                loadingChats,
                totalUnread,
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
            }}
        >
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