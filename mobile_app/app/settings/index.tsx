import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Image, Linking } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import * as NotificationsPermissions from 'expo-notifications';
import { notificationsApi } from '@/services/api/notifications';
import { usersApi } from '@/services/api/users';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SettingsScreen() {
    const { t } = useTranslation();
    const { signOut, getToken } = useAuth();
    const { user } = useUser();
    const router = useRouter();

    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [settingsLoaded, setSettingsLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const settings = await notificationsApi.getSettings(token);
                const { status } = await NotificationsPermissions.getPermissionsAsync();
                if (!cancelled) {
                    setPushEnabled(settings.pushEnabled && status === 'granted');
                }
            } catch (error) {
                console.error('[SETTINGS] Failed to load notification settings:', error);
            } finally {
                if (!cancelled) setSettingsLoaded(true);
            }
        })();
        return () => { cancelled = true; };
    }, [getToken]);

    const handleTogglePush = async (next: boolean) => {
        setPushBusy(true);
        try {
            if (next) {
                const { status: existing } = await NotificationsPermissions.getPermissionsAsync();
                let status = existing;
                if (status !== 'granted') {
                    const req = await NotificationsPermissions.requestPermissionsAsync();
                    status = req.status;
                }
                if (status !== 'granted') {
                    Alert.alert(
                        t('settings.notificationsPermissionRequired', 'הרשאת התראות נדרשת'),
                        t('settings.notificationsPermissionMessage', 'כדי לקבל התראות יש לאשר זאת בהגדרות המכשיר.'),
                        [
                            { text: t('common.cancel', 'ביטול'), style: 'cancel' },
                            { text: t('settings.openSettings', 'פתח הגדרות'), onPress: () => Linking.openSettings() },
                        ]
                    );
                    return;
                }
            }
            const token = await getToken();
            if (!token) return;
            await notificationsApi.updateSettings({ pushEnabled: next }, token);
            setPushEnabled(next);
        } catch (error) {
            console.error('[SETTINGS] Failed to update push setting:', error);
            Alert.alert(t('common.error', 'שגיאה'), t('settings.updatePushFailed', 'עדכון הגדרת ההתראות נכשל, נסה שוב.'));
        } finally {
            setPushBusy(false);
        }
    };

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
                    <Image
                        source={{ uri: user?.imageUrl }}
                        className="w-24 h-24 rounded-full bg-gray-200 mb-3"
                    />
                    <Text className="text-xl font-bold text-gray-800">{user?.fullName}</Text>
                    <Text className="text-gray-500">{user?.primaryEmailAddress?.emailAddress}</Text>
                </View>

                {/* General Settings */}
                <View className="bg-white mx-4 rounded-xl mb-4 shadow-sm overflow-hidden">
                    <View className="p-4 flex-row justify-between items-center">
                        <View className="flex-row items-center">
                            <View className="w-8 h-8 rounded-full bg-brand-pale items-center justify-center mr-3">
                                <FontAwesome name="bell" size={14} color="#059669" />
                            </View>
                            <Text className="text-base text-gray-800 font-medium">{t('settings.pushNotifications', 'Push Notifications')}</Text>
                        </View>
                        <Switch
                            value={pushEnabled}
                            onValueChange={handleTogglePush}
                            disabled={!settingsLoaded || pushBusy}
                        />
                    </View>
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
                        <Text className="text-sm text-gray-500 font-bold">1.0.0 (Beta)</Text>
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
