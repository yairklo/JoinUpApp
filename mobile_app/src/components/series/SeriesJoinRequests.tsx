import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '@clerk/clerk-expo';
import { useTranslation } from 'react-i18next';
import { seriesApi, type SeriesJoinRequest } from '@/services/api/series';
import SafeImage from '@/components/SafeImage';

// Managers only: outsiders asking to join a friends-only group. Renders nothing when empty.
export default function SeriesJoinRequests({ seriesId, onApproved }: { seriesId: string; onApproved?: () => void }) {
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [requests, setRequests] = useState<SeriesJoinRequest[]>([]);
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        let ignore = false;
        (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const res = await seriesApi.getJoinRequests(seriesId, token);
                if (!ignore) setRequests(res.pending || []);
            } catch {
                // Non-critical section: stay empty on failure.
            }
        })();
        return () => { ignore = true; };
    }, [seriesId, getToken]);

    const decide = async (userId: string, approve: boolean) => {
        setBusyId(userId);
        try {
            const token = await getToken();
            if (!token) return;
            if (approve) await seriesApi.approveJoinRequest(seriesId, userId, token);
            else await seriesApi.rejectJoinRequest(seriesId, userId, token);
            setRequests((prev) => prev.filter((r) => r.userId !== userId));
            if (approve) onApproved?.();
        } catch (e: any) {
            Alert.alert(t('common.error', 'שגיאה'), e?.message || t('series.requestError'));
        } finally {
            setBusyId(null);
        }
    };

    if (requests.length === 0) return null;

    return (
        <View className="bg-white p-6 mb-4 shadow-sm">
            <Text className="text-lg font-bold text-gray-800 mb-3">
                {t('series.joinRequests')} ({requests.length})
            </Text>
            {requests.map((r) => (
                <View key={r.userId} className="flex-row items-center py-2 border-b border-gray-100">
                    {r.avatar ? (
                        <SafeImage source={{ uri: r.avatar }} className="w-9 h-9 rounded-full bg-gray-200" />
                    ) : (
                        <View className="w-9 h-9 rounded-full bg-gray-200 items-center justify-center">
                            <Text className="text-gray-600 font-bold">{(r.name || '?').charAt(0)}</Text>
                        </View>
                    )}
                    <Text className="flex-1 mx-3 text-gray-900 font-semibold" numberOfLines={1}>{r.name}</Text>
                    {busyId === r.userId ? (
                        <ActivityIndicator />
                    ) : (
                        <View className="flex-row gap-2">
                            <TouchableOpacity onPress={() => decide(r.userId, true)} className="bg-brand px-3 py-2 rounded-lg">
                                <Text className="text-white font-bold text-sm">{t('game.approve')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => decide(r.userId, false)} className="bg-gray-100 px-3 py-2 rounded-lg">
                                <Text className="text-gray-700 font-bold text-sm">{t('game.reject')}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            ))}
        </View>
    );
}
