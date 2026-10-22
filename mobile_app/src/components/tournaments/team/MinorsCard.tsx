import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

/** Kind info card (not an error) for players under 18 (spec 4.7). No action. */
export default function MinorsCard() {
    const { t } = useTranslation();
    return (
        <View
            testID="tournament-minors-card"
            accessibilityRole="summary"
            className="rounded-2xl bg-gray-100 dark:bg-cyber-card p-4 items-center border border-gray-200 dark:border-cyber-border"
        >
            <Ionicons name="trophy-outline" size={28} color="#6b7280" />
            <Text className="text-base font-bold text-gray-900 dark:text-cyber-text mt-2 text-center">{t('tournaments.minors.title')}</Text>
            <Text className="text-sm text-gray-600 dark:text-cyber-muted mt-1 text-center">{t('tournaments.minors.body')}</Text>
        </View>
    );
}
