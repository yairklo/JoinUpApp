import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import { CHANGED_FLASH_MS } from '@/hooks/useTournamentQuery';
import { useReducedMotion } from './tournamentTokens';

interface CueProps {
    /** `updated` from a tournament data hook (true for 3s after a realtime event). */
    visible: boolean;
    /** Default `tournament-updated-cue`. */
    testID?: string;
}

/**
 * "Updated just now" pill (spec 0.5). Place it directly under the tab bar, at the start edge. The
 * live region stays mounted so screen readers announce the text when it appears; the pill fades in
 * (no animation with reduced motion). Never stacks: one instance per screen.
 */
export function UpdatedCue({ visible, testID = 'tournament-updated-cue' }: CueProps) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    const reduced = useReducedMotion();
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (reduced) {
            opacity.setValue(visible ? 1 : 0);
            return;
        }
        Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }).start();
    }, [visible, reduced, opacity]);

    return (
        <View accessibilityLiveRegion="polite" className="self-start" pointerEvents="none">
            {visible ? (
                <Animated.View
                    testID={testID}
                    className="flex-row items-center px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950"
                    style={{ opacity }}
                >
                    <Ionicons name="refresh" size={12} color={colorMode === 'dark' ? '#a5b4fc' : '#4338ca'} style={{ marginEnd: 4 }} />
                    <Text className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{t('tournaments.updated')}</Text>
                </Animated.View>
            ) : null}
        </View>
    );
}

interface FlashProps {
    /** True while the row/card id is in `changedMatchIds`. */
    active: boolean;
    testID?: string;
}

/**
 * Background flash for a changed row/card (spec 0.5, 1.2s). Render as the FIRST child of the
 * (relative, overflow-hidden) card: it is an absolute overlay that ignores touches. No flash with
 * reduced motion.
 */
export function ChangedFlash({ active, testID }: FlashProps) {
    const reduced = useReducedMotion();
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!active || reduced) {
            opacity.setValue(0);
            return;
        }
        opacity.setValue(0.9);
        Animated.timing(opacity, { toValue: 0, duration: CHANGED_FLASH_MS, useNativeDriver: true }).start();
    }, [active, reduced, opacity]);

    if (reduced) return null;
    return (
        <Animated.View
            testID={testID}
            pointerEvents="none"
            className="absolute inset-0 bg-indigo-100 dark:bg-indigo-900"
            style={{ opacity }}
        />
    );
}

export default UpdatedCue;
