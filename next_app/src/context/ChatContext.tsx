"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

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

    const openChat = (chatId: string, info?: HeaderInfo) => {
        setActiveChatId(chatId);
        if (info) setHeaderInfo(info);
        else setHeaderInfo(null);
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

    const minimizeChat = () => setIsMinimized(true);
    const maximizeChat = () => setIsMinimized(false);

    const goBackToList = () => {
        setActiveChatId(null);
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
