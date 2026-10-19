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

export type MessageStatus = "pending" | "failed" | "sent" | "delivered" | "read" | "rejected" | "blocked";

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
    /** Only meaningful when status === 'failed': false => no retry (e.g. forbidden). */
    retryable?: boolean;
    /** Server reason code from messageFailed (MESSAGE_TOO_LONG, RATE_LIMITED, ...). */
    failCode?: string;
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