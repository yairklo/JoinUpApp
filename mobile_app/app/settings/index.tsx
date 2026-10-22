import { View, Text, TouchableOpacity, ScrollView, Alert } from 'react-native';
import React, { useCallback, useState } from 'react';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import * as NotificationsPermissions from 'expo-notifications';
import { notificationsApi } from '@/services/api/notifications';
import { useMyAvatar, useMyName } from '@/hooks/useMyAvatar';
import { usersApi } from '@/services/api/users';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import SafeImage from '@/components/SafeImage';

// "1.0.0 · preview · a1b2c3d4" — which store build and which OTA update is running. The update id
// is only present when the running JS came from EAS Update rather than the bundle embedded in the build.
function buildInfoLabel(): string {
    const parts = [Constants.expoConfig?.version || '—'];
    if (Updates.channel) parts.push(Updates.channel);
    parts.push(Updates.isEmbeddedLaunch || !Updates.updateId ? 'embedded' : Updates.updateId.slice(0, 8));
    return parts.join(' · ');
}

export default function SettingsScreen() {
    const { t } = useTranslation();
    const { signOut, getToken } = useAuth();
    const { user } = useUser();
    const { imageUrl: avatarUrl } = useMyAvatar();
    const myName = useMyName();
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

    const [deleting, setDeleting] = useState(false);

    const performDeleteAccount = async () => {
        setDeleting(true);
        try {
            const token = await getToken();
            if (!token) throw new Error('Not signed in');
            await usersApi.deleteAccount(token);
            try { await signOut(); } catch { /* the Clerk user is already gone */ }
            router.replace('/sign-in');
        } catch (error) {
            console.error('[SETTINGS] Failed to delete account:', error);
            Alert.alert(
                t('settings.deleteAccountFailedTitle', 'מחיקת החשבון נכשלה'),
                t('settings.deleteAccountFailedBody', 'משהו השתבש. בדקו את החיבור ונסו שוב.')
            );
        } finally {
            setDeleting(false);
        }
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            t('settings.deleteAccountTitle', 'מחיקת חשבון'),
            t('settings.deleteAccountWarning', 'החשבון והמידע האישי שלך יימחקו לצמיתות, כולל פרופיל, חברים, הרשמות למשחקים ותגובות. לא ניתן לשחזר פעולה זו.'),
            [
                { text: t('common.cancel', 'ביטול'), style: 'cancel' },
                {
                    text: t('settings.deleteAccountContinue', 'המשך'),
                    style: 'destructive',
                    onPress: () => Alert.alert(
                        t('settings.deleteAccountConfirmTitle', 'בטוחים שרוצים למחוק?'),
                        t('settings.deleteAccountConfirmBody', 'זו הפעולה האחרונה — החשבון יימחק מיד.'),
                        [
                            { text: t('common.cancel', 'ביטול'), style: 'cancel' },
                            { text: t('settings.deleteAccountConfirm', 'מחק את החשבון שלי'), style: 'destructive', onPress: performDeleteAccount },
                        ]
                    ),
                },
            ]
        );
    };

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
                    <SafeImage
                        source={{ uri: avatarUrl }}
                        className="w-24 h-24 rounded-full bg-gray-200 mb-3"
                    />
                    <Text className="text-xl font-bold text-gray-800">{myName}</Text>
                    <Text className="text-gray-500">{user?.primaryEmailAddress?.emailAddress}</Text>
                </View>

                {/* General Settings */}
                <View className="bg-white mx-4 rounded-xl mb-4 shadow-sm overflow-hidden">
                    <TouchableOpacity
                        className="p-4 flex-row justify-between items-center border-b border-gray-100"
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
                    <TouchableOpacity
                        className="p-4 flex-row justify-between items-center"
                        onPress={() => router.push('/profile/settings' as any)}
                    >
                        <View className="flex-row items-center flex-1">
                            <View className="w-8 h-8 rounded-full bg-brand-pale items-center justify-center mr-3">
                                <FontAwesome name="lock" size={15} color="#059669" />
                            </View>
                            <Text className="text-base text-gray-800 font-medium flex-1">{t('privacy.settings', 'הגדרות פרטיות')}</Text>
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
                    <TouchableOpacity
                        className="p-4 border-b border-gray-100 flex-row items-center justify-between"
                        onPress={() => router.push('/settings/blocked' as any)}
                    >
                        <Text className="text-base text-gray-800">{t('settings.blockedUsers', 'משתמשים חסומים')}</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <View className="p-4 flex-row items-center justify-between bg-gray-50">
                        <Text className="text-sm text-gray-500">{t('settings.version', 'Version')}</Text>
                        <Text className="text-sm text-gray-500 font-bold">{buildInfoLabel()}</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleSignOut}
                    className="mx-4 bg-red-50 p-4 rounded-xl items-center border border-red-100 mb-2"
                >
                    <Text className="text-red-600 font-bold text-lg">{t('settings.signOut', 'Sign Out')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleDeleteAccount}
                    disabled={deleting}
                    className="mx-4 p-4 rounded-xl items-center mb-10"
                >
                    <Text className="text-red-600 font-semibold">
                        {deleting ? t('settings.deletingAccount', 'מוחק חשבון...') : t('settings.deleteAccount', 'מחיקת חשבון')}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </>
    );
}
