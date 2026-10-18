import React from 'react';
import { I18nManager, TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';

interface BackButtonProps {
    /** Defaults to router.back(). */
    onPress?: () => void;
    /**
     * `surface` (default): subtle gray/dark-card round button for plain headers.
     * `overlay`: white glyph on a translucent dark circle, for use over a cover image.
     */
    variant?: 'surface' | 'overlay';
    className?: string;
    style?: StyleProp<ViewStyle>;
    accessibilityLabel?: string;
}

/**
 * Single RTL-aware back button. In Hebrew/RTL "back" points right, so the
 * chevron flips with the layout direction instead of the old hard-coded
 * FontAwesome arrow-left.
 */
export default function BackButton({
    onPress,
    variant = 'surface',
    className = '',
    style,
    accessibilityLabel,
}: BackButtonProps) {
    const router = useRouter();
    const { t, i18n } = useTranslation();
    const isRtl = I18nManager.isRTL || i18n.language === 'he';
    const isOverlay = variant === 'overlay';
    const { colorMode } = useColorMode();
    const iconColor = isOverlay ? '#ffffff' : colorMode === 'dark' ? '#f1f5f9' : '#374151';

    return (
        <TouchableOpacity
            onPress={onPress ?? (() => router.back())}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? t('common.back', 'Back')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.75}
            className={`w-10 h-10 rounded-full items-center justify-center ${
                isOverlay ? '' : 'bg-gray-100 dark:bg-cyber-card'
            } ${className}`}
            style={[isOverlay ? { backgroundColor: 'rgba(0,0,0,0.35)' } : null, style]}
        >
            <Ionicons
                name={isRtl ? 'chevron-forward' : 'chevron-back'}
                size={22}
                color={iconColor}
            />
        </TouchableOpacity>
    );
}
