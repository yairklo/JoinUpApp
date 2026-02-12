import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ChatMessage } from "@/types/chat";
import { Ionicons } from "@expo/vector-icons";

interface ReplyPreviewProps {
    message: ChatMessage | null;
    onCancel: () => void;
}

export default function ReplyPreview({ message, onCancel }: ReplyPreviewProps) {
    if (!message) return null;

    return (
        <View className="flex-row items-center bg-gray-50 p-3 border-t border-gray-100">
            <View className="w-1 bg-blue-600 h-full rounded-full mr-3" />
            <View className="flex-1">
                <Text className="text-xs font-black text-blue-600 uppercase tracking-tighter">
                    Replying to {message.sender?.name || message.senderName || "User"}
                </Text>
                <Text className="text-gray-500 text-xs" numberOfLines={1}>
                    {message.text || message.content}
                </Text>
            </View>
            <TouchableOpacity onPress={onCancel} className="p-1">
                <Ionicons name="close-circle" size={20} color="#9ca3af" />
            </TouchableOpacity>
        </View>
    );
}
