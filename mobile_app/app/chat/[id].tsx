import { View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useChatLogic } from '@/hooks/useChatLogic';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import MessageBubble from '@/components/chat/MessageBubble';
import ReplyPreview from '@/components/chat/ReplyPreview';

export default function ChatScreen() {
    const { id, name } = useLocalSearchParams<{ id: string, name?: string }>();
    const { user } = useUser();

    const {
        state: {
            messages, isLoading, inputValue, effectiveChatName,
            typingUsers, replyToMessage, editingMessage, isOtherUserOnline
        },
        actions: {
            handleSendMessage, setInputValue, setReplyToMessage,
            setEditingMessage, handleDelete, handleReact
        }
    } = useChatLogic({ roomId: id, chatName: name });

    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    const handleLongPress = (message: any) => {
        const isMe = message.userId === user?.id;

        const options = ["Reply"];
        if (isMe) {
            options.push("Edit", "Delete");
        }
        options.push("Cancel");

        Alert.alert(
            "Message Options",
            undefined,
            [
                { text: "Reply", onPress: () => setReplyToMessage(message) },
                ...(isMe ? [
                    {
                        text: "Edit", onPress: () => {
                            setEditingMessage(message);
                            setInputValue(message.text || message.content);
                        }
                    },
                    {
                        text: "Delete", style: 'destructive' as const, onPress: () => {
                            Alert.alert("Delete Message", "Are you sure?", [
                                { text: "Cancel", style: 'cancel' },
                                { text: "Delete", style: 'destructive', onPress: () => handleDelete(message.id) }
                            ]);
                        }
                    }
                ] : []),
                { text: "Cancel", style: 'cancel' }
            ]
        );
    };

    const renderMessage = ({ item, index }: { item: any, index: number }) => {
        const isMe = item.userId === user?.id;
        const showAvatar = !isMe && (index === 0 || messages[index - 1].userId !== item.userId);

        return (
            <MessageBubble
                message={item}
                isMe={isMe}
                showAvatar={showAvatar}
                onLongPress={() => handleLongPress(item)}
            />
        );
    };

    if (isLoading && messages.length === 0) {
        return (
            <View className="flex-1 justify-center items-center bg-white">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <SafeAreaView className="flex-1 bg-white" edges={['bottom']}>
            <Stack.Screen
                options={{
                    headerTitle: () => (
                        <View className="items-center">
                            <Text className="font-black text-gray-900 text-lg">{effectiveChatName}</Text>
                            {isOtherUserOnline && (
                                <View className="flex-row items-center">
                                    <View className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1" />
                                    <Text className="text-[10px] text-gray-400 font-bold uppercase">Online Now</Text>
                                </View>
                            )}
                        </View>
                    ),
                    headerTitleAlign: 'center',
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: 'white' }
                }}
            />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
            >
                <FlatList
                    ref={flatListRef}
                    data={messages}
                    keyExtractor={(item) => String(item.id || Math.random())}
                    renderItem={renderMessage}
                    contentContainerStyle={{ paddingVertical: 20 }}
                    onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                />

                {/* Typing Indicator */}
                {typingUsers.size > 0 && (
                    <View className="px-5 py-1">
                        <Text className="text-[10px] italic text-gray-400 font-medium">
                            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                        </Text>
                    </View>
                )}

                <ReplyPreview
                    message={replyToMessage}
                    onCancel={() => setReplyToMessage(null)}
                />

                {editingMessage && (
                    <View className="flex-row items-center bg-blue-50 p-3 border-t border-blue-100">
                        <Ionicons name="pencil" size={16} color="#2563eb" />
                        <Text className="flex-1 ml-2 text-blue-600 text-xs font-bold">Editing Message</Text>
                        <TouchableOpacity onPress={() => { setEditingMessage(null); setInputValue(""); }}>
                            <Ionicons name="close-circle" size={20} color="#2563eb" />
                        </TouchableOpacity>
                    </View>
                )}

                <View className="p-4 border-t border-gray-100 flex-row items-end bg-white">
                    <View className="flex-1 bg-gray-50 rounded-3xl px-4 py-2 mr-3 flex-row items-end min-h-[44px] border border-gray-100 shadow-sm shadow-gray-100">
                        <TextInput
                            value={inputValue}
                            onChangeText={setInputValue}
                            placeholder="תכתוב משהו נחמד..."
                            placeholderTextColor="#9ca3af"
                            className="flex-1 text-gray-900 text-base max-h-32"
                            multiline
                            textAlignVertical="bottom"
                        />
                        <TouchableOpacity className="ml-2 mb-1 p-1">
                            <Ionicons name="happy-outline" size={24} color="#9ca3af" />
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                        onPress={handleSendMessage}
                        disabled={!inputValue.trim()}
                        style={{ width: 48, height: 48 }}
                        className={`rounded-full items-center justify-center shadow-lg ${inputValue.trim() ? 'bg-blue-600 shadow-blue-200' : 'bg-gray-200 shadow-none'
                            }`}
                    >
                        <Ionicons
                            name={editingMessage ? "checkmark" : "send"}
                            size={20}
                            color="white"
                            style={!editingMessage ? { marginLeft: 2 } : {}}
                        />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
