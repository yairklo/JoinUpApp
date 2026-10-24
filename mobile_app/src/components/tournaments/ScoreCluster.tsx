import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tabular } from '@/components/results/resultUtils';
import { setsWon } from './tournamentTokens';

interface Props {
    home: number | null | undefined;
    away: number | null | undefined;
    /** Knockout penalties: shown as a small trailing "(4)" next to each number. */
    homePenalties?: number | null;
    awayPenalties?: number | null;
    /** Tennis: `match.details.sets`. The big numbers become sets won and a mini set row is added. */
    sets?: [number, number][];
    /** Bold the winner's number, mute the other. */
    winner?: 'home' | 'away' | null;
    /** `lg` 36px (match detail), `md` 22px (cards, default), `sm` 16px (bracket cells). */
    size?: 'lg' | 'md' | 'sm';
    /** `:` for the big scoreboard (default), `–` (en dash) for compact places. Never a hyphen. */
    separator?: ':' | '–';
    /** Shown instead of numbers while there is no score (kickoff time, "–"). */
    placeholder?: string;
    /** Default `score-cluster`; children are `{testID}-home` and `{testID}-away`. */
    testID?: string;
}

const NUM = { lg: 'text-[36px]', md: 'text-[22px]', sm: 'text-[16px]' } as const;
const PEN = { lg: 'text-[14px]', md: 'text-[11px]', sm: 'text-[10px]' } as const;
const GAP = { lg: 'mx-3', md: 'mx-2', sm: 'mx-1' } as const;

/**
 * Score between two team labels. RTL rule F1 1.1: home first, as SEPARATE flex children (number,
 * separator, number), never one "3-2" string, so home sits at the reading-start edge in both
 * locales. Tabular figures. Penalties trail each number; tennis adds the set row below.
 */
export default function ScoreCluster({
    home,
    away,
    homePenalties,
    awayPenalties,
    sets,
    winner,
    size = 'md',
    separator = ':',
    placeholder,
    testID = 'score-cluster',
}: Props) {
    const { t } = useTranslation();
    const hasScore = home != null && away != null;
    const tennis = !!sets && sets.length > 0;
    const shown = tennis ? setsWon(sets) : { home: home as number, away: away as number };
    const hasPens = homePenalties != null && awayPenalties != null;

    if (!hasScore && !tennis) {
        return (
            <View testID={testID} className="items-center">
                <Text className="text-[16px] font-bold text-gray-700 dark:text-cyber-text" style={tabular}>
                    {placeholder ?? '–'}
                </Text>
            </View>
        );
    }

    const tone = (side: 'home' | 'away') =>
        winner == null
            ? 'text-gray-900 dark:text-cyber-text font-extrabold'
            : winner === side
              ? 'text-gray-900 dark:text-cyber-text font-extrabold'
              : 'text-gray-500 dark:text-cyber-muted font-bold';

    const a11y = [
        `${shown.home} ${separator} ${shown.away}`,
        hasPens ? t('tournaments.match.penalties', { home: homePenalties, away: awayPenalties }) : '',
    ]
        .filter(Boolean)
        .join(', ');

    return (
        <View testID={testID} accessible accessibilityLabel={a11y} className="items-center">
            <View className="flex-row items-center">
                <View className="flex-row items-baseline">
                    <Text testID={`${testID}-home`} className={`${NUM[size]} leading-none ${tone('home')}`} style={tabular}>
                        {shown.home}
                    </Text>
                    {hasPens ? (
                        <Text className={`${PEN[size]} ms-0.5 text-gray-500 dark:text-cyber-muted`} style={tabular}>
                            ({homePenalties})
                        </Text>
                    ) : null}
                </View>
                <Text className={`${NUM[size]} leading-none ${GAP[size]} text-gray-300 dark:text-cyber-border`}>{separator}</Text>
                <View className="flex-row items-baseline">
                    <Text testID={`${testID}-away`} className={`${NUM[size]} leading-none ${tone('away')}`} style={tabular}>
                        {shown.away}
                    </Text>
                    {hasPens ? (
                        <Text className={`${PEN[size]} ms-0.5 text-gray-500 dark:text-cyber-muted`} style={tabular}>
                            ({awayPenalties})
                        </Text>
                    ) : null}
                </View>
            </View>
            {tennis ? (
                <View testID={`${testID}-sets`} className="flex-row items-center mt-1">
                    {sets!.map(([h, a], i) => (
                        <View key={i} className="flex-row items-center">
                            {i > 0 ? <Text className="text-[11px] mx-1 text-gray-400 dark:text-cyber-muted">·</Text> : null}
                            <Text className={`text-[11px] ${h > a ? 'font-extrabold text-gray-900 dark:text-cyber-text' : 'text-gray-500 dark:text-cyber-muted'}`} style={tabular}>
                                {h}
                            </Text>
                            <Text className="text-[11px] text-gray-400 dark:text-cyber-muted">–</Text>
                            <Text className={`text-[11px] ${a > h ? 'font-extrabold text-gray-900 dark:text-cyber-text' : 'text-gray-500 dark:text-cyber-muted'}`} style={tabular}>
                                {a}
                            </Text>
                        </View>
                    ))}
                </View>
            ) : null}
        </View>
    );
}
