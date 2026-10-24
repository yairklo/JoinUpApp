import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useStandings, useTournamentSchedule } from '@/hooks/useTournamentViews';
import type { TournamentMatch } from '@/types/tournament';
import MatchCard from '../MatchCard';
import StandingsTable from '../StandingsTable';
import { registrationWindowCopy } from '../shellUtils';
import { ltrIsolate, type Lang } from '../matchFormat';
import { ErrorState, SkeletonList } from './TabState';
import type { TournamentTabProps } from './ScheduleTab';

export interface OverviewTabProps extends TournamentTabProps {
    /** Switch the page to another tab (schedule / standings). */
    onGoTab: (tab: 'schedule' | 'standings') => void;
}

const OPEN = ['SCHEDULED', 'POSTPONED'];

function Section({ title, children, testID }: { title: string; children: React.ReactNode; testID?: string }) {
    return (
        <View testID={testID} className="mb-5">
            <Text accessibilityRole="header" className="text-[16px] font-extrabold text-gray-900 dark:text-cyber-text mb-2">
                {title}
            </Text>
            {children}
        </View>
    );
}

function Link({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
    return (
        <Pressable testID={testID} onPress={onPress} accessibilityRole="link" className="items-start justify-center" style={{ minHeight: 44 }}>
            <Text className="text-brand font-bold text-[14px]">{label}</Text>
        </Pressable>
    );
}

/**
 * Overview tab (spec 2.5): my next match, live matches, next 3 upcoming, standings snippet (top 4),
 * about / venue / rules summary, registration window. Sections with no data are omitted. The organizer
 * row is not rendered: the detail payload carries no organizer name (only `ownerId`).
 */
export default function OverviewTab({ tournamentId, canScore, onScoreMatch, onGoTab }: OverviewTabProps) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament } = useTournament(tournamentId);
    const withTables = tournament?.format === 'LEAGUE' || tournament?.format === 'GROUPS_KNOCKOUT';
    const { stages, matches, numberById, loading, error, refetch, changedMatchIds } = useTournamentSchedule(tournamentId);
    const standings = useStandings(withTables ? tournamentId : undefined);
    const myTeamId = tournament?.myTeam?.id ?? null;
    const scoring = !!canScore && tournament?.status === 'IN_PROGRESS';

    const groupNames = useMemo(() => {
        const o: Record<string, string> = {};
        for (const s of stages) for (const g of s.groups) o[g.id] = g.name;
        return o;
    }, [stages]);

    const { mine, live, upcoming } = useMemo(() => {
        const byTime = (a: TournamentMatch, b: TournamentMatch) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9');
        const open = matches.filter((m) => OPEN.includes(m.status)).sort(byTime);
        return {
            mine: myTeamId ? open.find((m) => m.home.teamId === myTeamId || m.away.teamId === myTeamId) ?? null : null,
            live: matches.filter((m) => m.status === 'LIVE').sort(byTime),
            upcoming: open.slice(0, 3),
        };
    }, [matches, myTeamId]);

    if (!tournament) return <View testID="overview-tab"><SkeletonList count={3} height={96} /></View>;
    if (loading && matches.length === 0 && !tournament.description) return <View testID="overview-tab"><SkeletonList count={3} height={96} /></View>;
    if (error && matches.length === 0 && !tournament.description) return <View testID="overview-tab"><ErrorState onRetry={refetch} error={error} /></View>;

    const card = (m: TournamentMatch, testID?: string) => (
        <MatchCard
            key={m.id}
            testID={testID}
            match={m}
            numberById={numberById}
            groupNames={groupNames}
            myTeamId={myTeamId}
            lang={lang}
            canScore={scoring}
            changed={changedMatchIds.includes(m.id)}
            onPress={(x) => router.push(`/tournaments/${tournamentId}/matches/${x.id}` as any)}
            onScore={onScoreMatch}
        />
    );

    const r = tournament.rules;
    const preStart = tournament.status === 'DRAFT' || tournament.status === 'REGISTRATION_OPEN' || tournament.status === 'REGISTRATION_CLOSED';
    const venue = tournament.customLocation;
    const registration = preStart ? registrationWindowCopy(tournament.registrationOpensAt, tournament.registrationClosesAt, lang) : null;
    const rtlText = { textAlign: 'right' as const, writingDirection: 'rtl' as const };

    return (
        <View testID="overview-tab">
            {mine ? <Section title={t('tournaments.overview.nextMatch')}>{card(mine, 'tournament-overview-next-match')}</Section> : null}
            {live.length > 0 ? <Section title={t('tournaments.overview.live')}>{live.map((m) => card(m))}</Section> : null}
            {upcoming.length > 0 ? (
                <Section title={t('tournaments.overview.upcoming')}>
                    {upcoming.map((m) => card(m))}
                    <Link testID="overview-full-schedule" label={t('tournaments.overview.fullSchedule')} onPress={() => onGoTab('schedule')} />
                </Section>
            ) : null}
            {withTables && standings.tables.length > 0 ? (
                <Section title={t('tournaments.tabs.standings')} testID="overview-standings">
                    {standings.tables.map((tb) => (
                        <StandingsTable
                            key={`${tb.stageId}:${tb.groupId ?? ''}`}
                            table={{ ...tb, rows: tb.rows.slice(0, 4) }}
                            myTeamId={myTeamId}
                            mode="compact"
                            showTitle={standings.tables.length > 1}
                        />
                    ))}
                    <Link testID="overview-full-table" label={t('tournaments.overview.fullTable')} onPress={() => onGoTab('standings')} />
                </Section>
            ) : null}

            <Section title={t('tournaments.overview.about')} testID="overview-about">
                {tournament.description ? (
                    <Text className="text-[14px] leading-5 text-gray-800 dark:text-cyber-text mb-3">{tournament.description}</Text>
                ) : null}
                {venue || tournament.fieldId ? (
                    <View className="mb-3">
                        <Text className="text-[12px] font-bold text-gray-500 dark:text-cyber-muted">{t('tournaments.overview.venue')}</Text>
                        {tournament.fieldId ? (
                            <Pressable onPress={() => router.push(`/field/${tournament.fieldId}` as any)} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                                <Text className="text-brand font-semibold text-[14px]">{venue ?? t('tournaments.overview.venue')}</Text>
                            </Pressable>
                        ) : (
                            <Text className="text-[14px] text-gray-800 dark:text-cyber-text">{venue}</Text>
                        )}
                    </View>
                ) : null}
                {r || tournament.startersPerTeam ? (
                    <View className="rounded-2xl bg-white dark:bg-cyber-card border border-gray-100 dark:border-cyber-border p-3" testID="overview-rules">
                        <Text className="text-[13px] font-extrabold text-gray-900 dark:text-cyber-text mb-1">{t('tournaments.overview.rules')}</Text>
                        {r?.points ? (
                            <Text className="text-[13px] text-gray-700 dark:text-cyber-text" style={rtlText}>
                                {t('tournaments.overview.pointsLine', {
                                    win: ltrIsolate(String(r.points.win)),
                                    draw: ltrIsolate(String(r.points.draw)),
                                    loss: ltrIsolate(String(r.points.loss)),
                                })}
                            </Text>
                        ) : null}
                        <Text className="text-[13px] text-gray-700 dark:text-cyber-text" style={rtlText}>
                            {t('tournaments.overview.rosterLine', {
                                starters: ltrIsolate(String(tournament.startersPerTeam ?? '')),
                                range: ltrIsolate(`${tournament.minPlayersPerTeam ?? ''}–${tournament.maxPlayersPerTeam ?? ''}`),
                            })}
                        </Text>
                    </View>
                ) : null}
            </Section>

            {registration ? (
                <Section title={t('tournaments.overview.registration')} testID="overview-registration">
                    <Text className="text-[14px] text-gray-800 dark:text-cyber-text" style={rtlText}>
                        {t(registration.key, registration.values)}
                    </Text>
                    {tournament.requireApproval ? (
                        <Text className="text-[12px] text-gray-500 dark:text-cyber-muted mt-1">{t('tournaments.overview.approvalNote')}</Text>
                    ) : null}
                </Section>
            ) : null}
        </View>
    );
}
