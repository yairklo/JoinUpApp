"use client";

import React, { createContext, useContext, ReactNode } from "react";
import { useNotificationCounters as useNotificationCountersHook } from "@/hooks/useNotificationCounters";

interface NotificationCountersContextProps {
    friendRequests: number;
    unreadMessages: number;
    refreshCounters: () => Promise<void>;
}

const NotificationCountersContext = createContext<NotificationCountersContextProps | undefined>(undefined);

export const NotificationCountersProvider = ({ children }: { children: ReactNode }) => {
    const value = useNotificationCountersHook();
    return (
        <NotificationCountersContext.Provider value={value}>
            {children}
        </NotificationCountersContext.Provider>
    );
};

export const useNotificationCounters = () => {
    const context = useContext(NotificationCountersContext);
    if (!context) {
        throw new Error("useNotificationCounters must be used within a NotificationCountersProvider");
    }
    return context;
};
