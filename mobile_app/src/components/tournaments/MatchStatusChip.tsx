import React, { useEffect, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { MatchStatus } from '@/types/tournament';
import { MATCH_STATUS_TONE, useReducedMotion } from './tournamentTokens';

interface Props {
    status: MatchStatus;
    /** Default `match-status`. */
    testID?: string;
}

function LiveDot() {
    const reduced = useReducedMotion();
    const opacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (reduced) {
            opacity.setValue(1);
            return;
        }
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
                Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [reduced, opacity]);
    return <Animated.View className="w-1.5 h-1.5 rounded-full bg-red-600 dark:bg-red-400 me-1.5" style={{ opacity }} />;
}

/**
 * Match status pill (spec 0.3). Renders nothing for SCHEDULED and FINISHED (the time / the score is
 * the signal). LIVE has a pulsing 6px dot (static with reduced motion). Props only.
 */
export default function MatchStatusChip({ status, testID = 'match-status' }: Props) {
    const { t } = useTranslation();
    const tone = MATCH_STATUS_TONE[status];
    if (!tone) return null;
    const label = t(`tournaments.match.status.${status}`);
    return (
        <View testID={testID} accessible accessibilityLabel={label} className={`flex-row items-center self-start ${tone.container}`}>
            {status === 'LIVE' ? <LiveDot /> : null}
            <Text className={`text-xs font-bold ${tone.text}`}>{label}</Text>
        </View>
    );
}
