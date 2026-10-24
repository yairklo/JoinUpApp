import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTournament } from '@/hooks/useTournament';
import { useTournamentSchedule } from '@/hooks/useTournamentViews';
import type { TournamentMatch } from '@/types/tournament';
import MatchCard from '../MatchCard';
import { dayKey, fmtDayChip, fmtDayHeader, type Lang } from '../matchFormat';
import { EmptyState, ErrorState, Pill, SkeletonList } from './TabState';

export interface TournamentTabProps {
    tournamentId: string;
    /** Viewer may enter scores (page shell passes `capabilities.canScore`). */
    canScore?: boolean;
    /** Opens the score entry sheet (built by the manage/score surface). */
    onScoreMatch?: (match: TournamentMatch) => void;
}

type StatusFilter = 'all' | 'live' | 'upcoming' | 'finished';

const LIVE = ['LIVE'];
const DONE = ['FINISHED', 'FORFEIT'];

function matchesStatus(m: TournamentMatch, f: StatusFilter) {
    if (f === 'all') return true;
    if (f === 'live') return LIVE.includes(m.status);
    if (f === 'finished') return DONE.includes(m.status);
    return m.status === 'SCHEDULED' || m.status === 'POSTPONED';
}

/**
 * Schedule tab (spec 7): day chips, "my team" toggle, status pills; matches grouped by day (or by
 * round/stage when everything is on one day) as `MatchCard`s. Tapping a card opens the match
 * detail; the score button shows only for `canScore` while the tournament is IN_PROGRESS.
 */
