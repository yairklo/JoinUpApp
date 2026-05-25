import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import React, { useEffect } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useNotifications } from '@/hooks/useNotifications';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function NotificationsScreen() {
    const router = useRouter();
    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        refreshNotifications
    } = useNotifications();

    useEffect(() => {
        refreshNotifications();
    }, []);

    const handleNotificationPress = async (notification: any) => {
        if (!notification.read) {
            markAsRead(notification.id);
        }

        if (notification.data?.link) {
            // Need to parse string link to expo router path if necessary, 
            // but for now assuming compatible paths like /game/[id]
            try {
                router.push(notification.data.link);
            } catch (e) {
                console.error("Navigation failed", e);
            }
        }
    };

    const renderItem = ({ item }: { item: any }) => (
        <TouchableOpacity
            className={`flex-row p-4 border-b border-gray-100 ${!item.read ? 'bg-blue-50' : 'bg-white'}`}
            onPress={() => handleNotificationPress(item)}
        >
            <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${!item.read ? 'bg-blue-200' : 'bg-gray-100'}`}>
                <FontAwesome name="bell" size={16} color={!item.read ? '#1e40af' : '#9ca3af'} />
            </View>
            <View className="flex-1">
                <View className="flex-row justify-between mb-1">
                    <Text className={`text-base ${!item.read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                        {item.title}
                    </Text>
                    <Text className="text-xs text-gray-400 mt-1">
                        {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                </View>
                <Text className="text-gray-600 text-sm leading-5" numberOfLines={2}>
                    {item.body}
                </Text>
            </View>
            {!item.read && (
                <View className="justify-center pl-2">
                    <View className="w-2 h-2 rounded-full bg-blue-600" />
                </View>
            )}
        </TouchableOpacity>
    );

    return (
        <>
            <Stack.Screen
                options={{
                    title: 'Notifications',
                    headerRight: () => (
                        unreadCount > 0 ? (
                            <TouchableOpacity onPress={markAllAsRead}>
                                <Text className="text-blue-600 font-bold">Read All</Text>
                            </TouchableOpacity>
                        ) : null
                    )
                }}
            />
            <View className="flex-1 bg-white">
                {loading && notifications.length === 0 ? (
                    <View className="flex-1 justify-center items-center">
                        <ActivityIndicator size="large" color="#2563eb" />
                    </View>
                ) : (
                    <FlatList
                        data={notifications}
                        keyExtractor={item => item.id}
                        renderItem={renderItem}
                        refreshing={loading}
                        onRefresh={refreshNotifications}
                        ListEmptyComponent={
                            <View className="flex-1 justify-center items-center mt-20 px-10">
                                <View className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center mb-4">
                                    <FontAwesome name="bell-slash" size={24} color="#9ca3af" />
                                </View>
                                <Text className="text-gray-500 text-center text-lg">No notifications yet</Text>
                                <Text className="text-gray-400 text-center text-sm mt-2">
                                    We'll notify you when games are scheduled or friends message you.
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        </>
    );
}
