import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useColorMode } from '@/theme/ColorModeContext';
import type { TournamentMatch } from '@/types/tournament';
import MatchStatusChip from './MatchStatusChip';
import ScoreCluster from './ScoreCluster';
import SlotLabel from './SlotLabel';
import { ChangedFlash } from './UpdatedCue';
import { calendarUrl, fmtTime, matchWinner, type Lang } from './matchFormat';
import { matchCardOpacity, TOURNAMENT_ICONS } from './tournamentTokens';

interface Props {
    match: TournamentMatch;
    numberById?: Record<string, number>;
    groupNames?: Record<string, string>;
    /** Stage / round caption, e.g. "Group A · Round 2". */
    stageLabel?: string;
    /** The viewer's team: highlights the card with a start-edge bar and a caption. */
    myTeamId?: string | null;
    lang?: Lang;
    /** Show the score button (caller passes canScore && tournament IN_PROGRESS). */
    canScore?: boolean;
    /** Row flash (id is in `changedMatchIds`). */
    changed?: boolean;
    /** Withdrawn team ids: names are struck through. */
    withdrawnTeamIds?: string[];
    onPress?: (match: TournamentMatch) => void;
    onScore?: (match: TournamentMatch) => void;
    testID?: string;
}

/**
 * Schedule card (spec 7.2). Caption row (number, time, court, status chip), the score between the
 * two slot labels (home at the start edge, F1 1.1), stage caption plus actions. Props only.
 */
