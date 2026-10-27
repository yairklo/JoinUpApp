import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@clerk/clerk-expo';
import { apiClient } from '@/services/api/client';
import { useAuthTokenRef } from '@/hooks/useAuthTokenRef';
import { isAbortError } from '@/utils/apiErrors';
import SafeImage from '@/components/SafeImage';
import SectionHeader from '@/components/ui/SectionHeader';

type MySeries = {
    id: string;
    name: string;
    imageUrl?: string | null;
    fieldImage?: string | null;
    isSubscribed?: boolean;
};

const AVATAR = 64;

/** Compact "My groups" rail on home: round avatars of the viewer's groups plus a "create group" circle. Hidden when the viewer has none. */
export default function MySeriesRail() {
    const { isSignedIn } = useAuth();
    const getTokenRef = useAuthTokenRef();
    const { t } = useTranslation();
    const router = useRouter();
    const [groups, setGroups] = useState<MySeries[]>([]);

    useEffect(() => {
        if (!isSignedIn) {
            setGroups([]);
            return;
        }
        const controller = new AbortController();
        (async () => {
            try {
                const token = await getTokenRef.current().catch(() => null);
                if (!token) return;
                const data = await apiClient<MySeries[]>(`/api/series/active`, { token, signal: controller.signal });
                if (!controller.signal.aborted) setGroups((data || []).filter((s) => s.isSubscribed));
            } catch (err) {
                if (isAbortError(err) || controller.signal.aborted) return;
                setGroups([]);
            }
        })();
        return () => controller.abort();
    }, [isSignedIn, getTokenRef]);

    if (groups.length === 0) return null;

    return (
        <View testID="home-my-series-rail" className="mb-4">
            <SectionHeader title={t('series.myGroups', 'הקבוצות שלי')} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
                {groups.map((s) => {
                    const uri = s.imageUrl || s.fieldImage;
                    return (
                        <TouchableOpacity
                            key={s.id}
                            onPress={() => router.push(`/series/${s.id}`)}
                            accessibilityRole="button"
                            accessibilityLabel={s.name}
                            className="items-center me-4"
                            style={{ width: AVATAR + 8 }}
                        >
                            {uri ? (
                                <SafeImage
                                    source={{ uri }}
                                    style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
                                    className="border border-brand-pale"
                                />
                            ) : (
                                <View
                                    style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
                                    className="bg-brand-mist border border-brand-pale items-center justify-center"
                                >
                                    <Ionicons name="people" size={26} color="#059669" />
                                </View>
                            )}
                            <Text className="text-xs text-gray-700 dark:text-cyber-text font-medium mt-1 text-center" numberOfLines={1}>
                                {s.name}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity
                    onPress={() => router.push('/game/new')}
                    accessibilityRole="button"
                    accessibilityLabel={t('series.createGroup', 'צור קבוצה')}
                    className="items-center"
                    style={{ width: AVATAR + 8 }}
                >
                    <View
                        style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 }}
                        className="border border-dashed border-brand items-center justify-center"
                    >
                        <Ionicons name="add" size={28} color="#059669" />
                    </View>
                    <Text className="text-xs text-brand font-medium mt-1 text-center" numberOfLines={1}>
                        {t('series.createGroup', 'צור קבוצה')}
                    </Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}
