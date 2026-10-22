import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BackButton from '@/components/ui/BackButton';
import { getSportTheme } from '@/components/ui/SportCover';
import { useColorMode } from '@/theme/ColorModeContext';
import { useTournament } from '@/hooks/useTournament';
import { useBracket, useTournamentSchedule, useTournamentTeams } from '@/hooks/useTournamentViews';
import MatchStatusChip from '@/components/tournaments/MatchStatusChip';
import ScoreCluster from '@/components/tournaments/ScoreCluster';
import SlotLabel from '@/components/tournaments/SlotLabel';
import { UpdatedCue } from '@/components/tournaments/UpdatedCue';
import { bracketRoundKey, TOURNAMENT_ICONS } from '@/components/tournaments/tournamentTokens';
import { calendarUrl, deviceTzDiffers, fmtDateTime, fmtTime, matchWinner, type Lang, type Side } from '@/components/tournaments/matchFormat';
import { ErrorState, SkeletonList } from '@/components/tournaments/tabs/TabState';
import type { MatchSlot, TournamentMatch, TournamentTeam } from '@/types/tournament';

function Roster({ team }: { team: TournamentTeam | undefined }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    if (!team) return null;
    const members = (team.members ?? []).filter((m) => m.status === 'ACCEPTED');
    return (
        <View className="rounded-2xl bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border mb-2 overflow-hidden">
            <Pressable
                onPress={() => setOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: open }}
                className="flex-row items-center justify-between px-3"
                style={{ minHeight: 48 }}
            >
                <Text className="text-[14px] font-bold text-gray-900 dark:text-cyber-text flex-1" numberOfLines={1}>{team.name}</Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color="#9ca3af" />
            </Pressable>
            {open ? (
                <View className="px-3 pb-2">
                    {members.length === 0 ? (
                        <Text className="text-xs text-gray-500 dark:text-cyber-muted py-1">{t('tournaments.view.noRoster')}</Text>
                    ) : (
                        members.map((m) => (
                            <View key={m.userId} className="flex-row items-center py-1.5">
                                <Text className="text-[12px] text-gray-500 dark:text-cyber-muted" style={{ width: 28 }}>{m.jerseyNumber ?? ''}</Text>
                                <Text className="text-[13px] text-gray-900 dark:text-cyber-text flex-1" numberOfLines={1}>{m.name}</Text>
                            </View>
                        ))
                    )}
                </View>
            ) : null}
        </View>
    );
}

