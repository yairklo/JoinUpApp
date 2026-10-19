import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import SectionHeader from '@/components/ui/SectionHeader';
import ManageItemCard from '@/components/ManageItemCard';
import { buildManageItems, MANAGE_HOME_LIMIT } from '@joinup/shared/manage';
import type { ManageOverview } from '@/services/api/manage';

/** Home-feed shortcut to what the user manages. Renders nothing for players who manage nothing. */
export default function ManageSection({ overview }: { overview: ManageOverview | null }) {
    const { t } = useTranslation();
    const router = useRouter();
    const items = buildManageItems(overview);
    if (items.length === 0) return null;

    const attentionCount = overview?.attention.length ?? 0;

    return (
        <View className="mb-6">
            <SectionHeader
                title={t('manage.title')}
                className="mt-2"
                onSeeAll={items.length > MANAGE_HOME_LIMIT || attentionCount > 0 ? () => router.push('/manage' as any) : undefined}
                seeAllLabel={t('manage.seeAll')}
            />
            {attentionCount > 0 && (
                <TouchableOpacity
                    onPress={() => router.push('/manage' as any)}
                    activeOpacity={0.85}
                    className="mx-5 mb-3 flex-row items-center rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3"
                    accessibilityRole="button"
                >
                    <Ionicons name="alert-circle" size={18} color="#b45309" />
                    <Text className="flex-1 text-amber-900 font-bold text-sm mx-2">
                        {t('manage.attentionBanner', { count: attentionCount })}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color="#b45309" />
                </TouchableOpacity>
            )}
            {items.slice(0, MANAGE_HOME_LIMIT).map((item) => (
                <ManageItemCard key={item.key} item={item} />
            ))}
        </View>
    );
}
