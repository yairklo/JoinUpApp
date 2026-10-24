import React from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { ProfileMatchResult } from '@/services/api/users';
import { formatStatInline, orderedNonZeroKeys, toLang } from '@/utils/matchStatsFormat';

interface MatchResultBadgeProps {
    gameId: string;
    result: ProfileMatchResult | null | undefined;
    sport?: string | null;
    /** Phone width: show one stat instead of two. */
    compact?: boolean;
}

const OUTCOME_STYLE = {
    WIN: { pill: 'bg-brand-mist dark:bg-brand-ink', text: 'text-brand-dark dark:text-brand-light' },
    DRAW: { pill: 'bg-indigo-50 dark:bg-indigo-950', text: 'text-indigo-700 dark:text-indigo-300' },
    LOSS: { pill: 'bg-gray-100 dark:bg-cyber-border', text: 'text-gray-600 dark:text-cyber-muted' },
} as const;

const cap = (o: string) => o.charAt(0) + o.slice(1).toLowerCase();

/** W/D/L pill with "my score – their score" plus a short stats line, for match-history rows. Renders nothing without a result. */
export default function MatchResultBadge({ gameId, result, sport, compact }: MatchResultBadgeProps) {
    const { t, i18n } = useTranslation();
    if (!result) return null;

    const lang = toLang(i18n.language);
    const tone = OUTCOME_STYLE[result.outcome ?? 'LOSS'];
    const he = lang === 'he';
    // Keys belong to the results namespace; defaults keep this component working before they land.
    const LETTER = { WIN: he ? 'נ' : 'W', DRAW: he ? 'ת' : 'D', LOSS: he ? 'ה' : 'L' } as const;
    const WORD = { WIN: he ? 'ניצחון' : 'Win', DRAW: he ? 'תיקו' : 'Draw', LOSS: he ? 'הפסד' : 'Loss' } as const;
    const letter = result.outcome ? t(`results.letter${cap(result.outcome)}`, LETTER[result.outcome]) : null;
    const [mine, theirs] = result.score ? result.score.split('-') : [null, null];

    const rounds = result.rounds;
    const roundTotal = rounds ? rounds.wins + rounds.draws + rounds.losses : 0;
    const statKeys = sport ? orderedNonZeroKeys(sport, result.myStats || {}).slice(0, compact ? 1 : 2) : [];
    const statTexts = sport ? statKeys.map((k) => formatStatInline(sport, k, result.myStats[k], lang)) : [];
    const outcomeWord = result.outcome ? t(`results.${result.outcome.toLowerCase()}`, WORD[result.outcome]) : '';

    if (mine == null && statTexts.length === 0 && roundTotal === 0) return null;

    const a11y = [
        [outcomeWord, mine != null ? `${mine}–${theirs}` : ''].filter(Boolean).join(' '),
        statTexts.join(', '),
    ].filter(Boolean).join(', ');

    return (
        <View
            testID={`history-result-badge-${gameId}`}
            accessible
            accessibilityLabel={a11y}
            className="items-center ms-3 shrink-0"
            style={{ maxWidth: compact ? 96 : 112 }}
        >
            {roundTotal > 0 && mine == null && (
                <View
                    className="h-7 px-2.5 rounded-full flex-row items-center justify-center bg-gray-100 dark:bg-cyber-border"
                    accessibilityLabel={t('results.evening.roundRecord', { w: rounds!.wins, d: rounds!.draws, l: rounds!.losses })}
                >
                    <Text className="text-[13px] font-bold text-gray-800 dark:text-cyber-text" style={{ fontVariant: ['tabular-nums'] }}>
                        {rounds!.wins}–{rounds!.draws}–{rounds!.losses}
                    </Text>
                </View>
            )}
            {mine != null && (
                <View className={`h-7 px-2.5 rounded-full flex-row items-center justify-center ${tone.pill}`}>
                    {letter ? <Text className={`text-[13px] font-bold me-1.5 ${tone.text}`}>{letter}</Text> : null}
                    <Text className={`text-[13px] font-bold ${tone.text}`} style={{ fontVariant: ['tabular-nums'] }}>{mine}</Text>
                    <Text className={`text-[13px] font-bold ${tone.text}`}>–</Text>
                    <Text className={`text-[13px] font-bold ${tone.text}`} style={{ fontVariant: ['tabular-nums'] }}>{theirs}</Text>
                </View>
            )}
            {statTexts.length > 0 && (
                <Text
                    numberOfLines={1}
                    className="text-xs text-gray-500 dark:text-cyber-muted mt-1"
                >
                    {statTexts.join(' · ')}
                </Text>
            )}
        </View>
    );
}
