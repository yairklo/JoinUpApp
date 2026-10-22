import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

interface Props {
    /** Accepted members. */
    accepted: number;
    /** Pending invitations (hatched segments). */
    invited?: number;
    min: number;
    max: number;
    starters: number;
    /** 6px bar and no caption. */
    compact?: boolean;
    testID?: string;
}

type Level = 'below' | 'ok' | 'full';

const FILL: Record<Level, string> = {
    below: 'bg-amber-400',
    ok: 'bg-brand',
    full: 'bg-gray-500',
};

/** Spec 4.4: one segment per roster slot (continuous with ticks above 20), min/starters markers, state caption. Props only. */
export default function RosterMeter({ accepted, invited = 0, min, max, starters, compact, testID = 'roster-meter' }: Props) {
    const { t } = useTranslation();
    const level: Level = accepted >= max ? 'full' : accepted >= min ? 'ok' : 'below';
    const continuous = max > 20;
    const h = compact ? 6 : 10;
    const pct = (n: number) => `${Math.min(100, (n / Math.max(1, max)) * 100)}%` as const;
    const caption =
        level === 'below'
            ? t('tournaments.team.meter.below', { count: min - accepted })
            : level === 'ok'
              ? t('tournaments.team.meter.ok')
              : t('tournaments.team.meter.full');
    const captionTone =
        level === 'below' ? 'text-amber-700 dark:text-amber-300' : 'text-gray-600 dark:text-cyber-muted';

    return (
        <View
            testID={testID}
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max, now: accepted, text: t('tournaments.team.meter.a11y', { count: accepted, min, max }) }}
        >
            {compact ? null : (
                <View className="h-4 mb-1">
                    <Text className="absolute text-[10px] text-gray-500 dark:text-cyber-muted" style={{ start: pct(Math.max(0, min - 1)) }}>
                        {t('tournaments.team.meter.min', { n: min })}
                    </Text>
                </View>
            )}
            {continuous ? (
                <View className="rounded-full bg-gray-200 dark:bg-cyber-border overflow-hidden flex-row" style={{ height: h }}>
                    <View className={FILL[level]} style={{ width: pct(accepted) }} />
                    <View className="bg-gray-400/50" style={{ width: pct(invited) }} />
                </View>
            ) : (
                <View className="flex-row" style={{ gap: 2 }}>
                    {Array.from({ length: max }, (_, i) => {
                        const filled = i < accepted;
                        const pending = !filled && i < accepted + invited;
                        return (
                            <View
                                key={i}
                                className={`flex-1 rounded-full ${
                                    filled
                                        ? FILL[level]
                                        : pending
                                          ? 'border border-dashed border-gray-400 dark:border-cyber-muted bg-gray-100 dark:bg-cyber-border'
                                          : 'bg-gray-200 dark:bg-cyber-border'
                                }`}
                                style={{ height: h }}
                            />
                        );
                    })}
                </View>
            )}
            {compact ? null : (
                <View className="mt-1.5">
                    <Text className="text-[11px] text-gray-500 dark:text-cyber-muted">
                        {t('tournaments.team.meter.starters', { n: starters })}
                    </Text>
                    <Text className={`text-xs font-semibold mt-0.5 ${captionTone}`}>{caption}</Text>
                </View>
            )}
        </View>
    );
}
