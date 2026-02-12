import React from "react";
import { View, Text, Image, TouchableOpacity, ViewStyle } from "react-native";
import { ChatMessage } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";

interface MessageBubbleProps {
    message: ChatMessage;
    isMe: boolean;
    showAvatar: boolean;
    onLongPress?: () => void;
}

export default function MessageBubble({ message, isMe, showAvatar, onLongPress }: MessageBubbleProps) {
    const reactionsList = Object.entries(message.reactions || {});
    const hasReactions = reactionsList.length > 0;

    return (
        <View className={`flex-row mb-3 px-4 ${isMe ? 'justify-end' : 'justify-start'}`}>
            {!isMe && (
                <View className="w-8 mr-2 justify-end pb-1">
                    {showAvatar ? (
                        <Image
                            source={{ uri: message.sender?.image || "https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y" }}
                            className="w-8 h-8 rounded-full bg-gray-100 border border-gray-100"
                        />
                    ) : null}
                </View>
            )}

            <TouchableOpacity
                onLongPress={onLongPress}
                activeOpacity={0.9}
                className={`max-w-[75%] px-4 py-3 rounded-3xl ${isMe
                        ? 'bg-blue-600 rounded-tr-none shadow-sm shadow-blue-200'
                        : 'bg-gray-100 rounded-tl-none border border-gray-50'
                    }`}
            >
                {/* Reply Section */}
                {message.replyTo && (
                    <View className={`mb-2 p-2 rounded-xl border-l-4 ${isMe ? 'bg-blue-700/50 border-blue-300' : 'bg-gray-200 border-gray-400'}`}>
                        <Text className={`text-[10px] font-bold ${isMe ? 'text-blue-100' : 'text-gray-500'}`}>
                            {message.replyTo.senderName || "User"}
                        </Text>
                        <Text className={`text-xs ${isMe ? 'text-blue-50' : 'text-gray-600'}`} numberOfLines={1}>
                            {message.replyTo.text}
                        </Text>
                    </View>
                )}

                {!isMe && showAvatar && (
                    <Text className="text-[10px] font-black text-gray-400 mb-1 uppercase tracking-tighter">
                        {message.senderName || message.sender?.name || "User"}
                    </Text>
                )}

                <Text className={`text-base leading-5 ${isMe ? 'text-white' : 'text-gray-900'}`}>
                    {message.isDeleted ? "[Content Removed]" : (message.text || message.content)}
                </Text>

                <View className="flex-row items-center justify-end mt-1">
                    {message.isEdited && !message.isDeleted && (
                        <Text className={`text-[9px] mr-1 ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>Edited</Text>
                    )}
                    <Text className={`text-[9px] font-medium ${isMe ? 'text-blue-200' : 'text-gray-400'}`}>
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

                {/* Reactions */}
                {hasReactions && (
                    <View className="flex-row flex-wrap mt-2 -mb-1">
                        {reactionsList.map(([emoji, users]) => (
                            <View
                                key={emoji}
                                className={`flex-row items-center bg-white/90 px-2 py-0.5 rounded-full mr-1 mb-1 border border-gray-200 shadow-sm`}
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
