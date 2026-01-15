export type Reaction = {
    emoji: string;
    count: number;
    userIds: string[];
};

export type ReplyInfo = {
    id: number | string;
    text: string;
    senderName: string;
};

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
};