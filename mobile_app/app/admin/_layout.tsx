import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsAdmin } from '@/hooks/useIsAdmin';

/**
 * Gates every screen under app/admin/*. Fails closed: anything other than a
 * confirmed 'allowed' status (loading, signed-out, denied) blocks rendering
 * the admin screens, mirroring next_app's per-page useIsAdmin() gating.
 */
export default function AdminLayout() {
    const { status } = useIsAdmin();
    const router = useRouter();

    useEffect(() => {
        if (status === 'signed-out' || status === 'denied') {
            router.replace('/(tabs)');
        }
    }, [status, router]);

    if (status === 'allowed') {
        return <Slot />;
    }

    return (
        <SafeAreaView className="flex-1 bg-white items-center justify-center">
            {status === 'loading' ? (
                <ActivityIndicator size="large" color="#059669" />
            ) : (
                <View className="items-center px-8">
                    <Text className="text-gray-500 text-center">אין לך הרשאת ניהול</Text>
                </View>
            )}
        </SafeAreaView>
    );
}