export default function ScheduleTab({ tournamentId, canScore, onScoreMatch }: TournamentTabProps) {
    const { t, i18n } = useTranslation();
    const router = useRouter();
    const lang: Lang = i18n.language?.startsWith('en') ? 'en' : 'he';
    const { tournament } = useTournament(tournamentId);
    const { stages, matches, numberById, loading, error, refetch, changedMatchIds } = useTournamentSchedule(tournamentId);
    const myTeamId = tournament?.myTeam?.id ?? null;
    const [mine, setMine] = useState<boolean | null>(null);
    const [day, setDay] = useState<string | null>(null);
    const [status, setStatus] = useState<StatusFilter>('all');
    const showMine = mine ?? !!myTeamId;
    const scoring = !!canScore && tournament?.status === 'IN_PROGRESS';

    const groupNames = useMemo(() => {
        const o: Record<string, string> = {};
        for (const s of stages) for (const g of s.groups) o[g.id] = g.name;
        return o;
    }, [stages]);
    const stageById = useMemo(() => Object.fromEntries(stages.map((s) => [s.id, s])), [stages]);

    const days = useMemo(() => {
        const set = new Map<string, string>();
        for (const m of matches) if (m.scheduledAt) set.set(dayKey(m.scheduledAt), m.scheduledAt);
        return [...set.entries()].sort(([a], [b]) => a.localeCompare(b));
    }, [matches]);

    // Default day: today when it is a match day, else the first upcoming day, else "all".
    const today = dayKey(new Date().toISOString());
    const defaultDay = days.find(([k]) => k === today)?.[0] ?? days.find(([k]) => k > today)?.[0] ?? null;
    const activeDay = day === '' ? null : (day ?? defaultDay);

    const stageLabel = useCallback(
        (m: TournamentMatch) => {
            const st = m.stageId ? stageById[m.stageId] : undefined;
            const g = m.groupId ? groupNames[m.groupId] : undefined;
            const r = m.round != null && st?.type !== 'KNOCKOUT' ? t('tournaments.schedule.round', { n: m.round }) : '';
            return [g ?? st?.name, r].filter(Boolean).join(' · ');
        },
        [stageById, groupNames, t]
    );

    const filtered = useMemo(
        () =>
            matches
                .filter((m) => (showMine && myTeamId ? m.home.teamId === myTeamId || m.away.teamId === myTeamId : true))
                .filter((m) => matchesStatus(m, status))
                .filter((m) => (activeDay ? dayKey(m.scheduledAt) === activeDay : true))
                .sort((a, b) => (a.scheduledAt ?? '9').localeCompare(b.scheduledAt ?? '9') || a.number - b.number),
        [matches, showMine, myTeamId, status, activeDay]
    );

    const groups = useMemo(() => {
        const byKey = new Map<string, { key: string; header: string; items: TournamentMatch[] }>();
        const single = new Set(filtered.map((m) => dayKey(m.scheduledAt))).size <= 1;
        for (const m of filtered) {
            const key = single ? `r:${m.stageId}:${m.groupId}:${m.round}` : `d:${dayKey(m.scheduledAt)}`;
            if (!byKey.has(key)) {
                const header = single
                    ? stageLabel(m) || (m.scheduledAt ? fmtDayHeader(m.scheduledAt, lang) : '')
                    : m.scheduledAt
                      ? fmtDayHeader(m.scheduledAt, lang)
                      : t('tournaments.slot.tbd');
                byKey.set(key, { key, header, items: [] });
            }
            byKey.get(key)!.items.push(m);
        }
        return [...byKey.values()];
    }, [filtered, lang, stageLabel, t]);

    const open = useCallback((m: TournamentMatch) => router.push(`/tournaments/${tournamentId}/matches/${m.id}` as any), [router, tournamentId]);
    const clear = () => {
        setMine(false);
        setDay('');
        setStatus('all');
    };

    if (loading && matches.length === 0) return <View testID="schedule-tab"><SkeletonList count={4} /></View>;
    if (error && matches.length === 0) return <View testID="schedule-tab"><ErrorState onRetry={refetch} error={error} /></View>;
    if (matches.length === 0) {
        return (
            <View testID="schedule-tab">
                <EmptyState testID="schedule-empty" icon="calendar-outline" text={t('tournaments.schedule.emptyViewer')} />
            </View>
        );
    }

    const statusPills: StatusFilter[] = ['all', 'live', 'upcoming', 'finished'];
    return (
        <View testID="schedule-tab">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-1">
                {days.length > 1 ? <Pill testID="schedule-day-all" label={t('tournaments.schedule.all')} selected={!activeDay} onPress={() => setDay('')} /> : null}
                {days.length > 1
                    ? days.map(([k, iso]) => (
                          <Pill key={k} testID={`schedule-day-${k}`} label={fmtDayChip(iso, lang)} selected={activeDay === k} onPress={() => setDay(k)} />
                      ))
                    : null}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
                {myTeamId ? <Pill testID="schedule-filter-mine" label={t('tournaments.schedule.myTeam')} selected={showMine} onPress={() => setMine(!showMine)} /> : null}
                {statusPills.map((s) => (
                    <Pill key={s} testID={`schedule-filter-status-${s}`} label={t(`tournaments.schedule.${s}`)} selected={status === s} onPress={() => setStatus(s)} />
                ))}
            </ScrollView>

            {groups.length === 0 ? (
                <EmptyState testID="schedule-empty" icon="funnel-outline" text={t('tournaments.schedule.emptyFiltered')} actionLabel={t('tournaments.clearFilters')} onAction={clear} />
            ) : (
                groups.map((g) => (
                    <View key={g.key} className="mb-2">
                        <Text accessibilityRole="header" className="text-[13px] font-extrabold text-gray-700 dark:text-cyber-text mb-2 mt-1">
                            {g.header}
                        </Text>
                        {g.items.map((m) => (
                            <MatchCard
                                key={m.id}
                                match={m}
                                numberById={numberById}
                                groupNames={groupNames}
                                stageLabel={stageLabel(m)}
                                myTeamId={myTeamId}
                                lang={lang}
                                canScore={scoring}
                                changed={changedMatchIds.includes(m.id)}
                                onPress={open}
                                onScore={onScoreMatch}
                            />
                        ))}
                    </View>
                ))
            )}
        </View>
    );
}
