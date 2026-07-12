import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, Image } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { apiClient } from '@/services/api/client';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

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
    SOCCER: "https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&q=80&w=800",
    BASKETBALL: "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80&w=800",
    TENNIS: "https://images.unsplash.com/photo-1622279457486-62dcc4a4bd13?auto=format&fit=crop&q=80&w=800",
    DEFAULT: "https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&q=80&w=800"
};

export default function SeriesSection() {
    const { user, isLoaded } = useUser();
    const { getToken } = useAuth();
    const { t } = useTranslation();
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        let isMounted = true;

        async function fetchSeries() {
            try {
                const token = await getToken().catch(() => null);
                const data = await apiClient<Series[]>(`/api/series/active`, { token: token || undefined });
                
                if (isMounted) {
                    const subscribedSeries = data.filter(s => s.isSubscribed);
                    setSeries(subscribedSeries);
                }
            } catch (err) {
                console.error("Failed to fetch active series", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        }
        fetchSeries();

        return () => { isMounted = false; };
    }, [getToken]);

    if (loading) {
        return null;
    }

    if (series.length === 0) return null;

    return (
        <View className="mb-6">
            <View className="px-5 mb-3 flex-row justify-between items-end">
                <Text className="text-xl font-black text-gray-900">{t("home.mySeries")}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {series.map(s => (
                    <TouchableOpacity 
                        key={s.id} 
                        activeOpacity={0.9}
                        onPress={() => router.push(`/series/${s.id}`)}
                        className="w-64 bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 mr-4 mb-2"
                    >
                        <View className="relative h-28">
                            <Image 
                                source={{ uri: SPORT_IMAGES[s.sport?.toUpperCase() || "DEFAULT"] || SPORT_IMAGES.DEFAULT }} 
                                className="w-full h-full" 
                            />
                            <View className="absolute top-2 left-2 bg-indigo-600 px-2 py-1 rounded-md border border-white/20">
                                <Text className="text-white text-[10px] font-bold tracking-widest uppercase">{t('series.badge', 'SERIES')}</Text>
                            </View>
                            <View className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded-full border border-white/20 flex-row items-center">
                                <Text className="text-white text-[10px] font-bold mx-1">{s.sport || t('newGame.sport')}</Text>
                            </View>
                        </View>
                        <View className="p-4">
                            <View className="flex-row justify-between items-start mb-2">
                                <Text className="font-bold text-lg text-gray-900 mb-1 text-left flex-1 mr-2" numberOfLines={1}>{s.name}</Text>
                                <View className="flex-row items-center bg-gray-50 px-2 py-1 rounded-lg">
                                    <Ionicons name="people" size={12} color="#6b7280" />
                                    <Text className="text-gray-600 text-xs font-bold ml-1">{s.subscriberCount}</Text>
                                </View>
                            </View>
                            <Text className="text-gray-500 text-xs mb-3 text-left" numberOfLines={1}>{s.fieldName} • {s.time}</Text>
                            
                            <View className="bg-blue-50 py-2 rounded-xl items-center flex-row justify-center border border-blue-100">
                                <Text className="text-blue-600 text-sm font-bold mr-1">{t("game.manageSeries")}</Text>
                                <Ionicons name="arrow-forward" size={14} color="#2563eb" />
                            </View>
                        </View>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}
