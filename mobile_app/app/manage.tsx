import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import ManageItemCard from '@/components/ManageItemCard';
import SectionHeader from '@/components/ui/SectionHeader';
import { useManageOverview } from '@/hooks/useManageOverview';
import { buildManageItems } from '@joinup/shared/manage';

const BRAND = '#059669';

export default function ManageScreen() {
    const { t } = useTranslation();
    const router = useRouter();
    const { data, loading, error, refresh } = useManageOverview();
    const [refreshing, setRefreshing] = useState(false);
    const items = buildManageItems(data);
    const attention = data?.attention ?? [];

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        try { await refresh(); } finally { setRefreshing(false); }
    }, [refresh]);

    return (
        <>
            <Stack.Screen options={{ headerShown: true, title: t('manage.title') }} />
            <ScrollView
                className="flex-1 bg-brand-mist/40 dark:bg-cyber-bg"
                contentContainerStyle={{ paddingVertical: 16, paddingBottom: 60 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND} />}
            >
                {loading && !data ? (
                    <View className="py-20 items-center"><ActivityIndicator color={BRAND} /></View>
                ) : error && !data ? (
                    <Text className="text-center text-gray-500 py-20 px-8">{t('manage.loadFailed')}</Text>
                ) : items.length === 0 ? (
                    <View className="items-center py-20 px-8">
                        <Text className="text-gray-900 dark:text-cyber-text font-black text-xl text-center">{t('manage.emptyTitle')}</Text>
                        <Text className="text-gray-500 dark:text-cyber-muted text-center mt-2 leading-5">{t('manage.emptyDesc')}</Text>
                        <TouchableOpacity onPress={() => router.push('/game/new')} className="mt-6 bg-brand px-6 py-3 rounded-2xl">
                            <Text className="text-white font-bold">{t('newGame.createGame', 'צור משחק')}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <>
                        {attention.length > 0 && (
                            <>
                                <SectionHeader title={t('manage.needsAttention')} />
                                {attention.map((a) => (
                                    <TouchableOpacity
                                        key={`${a.type}-${a.gameId}`}
                                        onPress={() => router.push(`/game/${a.gameId}` as any)}
                                        activeOpacity={0.85}
                                        className="mx-5 mb-2 flex-row items-center rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3"
                                        accessibilityRole="button"
                                    >
                                        <Ionicons name={a.type === 'PENDING_REQUESTS' ? 'hourglass-outline' : 'list-outline'} size={18} color="#b45309" />
                                        <Text className="flex-1 text-amber-900 font-bold text-sm mx-2">
                                            {a.type === 'PENDING_REQUESTS'
                                                ? t('manage.attentionPending', { count: a.count })
                                                : t('manage.attentionWaitlist', { count: a.count })}
                                            {' • '}{a.label}
                                        </Text>
                                        <Ionicons name="chevron-forward" size={16} color="#b45309" />
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}
                        <SectionHeader title={t('manage.allMine')} className="mt-4" />
                        {items.map((item) => <ManageItemCard key={item.key} item={item} />)}
                    </>
                )}
            </ScrollView>
        </>
    );
}
