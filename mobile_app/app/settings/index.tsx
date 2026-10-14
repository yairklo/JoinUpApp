import { View, Text, TouchableOpacity, ScrollView, Image } from 'react-native';
import React, { useCallback, useState } from 'react';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import * as NotificationsPermissions from 'expo-notifications';
import { notificationsApi } from '@/services/api/notifications';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SettingsScreen() {
    const { t } = useTranslation();
    const { signOut, getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();

    const [notifSummary, setNotifSummary] = useState<string | null>(null);

    // Refresh the one-line summary whenever we come back from the notification settings screen.
    useFocusEffect(useCallback(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const [settings, perm] = await Promise.all([
                    notificationsApi.getSettings(token),
                    NotificationsPermissions.getPermissionsAsync(),
                ]);
                if (cancelled) return;
                if (!settings.pushEnabled || perm.status !== 'granted') {
                    setNotifSummary(t('notificationSettings.summaryPushOff'));
                } else if (settings.snoozeUntil) {
                    const time = new Date(settings.snoozeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    setNotifSummary(t('notificationSettings.snoozedUntil', { time }));
                } else {
                    setNotifSummary(t('notificationSettings.summaryOn'));
                }
            } catch (error) {
                console.error('[SETTINGS] Failed to load notification settings:', error);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []));

    const handleSignOut = async () => {
        try {
            await signOut();
            router.replace('/sign-in'); // Or relying on auth listener
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <>
            <Stack.Screen options={{ title: t('settings.title', 'Settings'), headerShown: true }} />
            <ScrollView className="flex-1 bg-gray-50">
                {/* Profile Section */}
                <View className="mt-6 mb-6 items-center">
                    <Image
                        source={{ uri: user?.imageUrl }}
                        className="w-24 h-24 rounded-full bg-gray-200 mb-3"
                    />
                    <Text className="text-xl font-bold text-gray-800">{user?.fullName}</Text>
                    <Text className="text-gray-500">{user?.primaryEmailAddress?.emailAddress}</Text>
                </View>

                {/* General Settings */}
                <View className="bg-white mx-4 rounded-xl mb-4 shadow-sm overflow-hidden">
                    <TouchableOpacity
                        className="p-4 flex-row justify-between items-center"
                        onPress={() => router.push('/settings/notifications' as any)}
                    >
                        <View className="flex-row items-center flex-1">
                            <View className="w-8 h-8 rounded-full bg-brand-pale items-center justify-center mr-3">
                                <FontAwesome name="bell" size={14} color="#059669" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-base text-gray-800 font-medium">{t('notificationSettings.title')}</Text>
                                {!!notifSummary && <Text className="text-sm text-gray-500">{notifSummary}</Text>}
                            </View>
                        </View>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                </View>

                {/* App Info, Support */}
                <View className="bg-white mx-4 rounded-xl mb-6 shadow-sm overflow-hidden">
                    <TouchableOpacity
                        className="p-4 border-b border-gray-100 flex-row items-center justify-between"
                        onPress={() => router.push('/legal/privacy' as any)}
                    >
                        <Text className="text-base text-gray-800">{t('settings.privacyPolicy', 'Privacy Policy')}</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="p-4 border-b border-gray-100 flex-row items-center justify-between"
                        onPress={() => router.push('/legal/terms' as any)}
                    >
                        <Text className="text-base text-gray-800">{t('settings.termsOfService', 'Terms of Service')}</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <View className="p-4 flex-row items-center justify-between bg-gray-50">
                        <Text className="text-sm text-gray-500">{t('settings.version', 'Version')}</Text>
                        <Text className="text-sm text-gray-500 font-bold">1.0.0 (Beta)</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleSignOut}
                    className="mx-4 bg-red-50 p-4 rounded-xl items-center border border-red-100 mb-10"
                >
                    <Text className="text-red-600 font-bold text-lg">{t('settings.signOut', 'Sign Out')}</Text>
                </TouchableOpacity>
            </ScrollView>
        </>
    );
}
