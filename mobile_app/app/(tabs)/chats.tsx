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

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            className="flex-row items-center p-4 bg-white border-b border-gray-100"
            onPress={() => router.push(`/chat/${item.id}`)}
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
            <FlatList
                data={chats}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                }
                ListEmptyComponent={
                    <View className="items-center justify-center py-20">
                        <Text className="text-gray-400 text-lg">No conversations yet</Text>
                    </View>
                }
            />
        </View>
    );
}
