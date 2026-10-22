import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTeamDecisions } from '@/hooks/useTournamentMutations';
import { useTournamentTeams } from '@/hooks/useTournamentViews';
import { useTeamMutations } from '@/hooks/useTournamentMutations';
import { tournamentErrorKey, tournamentErrorParams } from '@/utils/tournamentErrors';
import type { TeamDecision, TeamStatus, TournamentDetail, TournamentTeam } from '@/types/tournament';
import { UpdatedCue } from '../UpdatedCue';
import QueueTeamCard from './QueueTeamCard';

type Segment = 'PENDING' | 'APPROVED' | 'WAITLISTED' | 'CLOSED';
const SEGMENTS: { id: Segment; key: string }[] = [
    { id: 'PENDING', key: 'tournaments.manage.queue.pending' },
    { id: 'APPROVED', key: 'tournaments.manage.queue.approved' },
    { id: 'WAITLISTED', key: 'tournaments.manage.queue.waitlist' },
    { id: 'CLOSED', key: 'tournaments.manage.queue.closed' },
];
const inSegment = (s: TeamStatus, seg: Segment) => (seg === 'CLOSED' ? s === 'REJECTED' || s === 'WITHDRAWN' : s === seg);

interface Props {
    tournament: TournamentDetail;
}

/** Teams queue container (spec 11.1): segments, approve / waitlist / reject with confirms, seeding order. */
export default function TeamsQueue({ tournament }: Props) {
    const { t } = useTranslation();
    // Managers get every status from the unfiltered list.
    const q = useTournamentTeams(tournament.id);
    const decisions = useTeamDecisions(tournament.id);
    const teamMut = useTeamMutations(tournament.id);
    const min = tournament.minPlayersPerTeam;
    const max = tournament.maxPlayersPerTeam;

    const counts = useMemo(() => {
        const c: Record<Segment, number> = { PENDING: 0, APPROVED: 0, WAITLISTED: 0, CLOSED: 0 };
        q.teams.forEach((tm) => SEGMENTS.forEach((s) => inSegment(tm.status, s.id) && (c[s.id] += 1)));
        return c;
    }, [q.teams]);

    const [segment, setSegment] = useState<Segment>('PENDING');
    const [picked, setPicked] = useState(false);
    useEffect(() => {
        // Default to "pending" when there are some, otherwise approved (once, after the first load).
        if (!picked && !q.loading) {
            setSegment(counts.PENDING > 0 ? 'PENDING' : 'APPROVED');
            setPicked(true);
        }
    }, [q.loading, counts.PENDING, picked]);

    const [busyId, setBusyId] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [errorText, setErrorText] = useState<string | null>(null);
    const [seeding, setSeeding] = useState(false);
    const [order, setOrder] = useState<string[]>([]);

    const list = q.teams.filter((tm) => inSegment(tm.status, segment));
    const nameOf = (id: string) => q.teams.find((x) => x.id === id)?.name ?? '';
    const actionsFor = (s: TeamStatus): TeamDecision[] =>
        s === 'PENDING' ? ['APPROVE', 'WAITLIST', 'REJECT'] : s === 'APPROVED' ? ['WAITLIST', 'REJECT'] : s === 'WAITLISTED' ? ['APPROVE', 'REJECT'] : [];

    const mapErr = (err: any) => {
        if (!err?.code && !err?.status) return t('resultEditor.offline') as string;
        const key = tournamentErrorKey(err);
        return key ? (t(key, { min, ...tournamentErrorParams(err) }) as string) : (t('tournaments.manage.queue.failed') as string);
    };

    const run = async (team: TournamentTeam, d: TeamDecision) => {
        setBusyId(team.id);
        setErrorText(null);
        setMessage(null);
        try {
            const res = await decisions.decide(team.id, d);
            if (res.promotedTeamIds?.length) setMessage(t('tournaments.manage.queue.promoted', { team: nameOf(res.promotedTeamIds[0]) }) as string);
            await q.refetch();
        } catch (err) {
            setErrorText(mapErr(err));
        } finally {
            setBusyId(null);
        }
    };

    const decide = (team: TournamentTeam, d: TeamDecision) => {
        if (d === 'APPROVE' && team.memberCount < min) {
            setErrorText(t('tournaments.errors.ROSTER_INVALID', { min }) as string);
            return;
        }
        if (d === 'REJECT') {
            Alert.alert(t('tournaments.manage.queue.reject') as string, t('tournaments.manage.queue.rejectConfirm', { team: team.name }) as string, [
                { text: t('common.cancel') as string, style: 'cancel' },
                { text: t('tournaments.manage.queue.reject') as string, style: 'destructive', onPress: () => run(team, d) },
            ]);
            return;
        }
        void run(team, d);
    };

    // ---- seeding (KNOCKOUT or manual seeding; approved teams)
    const canSeed = (tournament.format === 'KNOCKOUT' || tournament.rules?.seeding === 'MANUAL') && tournament.status !== 'IN_PROGRESS' && tournament.status !== 'COMPLETED';
    const approved = useMemo(
        () => q.teams.filter((x) => x.status === 'APPROVED').sort((a, b) => (a.seed ?? 9999) - (b.seed ?? 9999) || a.name.localeCompare(b.name)),
        [q.teams]
    );
    const startSeeding = () => {
        setOrder(approved.map((x) => x.id));
        setSeeding(true);
        setErrorText(null);
    };
    const move = (i: number, d: -1 | 1) =>
        setOrder((o) => {
            const next = [...o];
            const j = i + d;
            if (j < 0 || j >= next.length) return o;
            [next[i], next[j]] = [next[j], next[i]];
            return next;
        });
    const shuffle = () =>
        setOrder((o) => {
            const next = [...o];
            for (let i = next.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [next[i], next[j]] = [next[j], next[i]];
            }
            return next;
        });
    const saveSeeding = async () => {
        setBusyId('seeding');
        setErrorText(null);
        try {
            for (let i = 0; i < order.length; i++) {
                const tm = approved.find((x) => x.id === order[i]);
                if (tm && tm.seed !== i + 1) await teamMut.updateTeam(order[i], { seed: i + 1 });
            }
            setSeeding(false);
            await q.refetch();
        } catch (err) {
            setErrorText(mapErr(err));
        } finally {
            setBusyId(null);
        }
    };

    if (q.loading && q.teams.length === 0) {
        return (
            <View className="py-16 items-center" testID="manage-section-teams-loading">
                <ActivityIndicator color="#059669" />
            </View>
        );
    }

    const captainName = (tm: TournamentTeam) => tm.members?.find((m) => m.userId === tm.captainId)?.name;
    const seedTeams = order.map((id) => approved.find((x) => x.id === id)).filter((x): x is TournamentTeam => !!x);

    return (
        <View className="flex-1" testID="manage-section-teams">
            <UpdatedCue visible={q.updated} />
            {!seeding ? (
                <View className="px-4 pt-3">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        {SEGMENTS.map((s) => {
                            const sel = segment === s.id;
                            return (
                                <Pressable
                                    key={s.id}
                                    testID={`queue-segment-${s.id}`}
                                    onPress={() => setSegment(s.id)}
                                    accessibilityRole="tab"
                                    accessibilityState={{ selected: sel }}
                                    style={{ minHeight: 40 }}
                                    className={`px-4 rounded-full items-center justify-center ${sel ? 'bg-brand' : 'bg-gray-100 dark:bg-cyber-card'}`}
                                >
                                    <Text className={`font-bold text-sm ${sel ? 'text-white' : 'text-gray-700 dark:text-cyber-text'}`}>
                                        {s.id === 'PENDING' ? t(s.key, { count: counts.PENDING }) : `${t(s.key)} · ${counts[s.id]}`}
                                    </Text>
                                </Pressable>
                            );
                        })}
                    </ScrollView>
                </View>
            ) : null}
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
                {message ? (
                    <View accessibilityLiveRegion="polite" className="rounded-xl bg-brand-mist dark:bg-brand-ink p-3 mb-3">
                        <Text className="font-semibold text-brand-dark dark:text-brand-light">{message}</Text>
                    </View>
                ) : null}
                {errorText ? (
                    <View accessibilityRole="alert" className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 p-3 mb-3">
                        <Text className="text-red-700 dark:text-red-300">{errorText}</Text>
                    </View>
                ) : null}

                {seeding ? (
                    <>
                        <Text className="font-extrabold text-gray-900 dark:text-cyber-text mb-2">{t('tournaments.manage.seeding')}</Text>
                        {seedTeams.map((tm, i) => (
                            <QueueTeamCard
                                key={tm.id}
                                team={tm}
                                captainName={captainName(tm)}
                                min={min}
                                max={max}
                                actions={[]}
                                onDecide={() => {}}
                                seed={{ index: i, canUp: i > 0, canDown: i < seedTeams.length - 1, onUp: () => move(i, -1), onDown: () => move(i, 1) }}
                            />
                        ))}
                    </>
                ) : list.length === 0 ? (
                    <View className="py-12 items-center" testID="queue-empty">
                        <Text className="text-gray-500 dark:text-cyber-muted text-center">{t('tournaments.manage.queue.empty')}</Text>
                    </View>
                ) : (
                    <>
                        {segment === 'APPROVED' && canSeed && approved.length > 1 ? (
                            <Pressable
                                testID="seeding-mode"
                                onPress={startSeeding}
                                accessibilityRole="button"
                                style={{ minHeight: 44 }}
                                className="mb-3 rounded-xl border border-gray-300 dark:border-cyber-border items-center justify-center"
                            >
                                <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.manage.seeding')}</Text>
                            </Pressable>
                        ) : null}
                        {list.map((tm) => (
                            <QueueTeamCard
                                key={tm.id}
                                team={tm}
                                captainName={captainName(tm)}
                                min={min}
                                max={max}
                                actions={actionsFor(tm.status)}
                                busy={busyId === tm.id}
                                onDecide={(d) => decide(tm, d)}
                                approveBlockedHint={tm.status === 'PENDING' && tm.memberCount < min ? (t('tournaments.errors.ROSTER_INVALID', { min }) as string) : null}
                            />
                        ))}
                    </>
                )}
            </ScrollView>
            {seeding ? (
                <View className="px-4 pt-2 pb-3 border-t border-gray-200 dark:border-cyber-border bg-gray-50 dark:bg-cyber-bg flex-row" style={{ gap: 8 }}>
                    <Pressable onPress={shuffle} accessibilityRole="button" style={{ height: 52 }} className="flex-1 rounded-2xl border border-gray-300 dark:border-cyber-border items-center justify-center">
                        <Text className="font-bold text-gray-800 dark:text-cyber-text">{t('tournaments.manage.seedingRandom')}</Text>
                    </Pressable>
                    <Pressable
                        testID="seeding-save"
                        onPress={saveSeeding}
                        disabled={busyId === 'seeding'}
                        accessibilityRole="button"
                        style={{ height: 52, opacity: busyId === 'seeding' ? 0.6 : 1 }}
                        className="flex-[2] rounded-2xl bg-brand items-center justify-center"
                    >
                        <Text className="font-extrabold text-white">{t('tournaments.manage.seedingSave')}</Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}
