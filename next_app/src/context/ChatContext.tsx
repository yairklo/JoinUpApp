"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { ChatMessage } from "@/components/types";
import { io } from "socket.io-client";

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
    updateChatList: (newMessage: any) => void; // For socket updates
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

    // References for socket management to avoid re-renders or stale closures if we move socket here
    // For this step, we'll keep socket in ChatList but expose an updater, 
    // OR ideally move socket here. The user asked to "Move data management". 
    // Let's implement data fetching first.

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
        // If we already have chats, maybe we don't need to full fetch, 
        // but for now let's minimal fetch or check timestamp? 
        // User request: "Fetches the chat list only if not already loaded"
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
        // Validation
        if (!chatId || chatId === 'global') return [];

        // Check Cache
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

    // Helper to update chat list from external events (socket in ChatList)
    const updateChatList = useCallback((newMessage: any) => {
        setChats(prevChats => {
            const chatIndex = prevChats.findIndex(c => c.id === newMessage.chatId);
            if (chatIndex === -1) return prevChats; // Or fetchChats?

            const updatedChat = {
                ...prevChats[chatIndex],
                lastMessage: {
                    text: newMessage.content || newMessage.text,
                    createdAt: newMessage.ts || new Date().toISOString(),
                    senderId: newMessage.senderId,
                    status: newMessage.status
                },
                unreadCount: (newMessage.senderId !== user?.id)
                    ? (prevChats[chatIndex].unreadCount || 0) + 1
                    : prevChats[chatIndex].unreadCount
            };

            if (newMessage.senderId !== user?.id) {
                setTotalUnread(prev => prev + 1);
            }

            const otherChats = prevChats.filter(c => c.id !== newMessage.chatId);
            return [updatedChat, ...otherChats];
        });
    }, [user?.id]);

    const openChat = (chatId: string, info?: HeaderInfo) => {
        setActiveChatId(chatId);
        if (info) {
            // Ensure ID is passed if available (fix for presence)
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

    // Helper to mark as read
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
