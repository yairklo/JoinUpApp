import React from 'react';
import { I18nManager, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

interface SectionHeaderProps {
    title: string;
    /** When provided, renders a trailing "see all" link. */
    onSeeAll?: () => void;
    seeAllLabel?: string;
    className?: string;
}

/** Consistent home-feed section header: 20/bold title + optional brand "see all" link. */
export default function SectionHeader({ title, onSeeAll, seeAllLabel, className = '' }: SectionHeaderProps) {
    const { t, i18n } = useTranslation();
    const isRtl = I18nManager.isRTL || i18n.language === 'he';

    return (
        <View className={`px-5 mb-3 flex-row items-center justify-between ${className}`}>
            <Text
                className="text-gray-900 dark:text-cyber-text flex-1"
                style={{ fontSize: 20, fontWeight: '700' }}
                numberOfLines={1}
            >
                {title}
            </Text>
            {onSeeAll ? (
                <TouchableOpacity
                    onPress={onSeeAll}
                    accessibilityRole="button"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="flex-row items-center ms-3"
                >
                    <Text className="text-brand dark:text-brand-light font-semibold text-[14px]">
                        {seeAllLabel ?? t('common.all', 'הכל')}
                    </Text>
                    <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={16} color="#059669" />
                </TouchableOpacity>
            ) : null}
        </View>
    );
}
