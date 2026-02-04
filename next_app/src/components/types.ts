export type Reaction = {
    emoji: string;
    count: number;
    userIds: string[];
};

export type ReplyInfo = {
    id: number | string;
    text: string;
    senderName?: string;
    senderId?: string;
    userId?: string;
    sender?: {
        name?: string;
        image?: string | null;
        id?: string;
    };
};

export type MessageStatus = "sent" | "delivered" | "read" | "rejected";

export type ChatMessage = {
    id: number | string;
    text: string;
    senderId: string;
    senderName?: string;
    ts: string;
    userId?: string;
    roomId?: string;
    replyTo?: ReplyInfo;
    reactions?: Record<string, Reaction>;
    status?: MessageStatus;
    isEdited?: boolean;
    isDeleted?: boolean;
    content?: string;
    sender?: {
        id?: string;
        name?: string;
        image?: string | null;
    };
    tempId?: string | number;
};