export interface ChatMessage {
    id: string | number;
    text: string;
    senderId: string;
    ts: string;
    roomId: string;
    userId?: string;
    replyTo?: any;
    reactions?: Record<string, any>; // Consider typing this better if possible
    status: string;
    isEdited?: boolean;
    isDeleted?: boolean;

    // Properties used in useChatLogic.ts
    tempId?: string | number;
    senderName?: string;
    sender?: {
        id?: string;
        name?: string;
        image?: string;
    };
    content?: string; // Sometimes used interchangeably with text
}

export interface Reaction {
    userId: string;
    emoji: string;
    ts?: string;
}

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'rejected' | string;
