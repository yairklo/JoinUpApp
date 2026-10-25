import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { usersApi, type BlockedUser } from '@/services/api/users';
import SafeImage from '@/components/SafeImage';
import { appAlert } from '@/i18n/appAlert';

export default function BlockedUsersScreen() {
    const { t } = useTranslation();
    const { getToken } = useAuth();
    const [items, setItems] = useState<BlockedUser[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const token = await getToken();
            if (!token) return;
            setItems(await usersApi.getBlockedUsers(token));
        } catch (e) {
            console.error('[BLOCKED] load failed', e);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => { load(); }, [load]);

    const unblock = async (userId: string) => {
        try {
            const token = await getToken();
            if (!token) return;
            await usersApi.unblockUser(userId, token);
            setItems((prev) => prev.filter((b) => b.id !== userId));
        } catch {
            appAlert(t('common.error', 'שגיאה'), t('profile.blockFailed', 'הפעולה נכשלה. נסו שוב.'));
        }
    };

    return (
        <>
            <Stack.Screen options={{ title: t('settings.blockedUsers', 'משתמשים חסומים'), headerShown: true }} />
            <View className="flex-1 bg-gray-50">
                {loading ? (
                    <ActivityIndicator className="mt-10" color="#059669" />
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={(b) => b.id}
                        contentContainerStyle={{ padding: 16 }}
                        ListEmptyComponent={
                            <Text className="text-center text-gray-500 mt-10">
                                {t('settings.noBlockedUsers', 'לא חסמתם אף משתמש.')}
                            </Text>
                        }
                        renderItem={({ item }) => (
                            <View className="bg-white rounded-xl p-3 mb-3 flex-row items-center border border-gray-100">
                                {item.imageUrl ? (
                                    <SafeImage source={{ uri: item.imageUrl }} className="w-10 h-10 rounded-full bg-gray-200" />
                                ) : (
                                    <View className="w-10 h-10 rounded-full bg-gray-200" />
                                )}
                                <Text className="flex-1 mx-3 text-base text-gray-900 text-left">{item.name || t('chat.thisUser', 'משתמש')}</Text>
                                <TouchableOpacity onPress={() => unblock(item.id)} className="px-3 py-2 rounded-lg bg-gray-100">
                                    <Text className="text-gray-700 font-semibold">{t('profile.unblock', 'בטל חסימה')}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                )}
            </View>
        </>
    );
}
