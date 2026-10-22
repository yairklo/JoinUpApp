import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import { tabular } from '@/components/results/resultUtils';
import { getSportTheme } from '@/components/ui/SportCover';
import type { MatchSlot, TournamentMatch } from '@/types/tournament';
import MatchStatusChip from './MatchStatusChip';
import SlotLabel from './SlotLabel';
import { ChangedFlash } from './UpdatedCue';
import { fmtDayChip, fmtTime, matchWinner, type Lang, type Side } from './matchFormat';
import { matchCardOpacity } from './tournamentTokens';

interface Props {
    match: TournamentMatch;
    numberById?: Record<string, number>;
    groupNames?: Record<string, string>;
    sport?: string;
    lang?: Lang;
    /** Highlight the cell (the viewer's team plays here). */
    highlight?: boolean;
    /** Final of a completed tournament: trophy beside the caption. */
    champion?: boolean;
    changed?: boolean;
    /** Fixed width (tree mode); omit to fill the parent (round-by-round). */
    width?: number;
    onPress?: (match: TournamentMatch) => void;
    testID?: string;
}

/**
 * One bracket match (spec 9.2): caption "#n . day time", two 36px rows (home on top), score at the
 * end edge, a start-edge bar on the winner row (sport `deep` / `glow`), penalties as "(4)", tennis
 * as set columns. Props only.
 */
export default function BracketCell({ match: m, numberById, groupNames, sport, lang = 'he', highlight, champion, changed, width, onPress, testID }: Props) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    const id = testID ?? `bracket-cell-${m.id}`;
    const theme = getSportTheme(sport);
    const accent = colorMode === 'dark' ? theme.glow : theme.deep;
    const winner = matchWinner(m);
    const played = m.status === 'FINISHED' || m.status === 'FORFEIT' || m.status === 'LIVE';
    const sets = played && m.details?.sets && m.details.sets.length > 0 ? m.details.sets : undefined;
    const cancelled = m.status === 'CANCELLED';
    const when = m.scheduledAt ? `${fmtDayChip(m.scheduledAt, lang)} ${fmtTime(m.scheduledAt, lang)}` : '';
    const caption = [t('tournaments.match.number', { n: m.number }), when].filter(Boolean).join(' · ');

    const row = (side: Side, slot: MatchSlot) => {
        const won = winner === side;
        const lost = winner != null && !won;
        const score = side === 'home' ? m.homeScore : m.awayScore;
        const pens = side === 'home' ? m.homePenalties : m.awayPenalties;
        const showPens = m.homePenalties != null && m.awayPenalties != null;
        const numCls = lost ? 'text-gray-500 dark:text-cyber-muted font-bold' : 'text-gray-900 dark:text-cyber-text font-extrabold';
        return (
            <View className="flex-row items-center px-2" style={{ height: 36 }} testID={`bracket-cell-slot-${m.id}-${side}`}>
                <View className="self-stretch w-[2px] me-1.5" style={{ backgroundColor: won ? accent : 'transparent' }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <SlotLabel slot={slot} numberById={numberById} groupNames={groupNames} lines={1} bold={won} muted={lost} strike={cancelled} />
                </View>
                {sets ? (
                    <View className="flex-row">
                        {sets.map(([h, a], i) => {
                            const v = side === 'home' ? h : a;
                            const o = side === 'home' ? a : h;
                            return (
                                <Text key={i} className={`text-[13px] w-[18px] text-center ${v > o ? 'font-extrabold text-gray-900 dark:text-cyber-text' : 'text-gray-500 dark:text-cyber-muted'}`} style={tabular}>
                                    {v}
                                </Text>
                            );
                        })}
                    </View>
                ) : played && score != null ? (
                    <View className="flex-row items-baseline ms-2">
                        <Text className={`text-[16px] ${numCls}`} style={tabular}>{score}</Text>
                        {showPens && pens != null ? (
                            <Text className="text-[10px] ms-0.5 text-gray-500 dark:text-cyber-muted" style={tabular}>({pens})</Text>
                        ) : null}
                    </View>
                ) : null}
            </View>
        );
    };

    return (
        <Pressable
            testID={id}
            onPress={onPress ? () => onPress(m) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${caption}, ${m.home.team?.name ?? ''} ${m.away.team?.name ?? ''}`}
            style={{ width, opacity: matchCardOpacity(m.status) }}
        >
            <View className="flex-row items-center mb-1 px-1">
                {m.status === 'LIVE' ? <MatchStatusChip status="LIVE" testID={`${id}-status`} /> : null}
                <Text className="text-[11px] text-gray-500 dark:text-cyber-muted flex-1" numberOfLines={1}>{caption}</Text>
                {champion ? <Ionicons name="trophy" size={14} color="#d97706" /> : null}
                {m.status !== 'LIVE' ? <MatchStatusChip status={m.status} testID={`${id}-status`} /> : null}
            </View>
            <View
                className={`overflow-hidden rounded-xl bg-white dark:bg-cyber-card border ${
                    m.status === 'LIVE' ? 'border-red-300 dark:border-red-900' : 'border-gray-100 dark:border-cyber-border'
                }`}
                style={highlight ? { borderColor: accent, borderWidth: 2 } : undefined}
            >
                <ChangedFlash active={!!changed} />
                {row('home', m.home)}
                <View className="h-px bg-gray-100 dark:bg-cyber-border" />
                {row('away', m.away)}
            </View>
        </Pressable>
    );
}