/** Match detail (spec 10): header, scoreboard, bracket path context, rosters, calendar / share. */
export default function TournamentMatchDetailScreen() {
    const { id, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const { colorMode } = useColorMode();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament, updated } = useTournament(id);
    const { stages, matches, numberById, loading, error, refetch } = useTournamentSchedule(id);
    const { stages: bracketStages } = useBracket(id);
    const { teams } = useTournamentTeams(id);
    const dark = colorMode === 'dark';
    const theme = getSportTheme(tournament?.sport);

    const match: TournamentMatch | undefined = matches.find((m) => m.id === matchId);
    const groupNames = useMemo(() => {
        const o: Record<string, string> = {};
        for (const s of stages) for (const g of s.groups) o[g.id] = g.name;
        return o;
    }, [stages]);

    const header = (children: React.ReactNode) => (
        <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-gray-50 dark:bg-cyber-bg">
            <View className="flex-row items-center px-4 pt-2 pb-2">
                <BackButton />
                <Text accessibilityRole="header" className="text-lg font-extrabold text-gray-900 dark:text-cyber-text ms-3 flex-1" numberOfLines={1}>
                    {match ? t('tournaments.match.number', { n: match.number }) : (tournament?.title ?? '')}
                </Text>
            </View>
            {children}
        </SafeAreaView>
    );

    if (loading && !match) return header(<View className="px-4" testID="match-detail"><SkeletonList count={3} height={120} /></View>);
    if (error && !match) return header(<View testID="match-detail"><ErrorState onRetry={refetch} /></View>);
    if (!match) {
        return header(
            <View testID="match-detail" className="items-center py-16 px-6">
                <Ionicons name="alert-circle-outline" size={32} color="#9ca3af" />
                <Text className="text-[15px] font-semibold text-gray-700 dark:text-cyber-text mt-2">{t('tournaments.match.notFound')}</Text>
                <Pressable
                    onPress={() => (id ? router.replace(`/tournaments/${id}` as any) : router.back())}
                    accessibilityRole="button"
                    className="mt-4 px-5 rounded-full border border-gray-300 dark:border-cyber-border items-center justify-center"
                    style={{ minHeight: 44 }}
                >
                    <Text className="text-gray-800 dark:text-cyber-text font-semibold">{t('tournaments.view.backToTournament')}</Text>
                </Pressable>
            </View>
        );
    }

    const m = match;
    const winner = matchWinner(m);
    const played = m.status === 'FINISHED' || m.status === 'FORFEIT' || m.status === 'LIVE';
    const sets = played && m.details?.sets && m.details.sets.length > 0 ? m.details.sets : undefined;
    const stage = stages.find((s) => s.id === m.stageId);
    const myTeamId = tournament?.myTeam?.id;
    const mine = !!myTeamId && (m.home.teamId === myTeamId || m.away.teamId === myTeamId);
    const bracketRound = bracketStages.flatMap((s) => s.rounds).find((r) => r.matches.some((x) => x.id === m.id));
    const rk = bracketRoundKey(bracketRound?.name);
    const roundName = rk ? (t(rk.key, rk.params as any) as string) : m.round != null && stage?.type !== 'KNOCKOUT' ? (t('tournaments.schedule.round', { n: m.round }) as string) : '';
    const caption = [t('tournaments.match.number', { n: m.number }), stage?.name, m.groupId ? groupNames[m.groupId] : '', roundName].filter(Boolean).join(' · ');
    const forfeitLoser: Side | null = m.status === 'FORFEIT' && winner ? (winner === 'home' ? 'away' : 'home') : null;
    const cancelled = m.status === 'CANCELLED';
    const calUrl = m.scheduledAt && mine && (m.status === 'SCHEDULED' || m.status === 'LIVE')
        ? calendarUrl(m, `${m.home.team?.name ?? ''} - ${m.away.team?.name ?? ''}`, m.courtLabel ?? undefined)
        : null;

    // Path context: the match this one feeds (winner / loser).
    const feeds = (type: 'WINNER_OF' | 'LOSER_OF') =>
        matches.find((x) => [x.home, x.away].some((s) => s.source && 'matchId' in s.source && s.source.type === type && s.source.matchId === m.id));
    const winnerNext = feeds('WINNER_OF');
    const loserNext = feeds('LOSER_OF');
    const nextRoundName = (n: TournamentMatch) => {
        const r = bracketStages.flatMap((s) => s.rounds).find((x) => x.matches.some((y) => y.id === n.id));
        const k = bracketRoundKey(r?.name);
        return k ? (t(k.key, k.params as any) as string) : '';
    };
    const otherSlot = (n: TournamentMatch): MatchSlot => ([n.home, n.away].find((s) => !(s.source && 'matchId' in s.source && s.source.matchId === m.id)) ?? n.home);
    const slotText = (s: MatchSlot) => (s.team ? s.team.name : '');
    const openMatch = (x: TournamentMatch) => router.push(`/tournaments/${id}/matches/${x.id}` as any);

    const side = (s: Side) => (
        <View className="flex-1 items-center px-1" style={{ minWidth: 0 }}>
            <SlotLabel slot={m[s]} numberById={numberById} groupNames={groupNames} size={40} lines={2} bold={winner === s} muted={winner != null && winner !== s} strike={cancelled} />
            {forfeitLoser === s ? <Text className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">{t('tournaments.match.forfeitLoser')}</Text> : null}
        </View>
    );

    const share = () => {
        const text = `${m.home.team?.name ?? ''} ${played ? `${m.homeScore}:${m.awayScore}` : 'vs'} ${m.away.team?.name ?? ''} · ${tournament?.title ?? ''}`.trim();
        void Share.share({ message: text });
    };

    return header(
        <ScrollView testID="match-detail" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <UpdatedCue visible={updated} />
            <View className="rounded-3xl bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border overflow-hidden mt-2">
                <View style={{ height: 4, backgroundColor: theme.base }} />
                <View className="p-4">
                    <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-semibold text-gray-500 dark:text-cyber-muted flex-1" numberOfLines={2}>{caption}</Text>
                        <MatchStatusChip status={m.status} />
                    </View>
                    {m.scheduledAt ? (
                        <Text className={`text-[13px] text-gray-700 dark:text-cyber-text mt-1 ${m.status === 'POSTPONED' ? 'line-through' : ''}`}>
                            {fmtDateTime(m.scheduledAt, lang)}
                            {deviceTzDiffers() ? ` · ${t('tournaments.israelTime')}` : ''}
                        </Text>
                    ) : null}
                    {m.courtLabel ? (
                        <View className="flex-row items-center mt-1">
                            <Ionicons name={TOURNAMENT_ICONS.court} size={13} color={dark ? '#9ca3af' : '#6b7280'} />
                            <Text className="text-[13px] text-gray-600 dark:text-cyber-muted ms-1">{m.courtLabel}</Text>
                        </View>
                    ) : null}
                    {m.status === 'POSTPONED' ? <Text className="text-xs text-amber-700 dark:text-amber-300 mt-1">{t('tournaments.match.newTimeTbd')}</Text> : null}

                    <View className="flex-row items-center mt-5" testID="match-detail-score">
                        {side('home')}
                        <ScoreCluster
                            size="lg"
                            testID="match-detail-score-cluster"
                            home={played ? m.homeScore : null}
                            away={played ? m.awayScore : null}
                            homePenalties={m.homePenalties}
                            awayPenalties={m.awayPenalties}
                            sets={sets}
                            winner={winner}
                            placeholder={fmtTime(m.scheduledAt, lang) || '–'}
                        />
                        {side('away')}
                    </View>
                    {played && m.homePenalties != null && m.awayPenalties != null ? (
                        <Text testID="match-detail-penalties" className="text-[13px] text-center text-gray-600 dark:text-cyber-muted mt-3">
                            {t('tournaments.match.penalties', { home: m.homePenalties, away: m.awayPenalties })}
                        </Text>
                    ) : null}
                </View>
            </View>

            {winnerNext || loserNext ? (
                <View className="mt-3">
                    {winnerNext ? (
                        <Pressable onPress={() => openMatch(winnerNext)} accessibilityRole="link" className="py-2" style={{ minHeight: 44 }}>
                            <Text className="text-[13px] text-brand-dark dark:text-brand-light font-semibold">
                                {t('tournaments.match.winnerAdvances', { round: nextRoundName(winnerNext), slot: slotText(otherSlot(winnerNext)) || t('tournaments.slot.tbd') })}
                            </Text>
                        </Pressable>
                    ) : null}
                    {loserNext ? (
                        <Pressable onPress={() => openMatch(loserNext)} accessibilityRole="link" className="py-2" style={{ minHeight: 44 }}>
                            <Text className="text-[13px] text-brand-dark dark:text-brand-light font-semibold">{t('tournaments.match.loserThird')}</Text>
                        </Pressable>
                    ) : null}
                </View>
            ) : null}

            <Text className="text-[13px] font-extrabold text-gray-700 dark:text-cyber-text mt-4 mb-2">{t('tournaments.view.rosters')}</Text>
            <Roster team={teams.find((x) => x.id === m.home.teamId)} />
            <Roster team={teams.find((x) => x.id === m.away.teamId)} />

            <View className="flex-row mt-3">
                {calUrl ? (
                    <Pressable
                        onPress={() => Linking.openURL(calUrl)}
                        accessibilityRole="button"
                        className="flex-row items-center px-4 rounded-full border border-gray-300 dark:border-cyber-border me-2"
                        style={{ minHeight: 44 }}
                    >
                        <Ionicons name={TOURNAMENT_ICONS.addToCalendar} size={16} color={dark ? '#f1f5f9' : '#374151'} />
                        <Text className="text-[13px] font-semibold text-gray-800 dark:text-cyber-text ms-1.5">{t('tournaments.match.addToCalendar')}</Text>
                    </Pressable>
                ) : null}
                <Pressable
                    onPress={share}
                    accessibilityRole="button"
                    accessibilityLabel={t('tournaments.share')}
                    className="flex-row items-center px-4 rounded-full border border-gray-300 dark:border-cyber-border"
                    style={{ minHeight: 44 }}
                >
                    <Ionicons name={TOURNAMENT_ICONS.share} size={16} color={dark ? '#f1f5f9' : '#374151'} />
                    <Text className="text-[13px] font-semibold text-gray-800 dark:text-cyber-text ms-1.5">{t('tournaments.share')}</Text>
                </Pressable>
            </View>
        </ScrollView>
    );
}
