import React, { memo } from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { ChatMessage } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";

interface MessageBubbleProps {
    message: ChatMessage;
    isMe: boolean;
    showAvatar: boolean;
    displayName?: string;
    displayAvatar?: string | null;
    onLongPress?: (message: ChatMessage) => void;
    onPressUser?: (userId: string) => void;
}

function MessageBubble({
    message,
    isMe,
    showAvatar,
    displayName,
    displayAvatar,
    onLongPress,
    onPressUser,
}: MessageBubbleProps) {
    const reactionsList = Object.entries(message.reactions || {});
    const hasReactions = reactionsList.length > 0;
    const senderId = message.userId || message.senderId || message.sender?.id;
    const senderName = displayName || message.senderName || message.sender?.name || "User";
    const avatarUri =
        displayAvatar ||
        message.sender?.image ||
        "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y";

    const handlePressUser = () => {
        if (senderId && onPressUser) onPressUser(String(senderId));
    };

    return (
        <View className={`flex-row mb-3 px-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
            {!isMe && (
                <View className="w-8 mr-2 justify-end pb-1">
                    {showAvatar ? (
                        <TouchableOpacity onPress={handlePressUser} disabled={!senderId || !onPressUser} activeOpacity={0.7}>
                            <Image
                                source={{ uri: avatarUri }}
                                className="w-8 h-8 rounded-full bg-gray-100 border border-gray-100"
                            />
                        </TouchableOpacity>
                    ) : null}
                </View>
            )}

            <TouchableOpacity
                onLongPress={() => onLongPress?.(message)}
                activeOpacity={0.9}
                className={`max-w-[75%] px-4 py-3 rounded-3xl ${isMe
                        ? 'bg-brand rounded-tr-none shadow-sm shadow-brand-pale'
                        : 'bg-gray-100 rounded-tl-none border border-gray-50'
                    }`}
            >
                {message.replyTo && (
                    <View className={`mb-2 p-2 rounded-xl border-l-4 ${isMe ? 'bg-brand-dark/50 border-brand-light' : 'bg-gray-200 border-gray-400'}`}>
                        <Text className={`text-[10px] font-bold ${isMe ? 'text-brand-pale' : 'text-gray-500'}`}>
                            {message.replyTo.senderName || "User"}
                        </Text>
                        <Text className={`text-xs ${isMe ? 'text-brand-mist' : 'text-gray-600'}`} numberOfLines={1}>
                            {message.replyTo.text}
                        </Text>
                    </View>
                )}

                {!isMe && showAvatar && (
                    <TouchableOpacity onPress={handlePressUser} disabled={!senderId || !onPressUser} activeOpacity={0.7}>
                        <Text className="text-[10px] font-black text-gray-400 mb-1 uppercase tracking-tighter">
                            {senderName}
                        </Text>
                    </TouchableOpacity>
                )}

                <Text className={`text-base leading-5 ${isMe ? 'text-white' : 'text-gray-900'}`}>
                    {message.isDeleted ? "[Content Removed]" : (message.text || message.content)}
                </Text>

                <View className="flex-row items-center justify-end mt-1">
                    {message.isEdited && !message.isDeleted && (
                        <Text className={`text-[9px] mr-1 ${isMe ? 'text-brand-pale' : 'text-gray-400'}`}>Edited</Text>
                    )}
                    <Text className={`text-[9px] font-medium ${isMe ? 'text-brand-pale' : 'text-gray-400'}`}>
                        {new Date(message.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    {isMe && (
                        <View className="ml-1">
                            <Ionicons
                                name={message.status === 'read' ? "checkmark-done" : "checkmark"}
                                size={12}
                                color={message.status === 'read' ? "#93c5fd" : "#bfdbfe"}
                            />
                        </View>
                    )}
                </View>

                {hasReactions && (
                    <View className="flex-row flex-wrap mt-2 -mb-1">
                        {reactionsList.map(([emoji, users]) => (
                            <View
                                key={emoji}
                                className="flex-row items-center bg-white/90 px-2 py-0.5 rounded-full mr-1 mb-1 border border-gray-200 shadow-sm"
                            >
                                <Text className="text-xs">{emoji}</Text>
                                <Text className="text-[10px] ml-1 font-bold text-gray-500">{(users as any[]).length}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );
}

export default memo(MessageBubble, (prev, next) => (
    prev.isMe === next.isMe &&
    prev.showAvatar === next.showAvatar &&
    prev.displayName === next.displayName &&
    prev.displayAvatar === next.displayAvatar &&
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.message.isEdited === next.message.isEdited &&
    prev.message.isDeleted === next.message.isDeleted &&
    prev.message.reactions === next.message.reactions &&
    prev.onPressUser === next.onPressUser &&
    prev.onLongPress === next.onLongPress
));
