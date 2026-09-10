import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@clerk/clerk-expo';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supportApi, SupportMessage } from '@/services/api';
import LoadingMotif from '@/components/loading/LoadingMotif';

const TYPE_LABELS: Record<string, string> = {
    BUG: 'באג',
    FEEDBACK: 'משוב',
};

/**
 * Mobile counterpart of next_app's admin/feedback page -- lists bug reports
 * and general messages submitted via supportApi.submit and lets an admin
 * mark them resolved. Mirrors app/admin/moderation.tsx's structure.
 */
export default function AdminFeedbackScreen() {
    const router = useRouter();
    const { getToken } = useAuth();

    const [rows, setRows] = useState<SupportMessage[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);

    const [loadError, setLoadError] = useState(false);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const token = await getToken();
            if (!token) {
                setLoading(false);
                return;
            }
            const list = await supportApi.adminList(token);
            setRows(Array.isArray(list) ? list : []);
        } catch (e) {
            console.error('Failed to load support messages', e);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [getToken]);

    useEffect(() => { load(); }, [load]);

    const resolve = useCallback(async (row: SupportMessage) => {
        setBusyId(row.id);
        try {
            const token = await getToken();
            if (!token) return;
            const updated = await supportApi.adminResolve(row.id, token);
            setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r)));
        } catch (e) {
            console.error('Failed to resolve support message', e);
            Alert.alert('', 'הפעולה נכשלה, נסה שוב.');
        } finally {
            setBusyId(null);
        }
    }, [getToken]);

    const openRows = rows.filter((r) => r.status === 'OPEN');

    return (
        <SafeAreaView edges={['top']} className="flex-1 bg-white">
            <View className="flex-row items-center px-4 py-3 bg-white border-b border-gray-100">
                <TouchableOpacity onPress={() => router.back()} className="p-2 mr-3" accessibilityRole="button">
                    <FontAwesome name="arrow-left" size={20} color="#4b5563" />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1}>פניות ודיווחי באגים</Text>
            </View>

            {loading ? (
                <View className="flex-1 items-center justify-center">
                    <LoadingMotif id="brand-pulse" label="טוען…" />
                </View>
            ) : (
                <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
                    {loadError ? (
                        <Text className="text-red-500 text-sm">טעינת הפניות נכשלה, נסה לרענן.</Text>
                    ) : openRows.length === 0 ? (
                        <Text className="text-gray-500 text-sm">אין פניות פתוחות.</Text>
                    ) : (
                        openRows.map((row) => (
                            <View key={row.id} className="border border-gray-200 bg-gray-50 rounded-xl p-3" style={{ gap: 6 }}>
                                <View className="flex-row items-center flex-wrap" style={{ gap: 6 }}>
                                    <View className="px-2 py-0.5 rounded-full bg-orange-200">
                                        <Text className="text-orange-800 text-xs font-bold">{TYPE_LABELS[row.type] || row.type}</Text>
                                    </View>
                                    <Text className="text-gray-800 text-xs font-bold">{row.user.name || row.user.id}</Text>
                                    <Text className="text-gray-400 text-xs">{new Date(row.createdAt).toLocaleString('he-IL')}</Text>
                                </View>
                                <Text className="text-gray-700 text-sm">{row.message}</Text>
                                {row.context && <Text className="text-gray-400 text-xs">{row.context}</Text>}
                                <TouchableOpacity onPress={() => resolve(row)} disabled={busyId === row.id} className="flex-row items-center" style={{ gap: 6 }}>
                                    {busyId === row.id && <ActivityIndicator size="small" color="#059669" />}
                                    <Text className="text-brand text-xs font-bold">סמן כטופל</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </ScrollView>
            )}
        </SafeAreaView>
    );
}
