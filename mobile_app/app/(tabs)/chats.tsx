import { View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, RefreshControl } from 'react-native';
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { chatsApi } from '@/services/api';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

export default function ChatsScreen() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const router = useRouter();

    const [chats, setChats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const [tabValue, setTabValue] = useState(0); // 0 = private, 1 = group

    const fetchChats = async () => {
        if (!user) return;
        try {
            const token = await getToken();
            if (!token) return;
            const data = await chatsApi.getUserChats(user.id, token);
            setChats(data);
        } catch (error) {
            console.error("Failed to fetch chats", error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (isLoaded) fetchChats();
        }, [isLoaded, user])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchChats();
    };

    const filteredChats = chats.filter((chat) =>
        tabValue === 0 ? chat.type === 'private' : chat.type === 'group'
    );

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            className="flex-row items-center p-4 bg-white border-b border-gray-100"
            onPress={() => {
                // Keep the same routing behavior. If the user wants to go to the game profile, it would be /game/[id]. But for chat, we use /chat/[id]
                router.push(`/chat/${item.id}`);
            }}
        >
            <Image
                source={{ uri: item.image || "https://ui-avatars.com/api/?name=" + item.name }}
                className="w-12 h-12 rounded-full bg-gray-200"
            />
            <View className="flex-1 ml-4 justify-center">
                <View className="flex-row justify-between mb-1">
                    <Text className="text-gray-900 font-bold text-base" numberOfLines={1}>{item.name}</Text>
                    {item.lastMessage && (
                        <Text className="text-gray-400 text-xs">
                            {new Date(item.lastMessage.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </Text>
                    )}
                </View>
                <View className="flex-row justify-between items-center">
                    <Text className="text-gray-500 text-sm flex-1 mr-2" numberOfLines={1}>
                        {item.lastMessage ? (
                            (item.lastMessage.senderId === user?.id ? "You: " : "") + item.lastMessage.text
                        ) : "No messages yet"}
                    </Text>
                    {item.unreadCount > 0 && (
                        <View className="bg-blue-600 rounded-full px-2 py-0.5">
                            <Text className="text-white text-xs font-bold">{item.unreadCount}</Text>
                        </View>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );

    if (loading && !refreshing) {
        return (
            <View className="flex-1 justify-center items-center">
                <ActivityIndicator size="large" color="#2563eb" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50">
            {/* Custom Tabs */}
            <View className="flex-row bg-white border-b border-gray-200">
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 0 ? 'border-blue-600' : 'border-transparent'}`}
                    onPress={() => setTabValue(0)}
                >
                    <Text className={`font-bold ${tabValue === 0 ? 'text-blue-600' : 'text-gray-500'}`}>שחקנים</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    className={`flex-1 py-4 items-center border-b-2 ${tabValue === 1 ? 'border-blue-600' : 'border-transparent'}`}
                    onPress={() => setTabValue(1)}
                >
                    <Text className={`font-bold ${tabValue === 1 ? 'text-blue-600' : 'text-gray-500'}`}>משחקים</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                data={filteredChats}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View className="items-center justify-center py-20">
                        <Text className="text-gray-400 text-lg">
                            {tabValue === 0 ? "אין צ'אטים פעילים עם שחקנים" : "לא נרשמת לאף משחק"}
                        </Text>
                    </View>
                }
            />
        </View>
    );
}
