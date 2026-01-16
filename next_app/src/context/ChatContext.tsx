"use client";

import React, { createContext, useContext, useState, ReactNode, useEffect } from "react";

interface HeaderInfo {
    name: string;
    image?: string | null;
}

interface ChatContextProps {
    activeChatId: string | null;
    isWidgetOpen: boolean;
    isMinimized: boolean;
    headerInfo: HeaderInfo | null;
    openChat: (chatId: string, info?: HeaderInfo) => void;
    openWidget: () => void;
    closeChat: () => void;
    minimizeChat: () => void;
    maximizeChat: () => void;
    goBackToList: () => void;
}

const ChatContext = createContext<ChatContextProps | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [isWidgetOpen, setIsWidgetOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);

    // Initialize from localStorage
    useEffect(() => {
        const savedChatId = localStorage.getItem("activeChatId");
        const savedMinimized = localStorage.getItem("chatMinimized");
        const savedHeaderInfo = localStorage.getItem("chatHeaderInfo");

        if (savedChatId) {
            setActiveChatId(savedChatId);
            setIsWidgetOpen(true); // Should be open if there is an active ID

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
        // Note: We don't save activeChatId here as it's null (list view), 
        // but we might want to save that the widget is open? 
        // usage indicates this just opens the list.
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
        // We keep the widget open
    };

    return (
        <ChatContext.Provider
            value={{
                activeChatId,
                isWidgetOpen,
                isMinimized,
                headerInfo,
                openChat,
                openWidget,
                closeChat,
                minimizeChat,
                maximizeChat,
                goBackToList
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
