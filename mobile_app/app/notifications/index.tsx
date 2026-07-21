import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useCallback } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { useNotifications } from '@/context/NotificationContext';
import type { Notification } from '@/services/api/notifications';
import { chatsApi } from '@/services/api/chats';
import { formatNotificationDate, getNotificationKey } from '@/utils/notificationDisplay';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function NotificationsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        refreshNotifications
    } = useNotifications();

    const handleDirectMessage = async (userId: string) => {
        try {
            const token = await getToken();
            if (!token) return;
            const res = await chatsApi.createPrivate(userId, token);
            if (res && res.chatId) {
                router.push(`/chat/${res.chatId}` as any);
            }
        } catch (error) {
            console.error('Failed to create/open private chat:', error);
        }
    };

    const handleNotificationPress = async (notification: Notification) => {
        if (!notification.read) {
            markAsRead(notification.id);
        }

        const chatId = notification.data?.chatId;
        const gameId = notification.data?.gameId;
        const link = notification.data?.link;

        let target: string | undefined;
        if (chatId) {
            target = `/chat/${chatId}`;
        } else if (gameId) {
            target = `/game/${gameId}`;
        } else if (link) {
            target = link.startsWith('/game/') || link.startsWith('/chat/')
                ? link
                : link.replace(/^\/games\//, '/game/');
        }

        if (target) {
            try {
                router.push(target as any);
            } catch (e) {
                console.error('Navigation failed', e);
            }
        }
    };

    const keyExtractor = useCallback(
        (item: Notification, index: number) => getNotificationKey(item, index),
        []
    );

    const renderItem = useCallback(({ item }: { item: Notification }) => {
        const title = item.title?.trim() || t('notifications.fallbackTitle', 'התראה');
        const body = item.body?.trim() || t('notifications.fallbackBody', 'אין פרטים נוספים');
        const dateLabel = formatNotificationDate(item.createdAt);

        return (
            <TouchableOpacity
                className={`flex-row p-3 border-b border-gray-100 ${!item.read ? 'bg-brand-mist' : 'bg-white'}`}
                onPress={() => handleNotificationPress(item)}
            >
                <View className={`w-8 h-8 rounded-full items-center justify-center mr-3 ${!item.read ? 'bg-brand-pale' : 'bg-gray-100'}`}>
                    <FontAwesome
                        name={item.type === 'NEW_MESSAGE' ? 'comment' : 'bell'}
                        size={16}
                        color={!item.read ? '#1e40af' : '#9ca3af'}
                    />
                </View>
                <View className="flex-1">
                    <View className="flex-row justify-between mb-1">
                        <Text className={`text-base flex-1 mr-2 ${!item.read ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
                            {title}
                        </Text>
                        {dateLabel ? (
                            <Text className="text-xs text-gray-400 mt-1">{dateLabel}</Text>
                        ) : null}
                    </View>
                    <Text className="text-gray-600 text-sm leading-5" numberOfLines={2}>
                        {body}
                    </Text>
                    {item.data?.userId && (
                        <TouchableOpacity
                            className="mt-2 bg-brand-mist py-1.5 px-3 rounded self-start border border-brand-pale"
                            onPress={(e) => {
                                e.stopPropagation();
                                handleDirectMessage(item.data.userId);
                            }}
                        >
                            <Text className="text-brand-dark text-sm font-medium">{t('notifications.sendMessage', 'שלח הודעה')}</Text>
                        </TouchableOpacity>
                    )}
                </View>
                {!item.read && (
                    <View className="justify-center pl-2">
                        <View className="w-2 h-2 rounded-full bg-brand" />
                    </View>
                )}
            </TouchableOpacity>
        );
    }, [t]);

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: t('notifications.title'),
                    headerRight: () => (
                        unreadCount > 0 ? (
                            <TouchableOpacity onPress={markAllAsRead}>
                                <Text className="text-brand font-bold">{t('notifications.readAll')}</Text>
                            </TouchableOpacity>
                        ) : null
                    )
                }}
            />
            <View className="flex-1 bg-white">
                {loading && notifications.length === 0 ? (
                    <View className="flex-1 justify-center items-center">
                        <ActivityIndicator size="large" color="#059669" />
                    </View>
                ) : (
                    <FlatList
                        data={notifications}
                        keyExtractor={keyExtractor}
                        renderItem={renderItem}
                        refreshing={loading}
                        onRefresh={refreshNotifications}
                        contentContainerStyle={{ paddingBottom: 80 }}
                        ListEmptyComponent={
                            <View className="flex-1 justify-center items-center mt-20 px-10">
                                <View className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center mb-4">
                                    <FontAwesome name="bell-slash" size={24} color="#9ca3af" />
                                </View>
                                <Text className="text-gray-500 text-center text-lg">{t('notifications.empty')}</Text>
                                <Text className="text-gray-400 text-center text-sm mt-2">
                                    {t('notifications.emptyDesc')}
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        </>
    );
}
