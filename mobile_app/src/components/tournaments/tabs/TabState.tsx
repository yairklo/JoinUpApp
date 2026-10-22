import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';

/** Grey placeholder blocks, `count` rows of `height`. */
export function SkeletonList({ count = 4, height = 88, testID = 'tab-skeleton' }: { count?: number; height?: number; testID?: string }) {
    return (
        <View testID={testID} accessibilityLabel="loading" accessibilityRole="progressbar">
            {Array.from({ length: count }).map((_, i) => (
                <View key={i} className="rounded-2xl mb-2 bg-gray-100 dark:bg-cyber-card" style={{ height }} />
            ))}
        </View>
    );
}

/** Load error with a retry button (real fetch errors, never an empty state). */
export function ErrorState({ onRetry, testID = 'tab-error' }: { onRetry: () => void; testID?: string }) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    return (
        <View testID={testID} className="items-center py-10 px-6">
            <Ionicons name="cloud-offline-outline" size={32} color={colorMode === 'dark' ? '#9ca3af' : '#6b7280'} />
            <Text className="text-[14px] text-gray-600 dark:text-cyber-muted text-center mt-2">{t('tournaments.view.loadFailed')}</Text>
            <Pressable
                onPress={onRetry}
                accessibilityRole="button"
                className="mt-3 px-5 rounded-full bg-brand items-center justify-center"
                style={{ minHeight: 44 }}
                testID={`${testID}-retry`}
            >
                <Text className="text-white font-bold text-[14px]">{t('tournaments.view.retry')}</Text>
            </Pressable>
        </View>
    );
}

/** Empty state: icon, message and an optional clear/CTA button. */
export function EmptyState({
    icon,
    text,
    actionLabel,
    onAction,
    testID,
}: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    text: string;
    actionLabel?: string;
    onAction?: () => void;
    testID?: string;
}) {
    const { colorMode } = useColorMode();
    return (
        <View testID={testID} className="items-center py-10 px-6">
            <Ionicons name={icon} size={32} color={colorMode === 'dark' ? '#6b7280' : '#9ca3af'} />
            <Text className="text-[14px] text-gray-600 dark:text-cyber-muted text-center mt-2">{text}</Text>
            {actionLabel && onAction ? (
                <Pressable
                    onPress={onAction}
                    accessibilityRole="button"
                    className="mt-3 px-5 rounded-full border border-gray-300 dark:border-cyber-border items-center justify-center"
                    style={{ minHeight: 44 }}
                >
                    <Text className="text-gray-800 dark:text-cyber-text font-semibold text-[14px]">{actionLabel}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

/** Filter/selector pill (44px tall hit area). */
export function Pill({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
    return (
        <Pressable
            testID={testID}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            className={`px-3.5 rounded-full me-2 items-center justify-center ${selected ? 'bg-gray-900 dark:bg-cyber-text' : 'bg-gray-100 dark:bg-cyber-border'}`}
            style={{ minHeight: 44 }}
        >
            <Text className={`text-[13px] font-bold ${selected ? 'text-white dark:text-cyber-bg' : 'text-gray-700 dark:text-cyber-text'}`}>{label}</Text>
        </Pressable>
    );
}