export default function MatchCard({
    match: m,
    numberById,
    groupNames,
    stageLabel,
    myTeamId,
    lang = 'he',
    canScore,
    changed,
    withdrawnTeamIds,
    onPress,
    onScore,
    testID,
}: Props) {
    const { t } = useTranslation();
    const { colorMode } = useColorMode();
    const id = testID ?? `match-card-${m.id}`;
    const iconColor = colorMode === 'dark' ? '#9ca3af' : '#4b5563';
    const time = fmtTime(m.scheduledAt, lang);
    const played = m.status === 'FINISHED' || m.status === 'FORFEIT' || m.status === 'LIVE';
    const winner = matchWinner(m);
    const cancelled = m.status === 'CANCELLED';
    const postponed = m.status === 'POSTPONED';
    const mine = !!myTeamId && (m.home.teamId === myTeamId || m.away.teamId === myTeamId);
    const forfeitLoser = m.status === 'FORFEIT' && winner ? (winner === 'home' ? 'away' : 'home') : null;
    const withdrawn = (s: 'home' | 'away') => !!m[s].teamId && !!withdrawnTeamIds?.includes(m[s].teamId as string);
    const tennisSets = m.details?.sets && m.details.sets.length > 0 ? m.details.sets : undefined;
    const penalties = m.homePenalties != null && m.awayPenalties != null;

    const caption = [t('tournaments.match.number', { n: m.number }), postponed ? '' : time, m.courtLabel].filter(Boolean).join(' · ');
    const calUrl =
        m.scheduledAt && mine && (m.status === 'SCHEDULED' || m.status === 'LIVE')
            ? calendarUrl(m, `${m.home.team?.name ?? ''} - ${m.away.team?.name ?? ''}`.trim(), m.courtLabel ?? undefined)
            : null;
    const showScore = !!canScore && !cancelled;

    const slot = (s: 'home' | 'away') => (
        <View style={{ flex: 1, minWidth: 0 }}>
            <SlotLabel
                testID={`${id}-${s}`}
                slot={m[s]}
                numberById={numberById}
                groupNames={groupNames}
                lines={1}
                bold={winner === s}
                muted={winner != null && winner !== s}
                strike={cancelled || withdrawn(s)}
            />
            {forfeitLoser === s ? (
                <Text className="text-[11px] text-amber-700 dark:text-amber-300 ms-5" numberOfLines={1}>
                    {t('tournaments.match.forfeitLoser')}
                </Text>
            ) : null}
        </View>
    );

    return (
        <Pressable
            testID={id}
            onPress={onPress ? () => onPress(m) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${caption}, ${m.home.team?.name ?? ''} ${m.homeScore ?? ''} ${m.awayScore ?? ''} ${m.away.team?.name ?? ''}`}
            className={`overflow-hidden rounded-2xl p-3 mb-2 bg-white dark:bg-cyber-card border ${
                m.status === 'LIVE' ? 'border-red-300 dark:border-red-900' : 'border-gray-100 dark:border-cyber-border'
            }`}
            style={{ opacity: matchCardOpacity(m.status) }}
        >
            <ChangedFlash active={!!changed} />
            {mine ? <View className="absolute start-0 top-0 bottom-0 w-[3px] bg-brand" /> : null}

            <View className="flex-row items-center justify-between mb-2">
                <View className="flex-row items-center flex-1" style={{ minWidth: 0 }}>
                    {m.courtLabel ? <Ionicons name={TOURNAMENT_ICONS.court} size={11} color={iconColor} style={{ marginEnd: 3 }} /> : null}
                    <Text
                        className={`text-xs font-semibold text-gray-500 dark:text-cyber-muted ${postponed ? 'line-through' : ''}`}
                        numberOfLines={1}
                        style={{ flexShrink: 1 }}
                    >
                        {caption}
                    </Text>
                </View>
                <MatchStatusChip status={m.status} testID={`${id}-status`} />
            </View>

            <View className="flex-row items-center">
                {slot('home')}
                <View className="mx-2" style={{ minWidth: 64 }}>
                    <ScoreCluster
                        testID={`${id}-score`}
                        home={played ? m.homeScore : null}
                        away={played ? m.awayScore : null}
                        homePenalties={m.homePenalties}
                        awayPenalties={m.awayPenalties}
                        sets={played ? tennisSets : undefined}
                        winner={winner}
                        placeholder={time || '–'}
                    />
                </View>
                {slot('away')}
            </View>

            {penalties && played ? (
                <Text testID={`${id}-penalties`} className="text-[11px] text-center text-gray-500 dark:text-cyber-muted mt-1">
                    {t('tournaments.match.penalties', { home: m.homePenalties, away: m.awayPenalties })}
                </Text>
            ) : null}
            {postponed ? (
                <Text className="text-[11px] text-center text-amber-700 dark:text-amber-300 mt-1">{t('tournaments.match.newTimeTbd')}</Text>
            ) : null}

            <View className="flex-row items-center justify-between mt-2">
                <Text className="text-[11px] text-gray-500 dark:text-cyber-muted flex-1" numberOfLines={1}>
                    {[mine ? t('tournaments.match.myTeam') : '', stageLabel].filter(Boolean).join(' · ')}
                </Text>
                <View className="flex-row items-center">
                    {calUrl ? (
                        <Pressable
                            testID={`match-card-calendar-${m.id}`}
                            onPress={() => Linking.openURL(calUrl)}
                            accessibilityRole="button"
                            accessibilityLabel={t('tournaments.match.addToCalendar')}
                            hitSlop={6}
                            className="w-11 h-11 items-center justify-center"
                        >
                            <Ionicons name={TOURNAMENT_ICONS.addToCalendar} size={20} color={iconColor} />
                        </Pressable>
                    ) : null}
                    {showScore && onScore ? (
                        <Pressable
                            testID={`match-card-edit-${m.id}`}
                            onPress={() => onScore(m)}
                            accessibilityRole="button"
                            accessibilityLabel={m.status === 'FINISHED' ? t('tournaments.match.updateScore') : t('tournaments.match.enterScore')}
                            hitSlop={6}
                            className="w-11 h-11 items-center justify-center"
                        >
                            <Ionicons name="create-outline" size={20} color={colorMode === 'dark' ? '#4ade80' : '#059669'} />
                        </Pressable>
                    ) : null}
                </View>
            </View>
        </Pressable>
    );
}
