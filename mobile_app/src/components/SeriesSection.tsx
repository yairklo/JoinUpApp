import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Image, I18nManager } from 'react-native';
import { apiClient } from '@/services/api/client';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { getFriendlyFetchError, isAbortError } from '@/utils/apiErrors';

type Series = {
    id: string;
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number;
    subscriberCount: number;
    sport?: string;
    isSubscribed?: boolean;
    nextGameId?: string;
    field?: { name: string };
};

const SPORT_IMAGES: Record<string, string> = {
    SOCCER: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800',
    BASKETBALL: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80&w=800',
    TENNIS: 'https://images.unsplash.com/photo-1622279457486-62dcc4a4bd13?auto=format&fit=crop&q=80&w=800',
    DEFAULT: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=800',
};

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function SeriesSection() {
    const getTokenRef = useAuthTokenRef();
    const { t } = useTranslation();
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    useEffect(() => {
        const controller = new AbortController();

        async function fetchSeries() {
            try {
                setError(null);
                const token = await getTokenRef.current().catch(() => null);
                const data = await apiClient<Series[]>(`/api/series/active`, {
                    token: token || undefined,
                    signal: controller.signal,
                });

                if (!controller.signal.aborted) setSeries(data);
            } catch (err) {
                if (isAbortError(err) || controller.signal.aborted) return;
                const message = getFriendlyFetchError(err, 'שגיאה בטעינת קבוצות');
                if (message) setError(message);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }

        fetchSeries();
        return () => controller.abort();
    }, [getTokenRef]);

    if (loading) return null;
    if (error) return null;
    if (series.length === 0) return null;

    const renderSeriesCard = (s: Series) => {
        const dayName = typeof s.dayOfWeek === 'number' ? DAYS[s.dayOfWeek] : null;
        return (
            <TouchableOpacity
                key={s.id}
                activeOpacity={0.9}
                onPress={() => router.push(`/series/${s.id}`)}
                className="w-64 bg-white dark:bg-cyber-card rounded-3xl overflow-hidden border border-brand-pale dark:border-cyber-border mr-4 mb-2"
                style={{
                    shadowColor: '#0f172a',
                    shadowOpacity: 0.06,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 3 },
                    elevation: 2,
                }}
            >
                <View className="relative h-28 overflow-hidden">
                    <Image
                        source={{ uri: SPORT_IMAGES[s.sport?.toUpperCase() || 'DEFAULT'] || SPORT_IMAGES.DEFAULT }}
                        className="w-full h-full"
                        resizeMode="cover"
                    />
                    <View className="absolute inset-0 bg-black/35" />
                    <View className="absolute inset-0 p-3 justify-between">
                        <View className="bg-brand self-start px-2 py-1 rounded-full flex-row items-center">
                            <Ionicons name="people" size={10} color="#fff" />
                            <Text className="text-white text-[10px] font-bold ml-1">{t('series.badge')}</Text>
                        </View>
                        {(dayName || s.time) && (
                            <View className="bg-black/55 self-start px-2 py-1 rounded-full flex-row items-center max-w-full">
                                <Ionicons name="calendar-outline" size={10} color="#fff" />
                                <Text className="text-white text-[10px] font-bold ml-1" numberOfLines={1}>
                                    {dayName ? `יום ${dayName}` : ''}
                                    {s.time ? ` • ${s.time}` : ''}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
                <View className="p-4">
                    <Text
                        className="font-bold text-lg text-gray-900 dark:text-cyber-text mb-1"
                        numberOfLines={1}
                        style={{ textAlign: I18nManager.isRTL ? 'right' : 'left' }}
                    >
                        {s.name}
                    </Text>
                    <Text className="text-gray-500 dark:text-cyber-muted text-xs mb-3" numberOfLines={1}>
                        {s.fieldName}
                    </Text>
                    <View className="flex-row items-center mb-3">
                        <Ionicons name="people-outline" size={12} color="#64748b" />
                        <Text className="text-gray-600 dark:text-cyber-muted text-xs font-bold ml-1">
                            {s.subscriberCount} חברי קבוצה
                        </Text>
                    </View>

                    <View className="bg-brand-mist py-2 rounded-xl items-center flex-row justify-center border border-brand-pale">
                        <Text className="text-brand-dark text-sm font-bold mr-1">
                            {s.isSubscribed ? t('game.manageSeries') : 'לעמוד הקבוצה'}
                        </Text>
                        <Ionicons name="arrow-back" size={14} color="#047857" />
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    const subscribedSeries = series.filter((s) => s.isSubscribed);
    const unsubscribedSeries = series.filter((s) => !s.isSubscribed);

    return (
        <View className="mb-6">
            {subscribedSeries.length > 0 && (
                <>
                    <View className="px-5 mb-3 flex-row items-center mt-2">
                        <View className="w-1 h-5 rounded-full bg-brand mr-2" />
                        <Text className="text-xl font-black text-gray-900 dark:text-cyber-text">{t('home.mySeries')}</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 10 }}>
                        {subscribedSeries.map(renderSeriesCard)}
                    </ScrollView>
                </>
            )}

            {unsubscribedSeries.length > 0 && (
                <>
                    <View className="px-5 mb-3 flex-row items-center mt-4">
                        <View className="w-1 h-5 rounded-full bg-brand mr-2" />
                        <Text className="text-xl font-black text-gray-900 dark:text-cyber-text">הצטרפו לקבוצה</Text>
                    </View>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                        {unsubscribedSeries.map(renderSeriesCard)}
                    </ScrollView>
                </>
            )}
        </View>
    );
}
