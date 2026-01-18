"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { ChatMessage } from "@/components/types";

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

    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

    // Initialize UI from localStorage
    useEffect(() => {
        const savedChatId = localStorage.getItem("activeChatId");
        const savedMinimized = localStorage.getItem("chatMinimized");
        const savedHeaderInfo = localStorage.getItem("chatHeaderInfo");

        if (savedChatId) {
            setActiveChatId(savedChatId);
            setIsWidgetOpen(true);
            if (savedHeaderInfo) {
                try {
                    setHeaderInfo(JSON.parse(savedHeaderInfo));
                } catch (e) {
                    console.error("Failed to parse chat header info", e);
                }
            }
        }

        if (savedMinimized === "true") {
            setIsMinimized(true);
        }
    }, []);

    // 1. Load Chats
    const loadChats = useCallback(async () => {
        if (!user?.id) return;
        // Optimization: If chats exist, don't block UI, but ideally we should re-validate in background.
        // For now, consistent with requirements: fetch if empty.
        if (chats.length > 0) return;

        setLoadingChats(true);
        try {
            const token = await getToken();
            const res = await fetch(`${API_BASE}/api/users/${user.id}/chats`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setChats(data);
                const total = data.reduce((acc: number, chat: ChatPreview) => acc + (chat.unreadCount || 0), 0);
                setTotalUnread(total);
            }
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoadingChats(false);
        }
    }, [user?.id, chats.length, getToken, API_BASE]);

    // 2. Load Messages (Prefetch/Cache)
    const loadMessages = useCallback(async (chatId: string): Promise<ChatMessage[]> => {
        if (!chatId || chatId === 'global') return [];

        // Check Cache - Instant Return
        if (messagesCache[chatId]) {
            return messagesCache[chatId];
        }

        try {
            const token = await getToken();
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
    }, [messagesCache, getToken, API_BASE]);

    // 3. Socket Update Handler (CRITICAL FIX: Updates Cache too)
    const updateChatList = useCallback((newMessage: any) => {
        // A. Update the Chat List (Preview & Order)
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === newMessage.chatId || c.id === newMessage.roomId);

            // If chat doesn't exist in list yet, we might want to fetch chats again or add it dynamically.
            // For now, we only update existing.
            if (chatIndex === -1) return prevChats;

            const updatedChat = {
                ...prevChats[chatIndex],
                lastMessage: {
                    text: newMessage.content || newMessage.text,
                    createdAt: newMessage.ts || new Date().toISOString(),
                    senderId: newMessage.senderId || newMessage.userId,
                    status: newMessage.status || 'sent'
                },
                unreadCount: (newMessage.senderId !== user?.id && newMessage.userId !== user?.id)
                    ? (prevChats[chatIndex].unreadCount || 0) + 1
                    : prevChats[chatIndex].unreadCount
            };

            // Update Global Unread if needed
            if (newMessage.senderId !== user?.id && newMessage.userId !== user?.id) {
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
    }, [user?.id]);

    const openChat = (chatId: string, info?: HeaderInfo) => {
        setActiveChatId(chatId);
        if (info) {
            setHeaderInfo(info);
            localStorage.setItem("chatHeaderInfo", JSON.stringify(info));
        } else {
            setHeaderInfo(null);
            localStorage.removeItem("chatHeaderInfo");
        }
        setIsWidgetOpen(true);
        setIsMinimized(false);
        localStorage.setItem("activeChatId", chatId);
        localStorage.setItem("chatMinimized", "false");
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
        localStorage.removeItem("activeChatId");
        localStorage.removeItem("chatHeaderInfo");
        localStorage.removeItem("chatMinimized");
    };

    const minimizeChat = () => {
        setIsMinimized(true);
        localStorage.setItem("chatMinimized", "true");
    };

    const maximizeChat = () => {
        setIsMinimized(false);
        localStorage.setItem("chatMinimized", "false");
    };

    const goBackToList = () => {
        setActiveChatId(null);
        localStorage.removeItem("activeChatId");
    };

    const markChatAsRead = useCallback((chatId: string) => {
        setChats(prev => prev.map(c => {
            if (c.id === chatId) {
                if (c.unreadCount > 0) {
                    setTotalUnread(u => Math.max(0, u - c.unreadCount));
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
                isWidgetOpen,
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