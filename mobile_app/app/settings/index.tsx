import { View, Text, TouchableOpacity, ScrollView, Switch, Alert, Image, Linking } from 'react-native';
import React, { useEffect, useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import * as NotificationsPermissions from 'expo-notifications';
import { notificationsApi } from '@/services/api/notifications';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function SettingsScreen() {
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
                        'הרשאת התראות נדרשת',
                        'כדי לקבל התראות יש לאשר זאת בהגדרות המכשיר.',
                        [
                            { text: 'ביטול', style: 'cancel' },
                            { text: 'פתח הגדרות', onPress: () => Linking.openSettings() },
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
            Alert.alert('שגיאה', 'עדכון הגדרת ההתראות נכשל, נסה שוב.');
        } finally {
            setPushBusy(false);
        }
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
            <Stack.Screen options={{ title: 'Settings' }} />
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
                            <Text className="text-base text-gray-800 font-medium">Push Notifications</Text>
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
                        <Text className="text-base text-gray-800">Privacy Policy</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <TouchableOpacity
                        className="p-4 border-b border-gray-100 flex-row items-center justify-between"
                        onPress={() => router.push('/legal/terms' as any)}
                    >
                        <Text className="text-base text-gray-800">Terms of Service</Text>
                        <FontAwesome name="angle-right" size={16} color="#9ca3af" />
                    </TouchableOpacity>
                    <View className="p-4 flex-row items-center justify-between bg-gray-50">
                        <Text className="text-sm text-gray-500">Version</Text>
                        <Text className="text-sm text-gray-500 font-bold">1.0.0 (Beta)</Text>
                    </View>
                </View>

                <TouchableOpacity
                    onPress={handleSignOut}
                    className="mx-4 bg-red-50 p-4 rounded-xl items-center border border-red-100 mb-10"
                >
                    <Text className="text-red-600 font-bold text-lg">Sign Out</Text>
                </TouchableOpacity>
            </ScrollView>
        </>
    );
}
