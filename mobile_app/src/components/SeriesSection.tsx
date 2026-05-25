import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { apiClient } from '@/services/api/client';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

type Series = {
    id: string;
    name: string;
    fieldName: string;
    time: string;
    dayOfWeek?: number;
    subscriberCount: number;
    sport?: string;
    isSubscribed?: boolean;
};

export default function SeriesSection() {
    const { getToken } = useAuth();
    const { user } = useUser();
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
                    // Enrich with isSubscribed if needed, but API might already return it or we need to check subscriberIds
                    setSeries(data);
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
        <View className="py-4 bg-gray-50">
            <View className="flex-row justify-between items-center px-5 mb-3">
                <Text className="text-lg font-bold text-gray-800">הצטרף לסדרה</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {series.map(s => (
                    <View key={s.id} className="w-64 bg-white rounded-2xl p-4 mr-4 shadow-sm border border-gray-100">
                        <View className="flex-row justify-between items-start mb-2">
                            <View className="bg-blue-100 px-2 py-1 rounded">
                                <Text className="text-blue-800 text-xs font-bold">{s.sport || 'ספורט'}</Text>
                            </View>
                            <View className="flex-row items-center">
                                <Ionicons name="people" size={14} color="#6b7280" />
                                <Text className="text-gray-500 text-xs ml-1">{s.subscriberCount}</Text>
                            </View>
                        </View>
                        <Text className="font-bold text-lg text-gray-900 mb-1">{s.name}</Text>
                        <Text className="text-gray-500 text-sm mb-4">{s.fieldName} • {s.time}</Text>
                        
                        <TouchableOpacity 
                            onPress={() => router.push(`/series/${s.id}`)}
                            className="bg-blue-50 py-2 rounded-xl items-center flex-row justify-center border border-blue-100"
                        >
                            <Text className="text-blue-600 font-bold mr-1">View Series</Text>
                            <Ionicons name="arrow-forward" size={16} color="#2563eb" />
                        </TouchableOpacity>
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}
