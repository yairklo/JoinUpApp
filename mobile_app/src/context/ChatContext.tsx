"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from "react";
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

    // API Client handles base URL


    // Initialize UI and Socket Connection
    useEffect(() => {
        if (user?.id) {
            getToken().then(token => {
                if (token) {
                    SocketManager.connect(token);
                    // Crucial: Tell the server who we are so it joins our personal notification room
                    SocketManager.emit('setup', { id: user.id });
                }
            });
        } else {
            SocketManager.disconnect();
        }
        return () => {
            // Clean up socket on unmount if needed, or leave it for the user logout
        };
    }, [user?.id, getToken]);

    // 0. Join Chat Rooms for Real-time Typing Indicators
    useEffect(() => {
        if (!user?.id || chats.length === 0) return;
        const chatIds = chats.map(c => c.id);
        
        const joinAll = () => {
            SocketManager.emit('joinChats', chatIds);
        };
        joinAll();

        const unsubConnect = SocketManager.on('connect', joinAll);
        return () => unsubConnect();
    }, [user?.id, chats.length]);

    // 1. Load Chats
    const loadChats = useCallback(async (forceRefresh = false) => {
        if (!user?.id) return;
        // Fix #3: use ref instead of chats.length to avoid stale closure rebuild
        if (!forceRefresh && chatsLoadedRef.current) return;

        setLoadingChats(true);
        try {
            const token = await getToken();
            if (!token) return;

            const data = await chatsApi.getUserChats(user.id, token);
            setChats(data);

            // Calculate total unread
            const total = data.reduce((acc: number, chat: ChatPreview) => acc + (chat.unreadCount || 0), 0);
            setTotalUnread(total);
            chatsLoadedRef.current = true;
        } catch (error) {
            console.error("Failed to load chats", error);
        } finally {
            setLoadingChats(false);
        }
    }, [user?.id, getToken]); // Fix #3: removed chats.length — stable reference now

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
                        return newChats.sort((a, b) => {
                            const dateA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
                            const dateB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
                            return dateB - dateA;
                        });
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
        const isActiveChat = activeChatId === roomId;

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

            const updatedChat = {
                ...prevChats[chatIndex],
                lastMessage: {
                    text,
                    createdAt,
                    senderId,
                    status
                },
                unreadCount: shouldIncrementUnread
                    ? (prevChats[chatIndex].unreadCount || 0) + incrementAmount
                    : prevChats[chatIndex].unreadCount
            };

            // Update Global Unread if needed
            if (shouldIncrementUnread) {
                setTotalUnread(prev => prev + incrementAmount);
            }

            // Move to top
            const otherChats = prevChats.filter((_, i) => i !== chatIndex);
            return [updatedChat, ...otherChats];
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
    }, [user?.id, activeChatId]); // Ensure activeChatId is in deps

    // 4. Socket Listeners for Global Chat State
    useEffect(() => {
        if (!user?.id) return;
        
        const handleIncoming = (incomingMsg: any) => {
            updateChatList(incomingMsg);
        };
        const unsubSync = SocketManager.on('chat:sync', handleIncoming);
        const unsubMsg = SocketManager.on('message', handleIncoming);

        const unsubTypingStart = SocketManager.on('typing:start', ({ chatId, userName, senderId }) => {
            if (String(senderId) === String(user?.id)) return;
            const name = userName || "Someone";
            setTypingStatus(prev => ({ ...prev, [chatId]: `${name} מקליד...` }));
            // Clear after 3 seconds
            setTimeout(() => {
                setTypingStatus(prev => {
                    const newState = { ...prev };
                    delete newState[chatId];
                    return newState;
                });
            }, 3000);
        });

        const unsubTypingStop = SocketManager.on('typing:stop', ({ chatId }) => {
            setTypingStatus(prev => {
                const newState = { ...prev };
                delete newState[chatId];
                return newState;
            });
        });

        return () => {
            unsubSync();
            unsubMsg();
            unsubTypingStart();
            unsubTypingStop();
        };
    }, [user?.id, updateChatList]);

    // 5. Update OS Badge Count
    useEffect(() => {
        Notifications.setBadgeCountAsync(totalUnread).catch(e => console.warn('Failed to set badge count:', e));
    }, [totalUnread]);

    const openChat = (chatId: string, info?: HeaderInfo) => {
        setActiveChatId(chatId);
        if (info) {
            setHeaderInfo(info);
        } else {
            setHeaderInfo(null);
        }
        setIsWidgetOpen(true);
        setIsMinimized(false);
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
    };

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

            const unreadCount = prevChats[chatIndex].unreadCount;
            setTotalUnread(prev => Math.max(0, prev - unreadCount));

            const newChats = [...prevChats];
            newChats[chatIndex] = { ...newChats[chatIndex], unreadCount: 0 };
            return newChats;
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