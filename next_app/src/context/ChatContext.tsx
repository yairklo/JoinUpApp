"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";

interface ChatContextProps {
    activeChatId: string | null;
    isMinimized: boolean;
    openChat: (chatId: string) => void;
    closeChat: () => void;
    minimizeChat: () => void;
    maximizeChat: () => void;
}

const ChatContext = createContext<ChatContextProps | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);

    const openChat = (chatId: string) => {
        setActiveChatId(chatId);
        setIsMinimized(false);
    };

    const closeChat = () => {
        setActiveChatId(null);
        setIsMinimized(false);
    };

    const minimizeChat = () => setIsMinimized(true);
    const maximizeChat = () => setIsMinimized(false);

    return (
        <ChatContext.Provider
            value={{ activeChatId, isMinimized, openChat, closeChat, minimizeChat, maximizeChat }}
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
