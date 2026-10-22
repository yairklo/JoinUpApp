import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    count: number;
    min: number;
    max: number;
    testID?: string;
}

/** Compact 6px roster meter: fills toward `max`, green once `min` is reached, amber below, red above. Props only. */
export default function RosterMeter({ count, min, max, testID }: Props) {
    const { t } = useTranslation();
    const pct = Math.max(0, Math.min(100, (count / Math.max(1, max)) * 100));
    const tone = count > max ? 'bg-red-500' : count >= min ? 'bg-brand' : 'bg-amber-500';
    return (
        <View
            testID={testID}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('tournaments.team.meter.a11y', { count, min, max }) as string}
            accessibilityValue={{ min: 0, max, now: Math.min(count, max) }}
            className="h-1.5 rounded-full bg-gray-200 dark:bg-cyber-border overflow-hidden"
        >
            <View className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
        </View>
    );
}
