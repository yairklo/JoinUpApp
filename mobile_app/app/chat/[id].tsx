import { View, Text, TextInput, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, ActivityIndicator, Alert, Keyboard, Image } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, Stack, useRouter } from 'expo-router';
import { useChatLogic } from '@/hooks/useChatLogic';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import MessageBubble from '@/components/chat/MessageBubble';
import ReplyPreview from '@/components/chat/ReplyPreview';

export default function ChatScreen() {
    const { t } = useTranslation();
    const { id, name } = useLocalSearchParams<{ id: string, name?: string }>();
    const { user } = useUser();
    const router = useRouter();

    const {
        state: {
            messages, isLoading, inputValue, effectiveChatName,
            typingUsers, replyToMessage, editingMessage, isOtherUserOnline,
            avatarByUserId, nameByUserId, otherUserId
        },
        actions: {
            handleSendMessage, setInputValue, setReplyToMessage,
            setEditingMessage, handleDelete, handleReact,
            handleTyping, handleStopTyping
        }
    } = useChatLogic({ roomId: id, chatName: name });

    const flatListRef = useRef<FlatList>(null);
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        if (messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [messages]);

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription = Keyboard.addListener(showEvent, (e) => {
            setKeyboardHeight(e.endCoordinates.height);
        });
        const hideSubscription = Keyboard.addListener(hideEvent, () => {
            setKeyboardHeight(0);
        });
        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    useEffect(() => {
        if (keyboardHeight > 0 && messages.length > 0) {
            setTimeout(() => {
                flatListRef.current?.scrollToEnd({ animated: true });
            }, 100);
        }
    }, [keyboardHeight, messages.length]);

    const handleLongPress = (message: any) => {
        const isMe = message.userId === user?.id;

        const options = ["השב"];
        if (isMe) {
            options.push("ערוך", "מחק");
        }
        options.push("ביטול");

        Alert.alert(
            "אפשרויות הודעה",
            undefined,
            [
                { text: "השב", onPress: () => setReplyToMessage(message) },
                ...(isMe ? [
                    {
                        text: "ערוך", onPress: () => {
                            setEditingMessage(message);
                            setInputValue(message.text || message.content);
                        }
                    },
                    {
                        text: "מחק", style: 'destructive' as const, onPress: () => {
                            Alert.alert("מחק הודעה", "האם אתה בטוח?", [
                                { text: "ביטול", style: 'cancel' },
                                { text: "מחק", style: 'destructive', onPress: () => handleDelete(message.id) }
                            ]);
                        }
                    }
                ] : []),
                { text: "ביטול", style: 'cancel' }
            ]
        );
    };

    const renderMessage = ({ item, index }: { item: any, index: number }) => {
        const isMe = item.userId === user?.id;
        const showAvatar = !isMe && (index === 0 || messages[index - 1].userId !== item.userId);

        const enrichedMessage = {
            ...item,
            senderName: item.senderName || item.sender?.name || nameByUserId[item.userId] || "User",
            sender: {
                ...item.sender,
                image: item.sender?.image || avatarByUserId[item.userId],
                name: item.sender?.name || nameByUserId[item.userId]
            }
        };

        return (
            <MessageBubble
                message={enrichedMessage}
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
        <SafeAreaView className="flex-1 bg-white" edges={['top', 'bottom']}>
            <Stack.Screen options={{ headerShown: false }} />
            
            {/* Custom Header */}
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100 shadow-sm z-10">
                <TouchableOpacity onPress={() => router.back()} className="ml-4 p-2 -mr-2 rounded-full active:bg-gray-100">
                    <Ionicons name="arrow-back" size={26} color="#111827" />
                </TouchableOpacity>

                <View className="flex-row items-center flex-1">
                    {otherUserId && avatarByUserId[otherUserId] ? (
                        <Image source={{ uri: avatarByUserId[otherUserId]! }} style={{ width: 44, height: 44, borderRadius: 22, marginLeft: 12 }} />
                    ) : (
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#E5E7EB', marginLeft: 12, alignItems: 'center', justifyContent: 'center' }}>
                            <Ionicons name="chatbubbles" size={24} color="#9CA3AF" />
                        </View>
                    )}
                    <View className="justify-center flex-1">
                        <Text className="font-black text-gray-900 text-xl text-left" numberOfLines={1}>{effectiveChatName}</Text>
                        {isOtherUserOnline && (
                            <View className="flex-row items-center mt-1">
                                <View className="w-2 h-2 rounded-full bg-green-500 ml-1.5" />
                                <Text className="text-xs text-gray-500 font-bold uppercase">מחובר כעת</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                className="flex-1"
                keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
                style={Platform.OS === 'android' ? { paddingBottom: keyboardHeight } : {}}
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
                            {Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} מקליד/ים...
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
                        <Text className="flex-1 mr-2 text-blue-600 text-left text-xs font-bold">עורך הודעה</Text>
                        <TouchableOpacity onPress={() => { setEditingMessage(null); setInputValue(""); }}>
                            <Ionicons name="close-circle" size={20} color="#2563eb" />
                        </TouchableOpacity>
                    </View>
                )}

                <View className="p-4 border-t border-gray-100 flex-row items-end bg-white">
                    <View className="flex-1 bg-gray-50 rounded-3xl px-4 py-2 ml-3 flex-row items-end min-h-[44px] border border-gray-100 shadow-sm shadow-gray-100">
                        <TextInput
                            value={inputValue}
                            onChangeText={(text) => {
                                setInputValue(text);
                                if (text.length > 0) handleTyping();
                                else handleStopTyping();
                            }}
                            placeholder="תכתוב משהו נחמד..."
                            placeholderTextColor="#9ca3af"
                            className="flex-1 text-gray-900 text-base max-h-32 text-left"
                            multiline
                            textAlignVertical="bottom"
                        />
                        <TouchableOpacity className="mr-2 mb-1 p-1">
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
