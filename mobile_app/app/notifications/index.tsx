import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { useNotifications } from '@/context/NotificationContext';
import { notificationsApi, type Notification, type NotificationSettingsUpdate } from '@/services/api/notifications';
import { chatsApi } from '@/services/api/chats';
import LoadingMotif from '@/components/loading/LoadingMotif';
import { formatNotificationDate, getNotificationKey } from '@/utils/notificationDisplay';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
    NOTIFICATION_CATEGORIES,
    CATEGORY_BY_NOTIFICATION_TYPE,
    ALWAYS_DELIVERED_TYPES,
    QUICK_OFF_EXCLUDED_CATEGORIES,
} from '@joinup/shared/notificationPrefs';

export default function NotificationsScreen() {
    const router = useRouter();
    const { t } = useTranslation();
    const { userId } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        refreshNotifications
    } = useNotifications();

    const [showCityPrompt, setShowCityPrompt] = useState(false);
    const cityPromptChecked = useRef(false);
    const hasCityNotification = notifications.some(n => n.type === 'NEW_GAME_IN_CITY');

    // One-time suggestion: city games arrive in-app only by default. When the user is looking
    // at one, offer push for them — once (the answer is stored server-side).
    useEffect(() => {
        if (!hasCityNotification || cityPromptChecked.current) return;
        cityPromptChecked.current = true;
        (async () => {
            try {
                const token = await getTokenRef.current();
                if (!token) return;
                const s = await notificationsApi.getSettings(token);
                setShowCityPrompt(s.pushEnabled && !s.cityGamesPush && !s.cityPromptDismissedAt);
            } catch (error) {
                console.error('[NOTIFICATIONS] Failed to load settings for city prompt:', error);
            }
        })();
    }, [hasCityNotification, getTokenRef]);

    const answerCityPrompt = async (enable: boolean) => {
        setShowCityPrompt(false);
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            await notificationsApi.updateSettings(
                { cityPromptDismissedAt: new Date().toISOString(), ...(enable ? { cityGamesPush: true } : {}) },
                token
            );
        } catch (error) {
            console.error('[NOTIFICATIONS] Failed to save city prompt answer:', error);
        }
    };

    const withToken = async (fn: (token: string) => Promise<unknown>, doneText: string) => {
        try {
            const token = await getTokenRef.current();
            if (!token) return;
            await fn(token);
            Alert.alert(doneText);
        } catch (error) {
            console.error('[NOTIFICATIONS] Preference action failed:', error);
            Alert.alert(t('common.error', 'שגיאה'), t('notificationSettings.actionFailed'));
        }
    };

    const showOptions = (item: Notification) => {
        const cat = NOTIFICATION_CATEGORIES.find(c => c.key === CATEGORY_BY_NOTIFICATION_TYPE[item.type]);
        if (!cat || ALWAYS_DELIVERED_TYPES.includes(item.type)) {
            router.push('/settings/notifications' as any);
            return;
        }
        const actorId = typeof item.data?.actorId === 'string' && item.data.actorId !== userId ? item.data.actorId : null;
        const gameId = typeof item.data?.gameId === 'string' ? item.data.gameId : null;
        const off: NotificationSettingsUpdate = { [cat.pushField]: false, ...(cat.inAppField ? { [cat.inAppField]: false } : {}) };
        const canTurnOff = !QUICK_OFF_EXCLUDED_CATEGORIES.includes(cat.key);
        Alert.alert(item.title || t('notifications.title'), undefined, [
            ...(canTurnOff ? [{ text: t('notificationSettings.turnOffLikeThis'), onPress: () => withToken(tk => notificationsApi.updateSettings(off, tk), t('notificationSettings.turnedOff')) }] : []),
            ...(actorId ? [{ text: t('notificationSettings.muteThisUser'), onPress: () => withToken(tk => notificationsApi.mute('USER', actorId, null, tk), t('notificationSettings.mutedDone')) }] : []),
            ...(gameId ? [{ text: t('notificationSettings.muteThisGame'), onPress: () => withToken(tk => notificationsApi.mute('GAME', gameId, null, tk), t('notificationSettings.mutedDone')) }] : []),
            { text: t('notificationSettings.allSettings'), onPress: () => router.push('/settings/notifications' as any) },
            { text: t('common.cancel', 'ביטול'), style: 'cancel' as const },
        ]);
    };
    // renderItem is memoized on [t]; read the latest handler through a ref.
    const showOptionsRef = useRef(showOptions);
    showOptionsRef.current = showOptions;

    const handleDirectMessage = async (userId: string) => {
        try {
            const token = await getTokenRef.current();
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
        } else if (notification.type === 'FRIEND_REQUEST') {
            target = '/friends';
        } else if (notification.type === 'FRIEND_ACCEPTED' && notification.data?.userId) {
            target = `/user/${notification.data.userId}`;
        } else if (link) {
            // Older notifications stored /profile/:id, which has no route in the app (it is /user/:id).
            const legacyProfile = link.match(/^\/profile\/([^/?#]+)$/);
            target = legacyProfile && legacyProfile[1] !== 'settings'
                ? `/user/${legacyProfile[1]}`
                : link.startsWith('/game/') || link.startsWith('/chat/')
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
                onLongPress={() => showOptionsRef.current(item)}
                delayLongPress={350}
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
                                if (item.data?.userId) handleDirectMessage(item.data.userId);
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
                        <View className="flex-row items-center">
                            {unreadCount > 0 ? (
                                <TouchableOpacity onPress={markAllAsRead} className="mr-4">
                                    <Text className="text-brand font-bold">{t('notifications.readAll')}</Text>
                                </TouchableOpacity>
                            ) : null}
                            <TouchableOpacity
                                onPress={() => router.push('/settings/notifications' as any)}
                                accessibilityLabel={t('notificationSettings.allSettings')}
                            >
                                <FontAwesome name="cog" size={20} color="#4b5563" />
                            </TouchableOpacity>
                        </View>
                    )
                }}
            />
            <View className="flex-1 bg-white">
                {showCityPrompt && (
                    <View className="m-3 p-3 rounded-xl bg-brand-mist border border-brand-pale">
                        <Text className="text-gray-800 font-bold mb-2">{t('notificationSettings.cityPromptTitle')}</Text>
                        <View className="flex-row">
                            <TouchableOpacity onPress={() => answerCityPrompt(true)} className="bg-brand px-4 py-2 rounded-lg mr-2">
                                <Text className="text-white font-bold">{t('notificationSettings.cityPromptYes')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => answerCityPrompt(false)} className="px-4 py-2 rounded-lg">
                                <Text className="text-gray-600 font-bold">{t('notificationSettings.cityPromptNo')}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                )}
                {loading && notifications.length === 0 ? (
                    <View className="flex-1 justify-center items-center">
                        <LoadingMotif id="message-stack" label={t('notifications.loadingNotifications', 'טוען התראות…')} />
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
